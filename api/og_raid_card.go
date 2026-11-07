package api

import (
	"context"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	overviewmetricsversion "github.com/Emyrk/chronicle/internal/overviewmetrics"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/wowspec"
)

const (
	raidCardTopN       = 5
	raidCardNameLength = 16
)

// raidCard is what the OG service's raid template draws (template=raid). The
// parse (#1666) and clear-time (#1668) cards reuse raidCardParams.
type raidCard struct {
	Guild    string
	Raid     string
	Realm    string
	Date     time.Time
	Players  int
	Kills    int
	Bosses   int // 0 = unknown
	Duration time.Duration
	Wipes    *int
	AvgParse *int
	Top      []raidCardDPS
	Comp     []raidCardClass
}

type raidCardDPS struct {
	Name  string
	Class string
	DPS   int
}

type raidCardClass struct {
	Class string
	Count int
}

// raidCardParams encodes card into the raid template's query params. host,
// product, template and v are added by ogImageURL.
func raidCardParams(card raidCard) url.Values {
	q := url.Values{}
	setIf := func(k, v string) {
		if v != "" {
			q.Set(k, v)
		}
	}
	setIf("guild", card.Guild)
	setIf("raid", card.Raid)
	setIf("realm", card.Realm)
	if !card.Date.IsZero() {
		q.Set("date", card.Date.UTC().Format(time.DateOnly))
	}
	q.Set("players", strconv.Itoa(card.Players))
	q.Set("kills", strconv.Itoa(card.Kills))
	if card.Bosses > 0 {
		q.Set("bosses", strconv.Itoa(card.Bosses))
	}
	if card.Duration > 0 {
		q.Set("dur", strconv.Itoa(int(card.Duration.Seconds())))
	}
	if card.Wipes != nil {
		q.Set("wipes", strconv.Itoa(*card.Wipes))
	}
	if card.AvgParse != nil {
		q.Set("avg", strconv.Itoa(*card.AvgParse))
	}
	if len(card.Top) > 0 {
		top := make([]string, 0, len(card.Top))
		for _, p := range card.Top {
			top = append(top, p.Name+":"+p.Class+":"+strconv.Itoa(p.DPS))
		}
		q.Set("top", strings.Join(top, ","))
	}
	if len(card.Comp) > 0 {
		comp := make([]string, 0, len(card.Comp))
		for _, c := range card.Comp {
			comp = append(comp, c.Class+":"+strconv.Itoa(c.Count))
		}
		q.Set("comp", strings.Join(comp, ","))
	}
	setIf("art", ogArtSlug(card.Raid))
	return q
}

// raidCardImageURL loads what the card needs beyond buildInstanceOG's
// encounters and players, and returns the signed image URL, or "" when the OG
// service is not configured. Each extra query is optional: on error its part
// of the card is left out. r supplies the tenant (for RLS and parse scores)
// and the site flavor; ctx carries the page-serve timeout.
func (api *API) raidCardImageURL(ctx context.Context, r *http.Request, host string, inst database.LogInstancesGuild, card raidCard) string {
	if !api.ogServiceConfigured() {
		return ""
	}
	tenant := servicetenant.TenantFromContext(r.Context())
	if tenant != nil {
		ctx = servicetenant.WithTenant(ctx, *tenant)
	}
	db := api.Opts.Zed

	if metrics, err := db.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{
		InstanceID:     inst.ID,
		MetricsVersion: overviewmetricsversion.CurrentVersion,
	}); err == nil {
		wipes := int(metrics.WipeCount)
		card.Wipes = &wipes
	}

	if records, err := db.InstanceRankingRecords(ctx, inst.ID); err == nil {
		card.Top = raidTopDPS(records, raidCardTopN)
	}
	// Avg parse only reads alongside ranked bosses; dungeons and custom raids
	// show bosses, duration and wipes instead.
	if len(card.Top) > 0 {
		tenantID := servicetenant.TenantIDFromContext(ctx)
		dps, dpsErr := db.ListPersistedParseScoreResultsForInstance(ctx, database.ListPersistedParseScoreResultsForInstanceParams{
			TenantID: tenantID, InstanceID: inst.ID, Metric: string(parsepolicy.MetricDPS),
		})
		hps, hpsErr := db.ListPersistedParseScoreResultsForInstance(ctx, database.ListPersistedParseScoreResultsForInstanceParams{
			TenantID: tenantID, InstanceID: inst.ID, Metric: string(parsepolicy.MetricHPS),
		})
		if dpsErr == nil && hpsErr == nil {
			card.AvgParse = raidAvgParse(dps, hps)
		}
	}

	if api.Chronicle != nil {
		if count := api.Chronicle.RegistryForFlavor(api.resolvedSiteFlavor(r.Context())).ProgressionBossCount(inst.Name); count != nil {
			card.Bosses = *count
		}
	}

	params := raidCardParams(card)
	params.Set("host", host)
	return api.ogImageURL(r, "raid", params)
}

// raidTopDPS ranks players by damage ÷ time across the instance's ranked boss
// kills (trash rows have no encounter_id) and returns the top n.
func raidTopDPS(records []database.EncounterDpsRanking, n int) []raidCardDPS {
	type total struct {
		name, class string
		damage      int64
		secs        float64
	}
	byGUID := map[string]*total{}
	for _, rec := range records {
		if !rec.EncounterID.Valid || rec.DurationSecs <= 0 {
			continue
		}
		t := byGUID[rec.PlayerGuid]
		if t == nil {
			t = &total{name: rec.PlayerName, class: rec.PlayerClass}
			byGUID[rec.PlayerGuid] = t
		}
		t.damage += rec.DamageDone
		t.secs += rec.DurationSecs
	}

	top := make([]raidCardDPS, 0, len(byGUID))
	for _, t := range byGUID {
		dps := int(math.Round(float64(t.damage) / t.secs))
		name := ogCardName(t.name)
		if dps <= 0 || name == "" {
			continue
		}
		top = append(top, raidCardDPS{Name: name, Class: ogClassSlug(t.class), DPS: dps})
	}
	sort.Slice(top, func(i, j int) bool {
		if top[i].DPS != top[j].DPS {
			return top[i].DPS > top[j].DPS
		}
		return top[i].Name < top[j].Name
	})
	if len(top) > n {
		top = top[:n]
	}
	return top
}

// raidClassOrder is the composition strip's segment order: melee, casters,
// hunters, then healers, like the mockup.
var raidClassOrder = []string{"warrior", "rogue", "deathknight", "mage", "warlock", "hunter", "shaman", "priest", "druid", "paladin"}

// raidComposition counts players per class in raidClassOrder; unknown classes
// follow, sorted by name.
func raidComposition(players []database.LogInstancePlayer) []raidCardClass {
	counts := map[string]int{}
	for _, p := range players {
		if class := ogClassSlug(string(p.Class)); class != "" {
			counts[class]++
		}
	}
	comp := make([]raidCardClass, 0, len(counts))
	for _, class := range raidClassOrder {
		if counts[class] > 0 {
			comp = append(comp, raidCardClass{Class: class, Count: counts[class]})
			delete(counts, class)
		}
	}
	rest := make([]string, 0, len(counts))
	for class := range counts {
		rest = append(rest, class)
	}
	sort.Strings(rest)
	for _, class := range rest {
		comp = append(comp, raidCardClass{Class: class, Count: counts[class]})
	}
	return comp
}

// raidAvgParse is the mean of every player's average parse: HPS rows for
// healers, DPS rows for everyone else, counting only scored bosses (ok or
// low confidence), as the instance parses endpoint does. nil when nobody has
// a scored boss.
func raidAvgParse(dps, hps []database.ParseScoreResult) *int {
	scored := func(rows []database.ParseScoreResult, healers bool) map[string][]float64 {
		out := map[string][]float64{}
		for _, row := range rows {
			if (row.PlayerRole == wowspec.RoleHeal) != healers {
				continue
			}
			if row.Status != string(parsepolicy.StatusOK) && row.Status != string(parsepolicy.StatusLowConfidence) {
				continue
			}
			out[row.PlayerGuid] = append(out[row.PlayerGuid], row.PreciseScore)
		}
		return out
	}

	var sum float64
	var players int
	for _, byPlayer := range []map[string][]float64{scored(dps, false), scored(hps, true)} {
		for _, scores := range byPlayer {
			avg, ok := parsepolicy.AverageParse(scores, len(scores))
			if !ok {
				continue
			}
			sum += avg.PreciseScore
			players++
		}
	}
	if players == 0 {
		return nil
	}
	avg := parsepolicy.RoundDisplay(sum / float64(players))
	return &avg
}

// ogClassSlug turns a DB class (WARRIOR, DEATH_KNIGHT, Warrior) into the
// card's class key (warrior, deathknight).
func ogClassSlug(class string) string {
	return ogNonLetters.ReplaceAllString(strings.ToLower(class), "")
}

var ogNonLetters = regexp.MustCompile(`[^a-z]+`)

// ogCardName drops the card list delimiters and caps a name at 16 runes.
func ogCardName(name string) string {
	name = strings.TrimSpace(strings.NewReplacer(",", "", ":", "").Replace(name))
	if runes := []rune(name); len(runes) > raidCardNameLength {
		name = string(runes[:raidCardNameLength])
	}
	return name
}

// ogArtSlug matches the OG service's artSlug: lowercase, apostrophes
// dropped, other runs of non-alphanumerics as '-'.
func ogArtSlug(instanceName string) string {
	s := strings.NewReplacer("'", "", "’", "").Replace(strings.ToLower(instanceName))
	return strings.Trim(ogNonAlnum.ReplaceAllString(s, "-"), "-")
}

var ogNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// distinctBossEncounters counts the boss encounters the log reached (killed
// or not): the card's boss total when the registry has no count.
func distinctBossEncounters(encounters []database.LogInstanceEncounter) int {
	seen := map[string]struct{}{}
	for _, e := range encounters {
		if e.Boss {
			seen[e.Name] = struct{}{}
		}
	}
	return len(seen)
}
