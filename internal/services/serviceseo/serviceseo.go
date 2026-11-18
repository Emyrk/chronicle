// Package serviceseo renders the small crawlable summaries and meta
// descriptions that Chronicle serves in the first HTML response for SPA pages
// that would otherwise reach crawlers with an empty body.
package serviceseo

import (
	"bytes"
	"cmp"
	"context"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/pageload"
)

const (
	// lookupTimeout bounds the summary queries; they run while the page HTML
	// is served, so a slow lookup drops the summary instead of the page.
	lookupTimeout = 500 * time.Millisecond
	// maxSummaryPlayers caps the instance roster in the summary.
	maxSummaryPlayers = 60
	// recentInstanceLimit caps the character's linked recent instances.
	recentInstanceLimit = 10
	// descriptionInstanceNames caps the raid names in a character description.
	descriptionInstanceNames = 3
)

// Store is the read access the summaries need. *authz.Authz satisfies it;
// RLS on the request context scopes every lookup to the tenant. Instance and
// character lookups go through pageload, so they are shared with the rest of
// the request when it carries a pageload cache.
type Store interface {
	pageload.InstanceStore
	pageload.CharacterStore
	ListCharacterSummaryInstances(ctx context.Context, arg database.ListCharacterSummaryInstancesParams) ([]database.ListCharacterSummaryInstancesRow, error)
}

// ProgressionBosses returns an instance's progression boss list and its
// canonical boss count from the boss registry. Either is nil when unknown.
type ProgressionBosses func(ctx context.Context, instanceName string) ([]string, *int)

// Options are the summary service's dependencies.
type Options struct {
	Store  Store
	Logger *slog.Logger
	// ProgressionBosses is optional; without it summaries count kills
	// without a boss total.
	ProgressionBosses ProgressionBosses
}

// Service renders page summaries for instance and character pages.
type Service struct {
	store             Store
	logger            *slog.Logger
	progressionBosses ProgressionBosses
}

// New returns a summary service. With a nil store it renders nothing.
func New(opts Options) *Service {
	logger := opts.Logger
	if logger == nil {
		logger = slog.New(slog.DiscardHandler)
	}
	return &Service{store: opts.Store, logger: logger, progressionBosses: opts.ProgressionBosses}
}

// Summary returns the crawlable summary for /instances/{idOrSlug} and
// /armory/{realm}/{player}, or nil for other paths and for pages that cannot
// be resolved. Unlisted instances never resolve: the lookups only return
// listed logs.
func (s *Service) Summary(r *http.Request) *frontend.PageSummary {
	if s == nil || s.store == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), lookupTimeout)
	defer cancel()

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	switch {
	case len(parts) == 2 && parts[0] == "instances" && parts[1] != "":
		return s.instanceSummary(ctx, parts[1])
	case len(parts) == 3 && parts[0] == "armory" && parts[1] != "" && parts[2] != "":
		return s.characterSummary(ctx, parts[1], parts[2])
	}
	return nil
}

func (s *Service) instanceSummary(ctx context.Context, idOrSlug string) *frontend.PageSummary {
	inst, err := pageload.PublicInstance(ctx, s.store, idOrSlug)
	if err != nil {
		s.logger.DebugContext(ctx, "seo summary: instance lookup", "instance", idOrSlug, "error", err)
		return nil
	}
	encounters, err := pageload.Encounters(ctx, s.store, inst.ID)
	if err != nil {
		s.logger.DebugContext(ctx, "seo summary: encounters lookup", "instance_id", inst.ID, "error", err)
		return nil
	}
	players, err := pageload.Players(ctx, s.store, inst.ID)
	if err != nil {
		s.logger.DebugContext(ctx, "seo summary: players lookup", "instance_id", inst.ID, "error", err)
		return nil
	}
	var progression []string
	var bossCount *int
	if s.progressionBosses != nil {
		progression, bossCount = s.progressionBosses(ctx, inst.Name)
	}
	return renderInstance(inst, encounters, players, progression, bossCount)
}

func (s *Service) characterSummary(ctx context.Context, realm, player string) *frontend.PageSummary {
	realmID, err := uuid.Parse(realm)
	if err != nil {
		row, err := pageload.RealmByName(ctx, s.store, realm)
		if err != nil {
			s.logger.DebugContext(ctx, "seo summary: realm lookup", "realm", realm, "error", err)
			return nil
		}
		realmID = row.ID
	}
	p, err := pageload.Player(ctx, s.store, database.GetGamePlayerByGUIDParams{
		RealmID:    realmID,
		Identifier: parsePlayerGUID(player),
		Name:       player,
	})
	if err != nil {
		s.logger.DebugContext(ctx, "seo summary: character lookup", "realm_id", realmID, "player", player, "error", err)
		return nil
	}
	recent, err := s.store.ListCharacterSummaryInstances(ctx, database.ListCharacterSummaryInstancesParams{
		PlayerGuid:  p.ID,
		RealmID:     p.RealmID,
		ResultLimit: recentInstanceLimit,
	})
	if err != nil {
		s.logger.DebugContext(ctx, "seo summary: recent instances lookup", "player", p.ID, "error", err)
		return nil
	}
	return renderCharacter(p, recent)
}

// parsePlayerGUID reads the armory route's player segment the same way the
// armory page does: a hex GUID or a decimal low GUID, otherwise a name.
func parsePlayerGUID(player string) guid.GUID {
	if id, err := guid.FromString(player); err == nil {
		return id
	}
	if id, err := strconv.ParseUint(player, 10, 32); err == nil {
		return guid.GUID(id)
	}
	return 0
}

type link struct {
	Name string
	Href string
}

type bossKill struct {
	Name string
	Time string
}

type rosterEntry struct {
	link
	Class string
}

type instanceView struct {
	Zone  string
	Verb  string
	Guild *link
	Date  string
	// Progress reads "3/10 bosses", or "3 bosses killed" when the boss total
	// is unknown; empty when there is nothing to report.
	Progress string
	Duration string
	Players  int
	Kills    []bossKill
	Roster   []rosterEntry
}

var instanceTemplate = template.Must(template.New("instance").Parse(
	`<h1>{{.Zone}}{{with .Guild}} by {{.Name}}{{end}}</h1>` +
		`<p>{{.Zone}} {{.Verb}}{{with .Guild}} by {{if .Href}}<a href="{{.Href}}">{{.Name}}</a>{{else}}{{.Name}}{{end}}{{end}}` +
		`{{with .Date}} on {{.}}{{end}}{{with .Progress}}: {{.}}{{with $.Duration}} in {{.}}{{end}}{{end}}.` +
		`{{if .Players}} {{.Players}} players.{{end}}</p>` +
		`{{if .Kills}}<h2>Bosses killed</h2><ul>{{range .Kills}}<li>{{.Name}}{{with .Time}} in {{.}}{{end}}</li>{{end}}</ul>{{end}}` +
		`{{if .Roster}}<h2>Players</h2><ul>{{range .Roster}}<li><a href="{{.Href}}">{{.Name}}</a>{{with .Class}} ({{.}}){{end}}</li>{{end}}</ul>{{end}}`,
))

// renderInstance renders an instance summary. progression and bossCount are
// the boss registry's entry for the zone (see ProgressionBosses), nil when
// unknown.
func renderInstance(inst database.LogInstancesGuild, encounters []database.LogInstanceEncounter, players []database.LogInstancePlayer, progression []string, bossCount *int) *frontend.PageSummary {
	zone := strings.TrimSpace(inst.Name)
	if zone == "" {
		return nil
	}
	view := instanceView{Zone: zone, Verb: "run", Players: len(players)}
	if name := inst.GuildName.String; name != "" {
		view.Guild = &link{Name: name}
		if inst.GuildID.Valid {
			view.Guild.Href = "/g/" + inst.GuildID.UUID.String()
		}
	}

	encounters = slices.Clone(encounters)
	slices.SortFunc(encounters, func(a, b database.LogInstanceEncounter) int {
		return a.StartTime.Time.Compare(b.StartTime.Time)
	})
	var first, last time.Time
	killed := map[string]bool{}
	for _, e := range encounters {
		if e.StartTime.Valid && (first.IsZero() || e.StartTime.Time.Before(first)) {
			first = e.StartTime.Time
		}
		if e.EndTime.Valid && e.EndTime.Time.After(last) {
			last = e.EndTime.Time
		}
		// Invalidated encounters don't count as kills, as in the sitemap.
		// A boss killed twice is listed once, at its first kill.
		if !e.Boss || e.InvalidatedAt.Valid || killed[e.Name] {
			continue
		}
		if e.KillType != database.KillTypeClean && e.KillType != database.KillTypePartial {
			continue
		}
		kill := bossKill{Name: e.Name}
		if e.StartTime.Valid && e.EndTime.Valid {
			kill.Time = formatDuration(e.EndTime.Time.Sub(e.StartTime.Time))
		}
		view.Kills = append(view.Kills, kill)
		killed[e.Name] = true
	}
	kills, total := bossProgress(killed, progression, bossCount)
	switch {
	case total > 0:
		view.Progress = fmt.Sprintf("%d/%d bosses", kills, total)
		if kills == total {
			view.Verb = "clear"
		}
	case kills == 1:
		view.Progress = "1 boss killed"
	case kills > 1:
		view.Progress = fmt.Sprintf("%d bosses killed", kills)
	}
	if first.IsZero() && inst.StartTime.Valid {
		first = inst.StartTime.Time
	}
	if !first.IsZero() {
		view.Date = first.UTC().Format("Jan 2, 2006")
	}
	if !first.IsZero() && last.After(first) {
		view.Duration = formatDuration(last.Sub(first))
	}

	players = slices.Clone(players)
	slices.SortFunc(players, func(a, b database.LogInstancePlayer) int {
		return cmp.Or(cmp.Compare(className(a.Class), className(b.Class)), cmp.Compare(a.Name, b.Name))
	})
	for _, p := range players[:min(len(players), maxSummaryPlayers)] {
		view.Roster = append(view.Roster, rosterEntry{
			link:  link{Name: p.Name, Href: armoryPath(inst.RealmName, p.UnitGuid)},
			Class: className(p.Class),
		})
	}

	var buf bytes.Buffer
	if err := instanceTemplate.Execute(&buf, view); err != nil {
		return nil
	}
	return &frontend.PageSummary{Description: instanceDescription(view), HTML: buf.String()}
}

// instanceDescription reads like "Molten Core clear by Guild on Jan 2, 2026:
// 10/10 bosses in 42:10. Damage, healing and deaths for 40 players."
func instanceDescription(v instanceView) string {
	var b strings.Builder
	b.WriteString(v.Zone + " " + v.Verb)
	if v.Guild != nil {
		b.WriteString(" by " + v.Guild.Name)
	}
	if v.Date != "" {
		b.WriteString(" on " + v.Date)
	}
	if v.Progress != "" {
		b.WriteString(": " + v.Progress)
		if v.Duration != "" {
			b.WriteString(" in " + v.Duration)
		}
	}
	b.WriteString(".")
	if v.Players > 0 {
		fmt.Fprintf(&b, " Damage, healing and deaths for %d players.", v.Players)
	} else {
		b.WriteString(" Damage, healing and deaths by encounter.")
	}
	return b.String()
}

// bossProgress counts the killed bosses against the registry's boss total.
// With a progression list only its bosses count; the total is the canonical
// boss count, else the list's length, else 0 (unknown).
func bossProgress(killed map[string]bool, progression []string, bossCount *int) (kills, total int) {
	if len(progression) > 0 {
		total = len(progression)
		for _, name := range progression {
			if killed[name] {
				kills++
			}
		}
	} else {
		kills = len(killed)
	}
	if bossCount != nil && *bossCount > 0 {
		total = *bossCount
	}
	if total > 0 {
		kills = min(kills, total)
	}
	return kills, total
}

type recentInstance struct {
	link
	Date string
}

type characterView struct {
	Name       string
	Descriptor string
	Realm      string
	Guild      *link
	Recent     []recentInstance
}

var characterTemplate = template.Must(template.New("character").Parse(
	`<h1>{{.Name}}</h1>` +
		`<p>{{.Name}}{{with .Descriptor}}, {{.}}{{end}}{{with .Realm}} on {{.}}{{end}}` +
		`{{with .Guild}}, member of {{if .Href}}<a href="{{.Href}}">{{.Name}}</a>{{else}}{{.Name}}{{end}}{{end}}.</p>` +
		`{{if .Recent}}<h2>Recent raids and instances</h2><ul>{{range .Recent}}<li><a href="{{.Href}}">{{.Name}}</a>{{with .Date}} on {{.}}{{end}}</li>{{end}}</ul>{{end}}`,
))

func renderCharacter(p database.GetGamePlayerByGUIDRow, recent []database.ListCharacterSummaryInstancesRow) *frontend.PageSummary {
	if p.Name == "" {
		return nil
	}
	var descriptor []string
	if p.Level > 0 {
		descriptor = append(descriptor, "level "+strconv.Itoa(int(p.Level)))
	}
	if race := raceName(p.Race); race != "" {
		descriptor = append(descriptor, race)
	}
	if class := className(p.Class); class != "" {
		descriptor = append(descriptor, class)
	}
	view := characterView{Name: p.Name, Descriptor: strings.Join(descriptor, " "), Realm: p.RealmName}
	if name := p.GuildName.String; name != "" {
		view.Guild = &link{Name: name}
		if p.GuildID.Valid {
			view.Guild.Href = "/g/" + p.GuildID.UUID.String()
		}
	}
	for _, inst := range recent {
		identifier := inst.ID.String()
		if inst.HashedSlug.Valid && inst.HashedSlug.String != "" {
			identifier = inst.HashedSlug.String
		}
		entry := recentInstance{link: link{Name: inst.Name, Href: "/instances/" + url.PathEscape(identifier)}}
		if inst.StartTime.Valid {
			entry.Date = inst.StartTime.Time.UTC().Format("Jan 2, 2006")
		}
		view.Recent = append(view.Recent, entry)
	}

	var buf bytes.Buffer
	if err := characterTemplate.Execute(&buf, view); err != nil {
		return nil
	}
	return &frontend.PageSummary{Description: characterDescription(view), HTML: buf.String()}
}

// characterDescription reads like "Zeezee, level 60 Gnome Warlock of
// <Guild>. Recent raids: Molten Core, Onyxia's Lair. Raid logs on
// Chronicle." Unknown fields are left out, and the realm is not named.
func characterDescription(v characterView) string {
	var b strings.Builder
	b.WriteString(v.Name)
	if v.Descriptor != "" {
		b.WriteString(", " + v.Descriptor)
	}
	if v.Guild != nil {
		b.WriteString(" of <" + v.Guild.Name + ">")
	}
	b.WriteString(".")
	var names []string
	for _, inst := range v.Recent {
		if inst.Name != "" && !slices.Contains(names, inst.Name) && len(names) < descriptionInstanceNames {
			names = append(names, inst.Name)
		}
	}
	if len(names) > 0 {
		b.WriteString(" Recent raids: " + strings.Join(names, ", ") + ".")
	}
	b.WriteString(" Raid logs and performance on Chronicle.")
	return b.String()
}

func armoryPath(realmName string, player guid.GUID) string {
	return "/armory/" + url.PathEscape(realmName) + "/" + player.String()
}

// className returns the display name of a playable class, or "" when unknown.
func className(class database.WowPlayableClass) string {
	switch class {
	case "", database.WowPlayableClassUNKNOWN:
		return ""
	case database.WowPlayableClassDEATHKNIGHT:
		return "Death Knight"
	case database.WowPlayableClassDEMONHUNTER:
		return "Demon Hunter"
	}
	s := strings.ToLower(string(class))
	return strings.ToUpper(s[:1]) + s[1:]
}

// raceName returns the display name of a playable race, or "" when unknown.
func raceName(race database.WowPlayableRace) string {
	switch race {
	case "", database.WowPlayableRaceUnknown:
		return ""
	case database.WowPlayableRaceScourge:
		return "Undead"
	case database.WowPlayableRaceNightElf:
		return "Night Elf"
	case database.WowPlayableRaceBloodElf:
		return "Blood Elf"
	}
	return string(race)
}

// formatDuration renders a duration as m:ss, or h:mm:ss from an hour.
func formatDuration(d time.Duration) string {
	total := int(d.Round(time.Second).Seconds())
	h, m, s := total/3600, total/60%60, total%60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%d:%02d", m, s)
}
