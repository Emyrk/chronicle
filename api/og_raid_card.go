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
	"sync"
	"time"

	"github.com/Emyrk/chronicle/database"
	overviewmetricsversion "github.com/Emyrk/chronicle/internal/overviewmetrics"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
)

const (
	raidCardTopN       = 5
	raidCardNameLength = 16
)

// raidCard is what the OG service's raid template draws (template=raid). The
// parse (#1666) and clear-time (#1668) cards reuse raidCardParams.
type raidCard struct {
	Host     string // tenant host, drawn in the footer
	Guild    string
	Raid     string
	Realm    string
	Date     time.Time
	Players  *int // nil = unknown
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

// raidCardParams encodes card into the raid template's query params, for
// ogImageURL(r, "raid", raidCardParams(card)). ogImageURL adds product,
// template and v.
func raidCardParams(card raidCard) url.Values {
	q := url.Values{}
	setIf := func(k, v string) {
		if v != "" {
			q.Set(k, v)
		}
	}
	setIf("host", card.Host)
	setIf("guild", card.Guild)
	setIf("raid", card.Raid)
	setIf("realm", card.Realm)
	if !card.Date.IsZero() {
		// Same zone as the page description's date.
		q.Set("date", card.Date.Format(time.DateOnly))
	}
	if card.Players != nil {
		q.Set("players", strconv.Itoa(*card.Players))
	}
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

// raidCardTimeout bounds loadRaidCard. OG data resolves on every HTML load
// of the page, browsers included, so the card must not hold up the first
// byte for long.
const raidCardTimeout = 1500 * time.Millisecond

// loadRaidCard fills in what base can't get from data the page already
// loaded: boss progress, wipes, top DPS and avg parse. The queries run in
// parallel under raidCardTimeout, derived from r's context (which also
// carries the tenant). Each part is optional: when its query fails or times
// out, that part is left off the card (boss progress falls back to the log).
func (api *API) loadRaidCard(r *http.Request, inst database.LogInstancesGuild, encounters []database.LogInstanceEncounter, base raidCard) raidCard {
	ctx, cancel := context.WithTimeout(r.Context(), raidCardTimeout)
	defer cancel()
	db := api.Opts.Zed
	card := base

	// Each goroutine writes only its own variables; all are read after Wait.
	var (
		wg                 sync.WaitGroup
		progression        []string
		bossCount          *int
		wipes, avg         *int
		records            []database.EncounterDpsRanking
		recordsErr, avgErr error
	)
	wg.Go(func() {
		if api.Chronicle != nil {
			progression, bossCount = api.Chronicle.RegistryForFlavor(api.resolvedSiteFlavor(ctx)).ProgressionBosses(inst.Name)
		}
	})
	wg.Go(func() {
		metrics, err := db.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{
			InstanceID:     inst.ID,
			MetricsVersion: overviewmetricsversion.CurrentVersion,
		})
		if err == nil {
			n := int(metrics.WipeCount)
			wipes = &n
		}
	})
	wg.Go(func() {
		records, recordsErr = db.InstanceRankingRecords(ctx, inst.ID)
	})
	wg.Go(func() {
		var n int
		var ok bool
		n, ok, avgErr = servicerankings.InstanceAverageParse(ctx, db, inst.ID)
		if ok {
			avg = &n
		}
	})
	wg.Wait()

	card.Kills, card.Bosses = raidBossProgress(encounters, progression, bossCount)
	card.Wipes = wipes
	if recordsErr == nil {
		card.Top = raidTopDPS(records, raidCardTopN)
	}
	// Avg parse only reads alongside ranked bosses; dungeons and custom raids
	// show bosses, duration and wipes instead.
	if avgErr == nil && len(card.Top) > 0 {
		card.AvgParse = avg
	}
	return card
}

// raidBossProgress returns the card's kills and boss total. With a registry
// progression list, kills are the distinct listed encounters killed (so
// optional bosses such as Gahz'ranka don't count) and the total is the
// registry's count. Without one, kills are distinct boss kills out of the
// distinct boss encounters the log reached.
func raidBossProgress(encounters []database.LogInstanceEncounter, progression []string, count *int) (kills, total int) {
	killed := map[string]struct{}{}
	reached := map[string]struct{}{}
	for _, e := range encounters {
		if !e.Boss {
			continue
		}
		reached[e.Name] = struct{}{}
		if e.KillType == database.KillTypeClean || e.KillType == database.KillTypePartial {
			killed[e.Name] = struct{}{}
		}
	}
	if len(progression) == 0 {
		return len(killed), len(reached)
	}
	for _, name := range progression {
		if _, ok := killed[name]; ok {
			kills++
		}
	}
	total = len(progression)
	if count != nil && *count > 0 {
		total = *count
	}
	return min(kills, total), total
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
