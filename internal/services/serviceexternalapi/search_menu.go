package serviceexternalapi

import (
	"cmp"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/wowspec"
)

type searchNode = instancesearch.Node

// Menu bounds: a few fetches build a complex query without a huge page.
const (
	menuTopValues     = 5
	menuMaxBosses     = 8
	menuMaxRemoveLink = 10
	// menuNarrowBudget bounds the narrow-by links in bytes. With the result
	// table, the remove links and the user link, a page stays near
	// maxAgentViewBytes even for a query at searchMaxQueryLen.
	menuNarrowBudget = 32 << 10
)

// menuClasses are the classes offered by "narrow by class", in the order
// players know them.
var menuClasses = []string{"WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID"}

// menuSubSpecs are the specs with sub-specs (see player.sub_spec).
var menuSubSpecs = map[string][]string{
	"Feral":       {"Bear", "Cat"},
	"Enhancement": {"Tank", "DPS"},
	"Fury":        {"Fury Prot"},
}

// celText renders a tree as one-line search text for ?q=.
func celText(n *searchNode) string {
	return strings.ReplaceAll(instancesearch.FormatCEL(n), "\n", " ")
}

// conjuncts splits a search into its top-level AND parts.
func conjuncts(n *searchNode) []searchNode {
	if n == nil {
		return nil
	}
	if n.And == nil {
		return []searchNode{*n}
	}
	var out []searchNode
	for i := range n.And {
		out = append(out, conjuncts(&n.And[i])...)
	}
	return out
}

func andOf(parts []searchNode) *searchNode {
	switch len(parts) {
	case 0:
		return nil
	case 1:
		return &parts[0]
	}
	return &searchNode{And: parts}
}

func with(parts []searchNode, add searchNode) []searchNode {
	return append(slices.Clone(parts), add)
}

func without(parts []searchNode, i int) []searchNode {
	return slices.Delete(slices.Clone(parts), i, i+1)
}

func pred(field string, op chroniclesdk.InstanceSearchOp, value any) searchNode {
	return searchNode{Field: field, Op: op, Value: value}
}

// pinned reports whether a top-level part filters on one of fields.
func pinned(parts []searchNode, fields ...string) bool {
	return slices.ContainsFunc(parts, func(n searchNode) bool { return slices.Contains(fields, n.Field) })
}

// pinnedValue is the value of a top-level field == "value" part.
func pinnedValue(parts []searchNode, field string) string {
	for _, n := range parts {
		if v, ok := n.Value.(string); ok && n.Field == field && n.Op == chroniclesdk.InstanceSearchOpEq {
			return v
		}
	}
	return ""
}

// searchMenu ends a keyed markdown search with links that each add one
// filter, links that remove one, and a plain search link for the user. Link
// following clients that can't build URLs reach complex searches this way.
func (s *Service) searchMenu(r *http.Request, where *searchNode, results []chroniclesdk.InstanceSearchResult) string {
	ctx := r.Context()
	origin := requestOrigin(r)
	base := r.URL.Query()
	for _, k := range []string{"q", "where", "cursor", chroniclesdk.AIKeyQueryParam} {
		base.Del(k)
	}
	base.Set("format", "md")
	link := func(parts []searchNode) string {
		v := url.Values{}
		for k, vs := range base {
			v[k] = slices.Clone(vs)
		}
		if n := andOf(parts); n != nil {
			q := celText(n)
			if len(q) > searchMaxQueryLen {
				return "" // the search would be rejected as too long
			}
			v.Set("q", q)
		}
		return aikey.Link(ctx, origin+r.URL.Path+"?"+v.Encode())
	}

	parts := conjuncts(where)
	type section struct {
		title string
		items [][2]string
	}
	var sections []section
	add := func(title string, items [][2]string) {
		items = slices.DeleteFunc(items, func(item [2]string) bool { return item[1] == "" })
		if len(items) > 0 {
			sections = append(sections, section{title, items})
		}
	}
	top := func(get func(chroniclesdk.InstanceSearchResult) string) []string {
		counts := map[string]int{}
		for _, res := range results {
			if v := get(res); v != "" {
				counts[v]++
			}
		}
		values := make([]string, 0, len(counts))
		for v := range counts {
			values = append(values, v)
		}
		slices.SortFunc(values, func(a, b string) int { return cmp.Or(counts[b]-counts[a], strings.Compare(a, b)) })
		return values[:min(len(values), menuTopValues)]
	}
	each := func(values []string, label string, node func(string) searchNode) [][2]string {
		items := make([][2]string, 0, len(values))
		for _, v := range values {
			items = append(items, [2]string{fmt.Sprintf(label, v), link(with(parts, node(v)))})
		}
		return items
	}

	zone := pinnedValue(parts, "instance.name")
	if !pinned(parts, "instance.name") {
		add("Zone", each(top(func(r chroniclesdk.InstanceSearchResult) string { return r.Name }), "Zone: %s",
			func(v string) searchNode { return pred("instance.name", chroniclesdk.InstanceSearchOpEq, v) }))
	}
	hasEncounters := slices.ContainsFunc(parts, func(n searchNode) bool { return n.AnyEncounter != nil || n.CountEncounters != nil })
	if zone != "" && !hasEncounters {
		var items [][2]string
		for _, boss := range s.menuBosses(r, zone, results) {
			killed := searchNode{AnyEncounter: &searchNode{And: []searchNode{
				pred("encounter.name", chroniclesdk.InstanceSearchOpEq, boss), pred("encounter.killed", chroniclesdk.InstanceSearchOpEq, true)}}}
			wiped := searchNode{AnyEncounter: &searchNode{And: []searchNode{
				pred("encounter.name", chroniclesdk.InstanceSearchOpEq, boss), pred("encounter.outcome", chroniclesdk.InstanceSearchOpEq, "wipe")}}}
			items = append(items, [2]string{"Killed " + boss, link(with(parts, killed))}, [2]string{"Wiped on " + boss, link(with(parts, wiped))})
		}
		add("Boss (kill or wipe)", items)
	}
	if !hasEncounters {
		bossWipe := searchNode{AnyEncounter: &searchNode{And: []searchNode{
			pred("encounter.boss", chroniclesdk.InstanceSearchOpEq, true), pred("encounter.outcome", chroniclesdk.InstanceSearchOpEq, "wipe")}}}
		add("Outcome", [][2]string{{"Had a boss wipe", link(with(parts, bossWipe))}})
	}

	add("Players", s.playerMenu(parts, link))

	if !pinned(parts, "instance.guild", "instance.guild_id") {
		add("Guild", each(top(func(r chroniclesdk.InstanceSearchResult) string { return r.GuildName }), "Guild: %s",
			func(v string) searchNode { return pred("instance.guild", chroniclesdk.InstanceSearchOpEq, v) }))
	}
	if !pinned(parts, "instance.realm", "instance.realm_id") {
		add("Realm", each(top(func(r chroniclesdk.InstanceSearchResult) string { return r.RealmName }), "Realm: %s",
			func(v string) searchNode { return pred("instance.realm", chroniclesdk.InstanceSearchOpEq, v) }))
	}
	if !pinned(parts, "instance.started_at") {
		today := time.Now().UTC().Truncate(24 * time.Hour)
		var items [][2]string
		for _, days := range []int{7, 30, 90} {
			since := pred("instance.started_at", chroniclesdk.InstanceSearchOpGte, today.AddDate(0, 0, -days).Format(time.RFC3339))
			items = append(items, [2]string{fmt.Sprintf("Last %d days", days), link(with(parts, since))})
		}
		add("Date", items)
	}
	if !pinned(parts, "instance.clear_parse") {
		var items [][2]string
		for _, score := range []int{75, 90, 95} {
			items = append(items, [2]string{fmt.Sprintf("Clear-time parse %d+", score), link(with(parts, pred("instance.clear_parse", chroniclesdk.InstanceSearchOpGte, score)))})
		}
		add("Clear speed", items)
	}

	var b strings.Builder
	b.WriteString("\n## Narrow by (each link adds one filter)\n\n")
	if len(sections) == 0 {
		b.WriteString("Nothing left to add from here.\n")
	}
	// Each link repeats the whole query, so a long query makes a long menu.
	// Stop adding narrow-by links once they pass the budget.
	narrowStart, omitted := b.Len(), false
	for _, sec := range sections {
		var lines strings.Builder
		for _, item := range sec.items {
			line := "- " + markdownLink(item[0], item[1]) + "\n"
			if b.Len()-narrowStart+lines.Len()+len(line) > menuNarrowBudget {
				omitted = true
				continue
			}
			lines.WriteString(line)
		}
		if lines.Len() > 0 {
			_, _ = fmt.Fprintf(&b, "%s:\n%s\n", sec.title, lines.String())
		}
	}
	if omitted {
		b.WriteString("More filters were left out to keep this page small. Remove a filter to see them.\n\n")
	}
	if len(parts) > 0 {
		b.WriteString("## Remove a filter\n\n")
		var items [][2]string
		for i := range parts[:min(len(parts), menuMaxRemoveLink)] {
			if u := link(without(parts, i)); u != "" {
				items = append(items, [2]string{"Remove " + celText(&parts[i]), u})
			}
		}
		linkList(&b, items)
		b.WriteString("\n")
	}
	b.WriteString("## For the user\n\n")
	linkList(&b, [][2]string{{"Open this search in Chronicle", userSearchLink(origin, andOf(parts))}})
	b.WriteString("\nThe same raid uploaded by several people appears once per upload, so neighbouring rows can be one raid.\n")
	return b.String()
}

// playerMenu narrows by class, then within that class by spec, sub-spec,
// role and parse, all on the same player.
func (*Service) playerMenu(parts []searchNode, link func([]searchNode) string) [][2]string {
	i := slices.IndexFunc(parts, func(n searchNode) bool { return n.AnyPlayer != nil })
	if i < 0 {
		items := make([][2]string, 0, len(menuClasses))
		for _, class := range menuClasses {
			n := searchNode{AnyPlayer: &searchNode{And: []searchNode{pred("player.class", chroniclesdk.InstanceSearchOpEq, class)}}}
			items = append(items, [2]string{"Has a " + titleCase(strings.ToLower(class)), link(with(parts, n))})
		}
		return items
	}
	player := conjuncts(parts[i].AnyPlayer)
	narrow := func(label string, p searchNode) [2]string {
		next := slices.Clone(parts)
		next[i] = searchNode{AnyPlayer: &searchNode{And: with(player, p)}}
		return [2]string{label, link(next)}
	}
	var items [][2]string
	class := pinnedValue(player, "player.class")
	spec := pinnedValue(player, "player.spec")
	if class != "" && !pinned(player, "player.spec") {
		for _, tree := range wowspec.TreeNames(class) {
			if tree != "" {
				items = append(items, narrow("Same player is "+tree, pred("player.spec", chroniclesdk.InstanceSearchOpEq, tree)))
			}
		}
	}
	if subs := menuSubSpecs[spec]; len(subs) > 0 && !pinned(player, "player.sub_spec") {
		for _, sub := range subs {
			items = append(items, narrow("Same player plays "+sub, pred("player.sub_spec", chroniclesdk.InstanceSearchOpEq, sub)))
		}
	}
	if !pinned(player, "player.role") {
		for _, role := range []string{"tank", "heal", "dps"} {
			items = append(items, narrow("Same player's role is "+role, pred("player.role", chroniclesdk.InstanceSearchOpEq, role)))
		}
	}
	if !pinned(player, "player.parse") {
		for _, score := range []int{75, 90, 95, 99} {
			items = append(items, narrow(fmt.Sprintf("Same player parsed %d+", score), pred("player.parse", chroniclesdk.InstanceSearchOpGte, score)))
		}
	}
	return items
}

// menuBosses lists the bosses of zone from the first matching run on the
// page, so "narrow by boss" offers real encounter names.
func (s *Service) menuBosses(r *http.Request, zone string, results []chroniclesdk.InstanceSearchResult) []string {
	if s.db == nil {
		return nil
	}
	i := slices.IndexFunc(results, func(res chroniclesdk.InstanceSearchResult) bool { return strings.EqualFold(res.Name, zone) })
	if i < 0 {
		return nil
	}
	encounters, err := s.db.EncountersByInstanceID(r.Context(), results[i].ID)
	if err != nil {
		return nil
	}
	var bosses []string
	for _, e := range encounters {
		if e.Boss && e.Name != "" && !slices.Contains(bosses, e.Name) && len(bosses) < menuMaxBosses {
			bosses = append(bosses, e.Name)
		}
	}
	return bosses
}

// userSearchLink opens a search in Chronicle's search page, which reads the
// tree as base64url JSON in ?q= (queryModel.ts encodeQuery).
func userSearchLink(origin string, where *searchNode) string {
	if where == nil {
		return origin + "/search"
	}
	raw, err := json.Marshal(where)
	if err != nil {
		return origin + "/search"
	}
	return origin + "/search?" + url.Values{"q": {base64.RawURLEncoding.EncodeToString(raw)}, "mode": {"code"}}.Encode()
}
