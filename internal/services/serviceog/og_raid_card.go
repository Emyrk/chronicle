package serviceog

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

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/database"
	overviewmetricsversion "github.com/Emyrk/chronicle/internal/overviewmetrics"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

const (
	// The card draws only the top damage and top healing player.
	raidCardTopN       = 1
	raidCardNameLength = 16
)

// raidCard is what the OG service's raid template draws (template=raid). The
// parse (#1666) and clear-time (#1668) cards reuse raidCardParams.
type raidCard struct {
	Host           string // tenant host, drawn in the footer
	Guild          string
	Raid           string
	Date           time.Time
	Players        *int // nil = unknown
	Kills          int
	Bosses         int // 0 = unknown
	Duration       time.Duration
	Wipes          *int
	KillTimeParses []int
	KillTimeAvg    *int
	Top            []raidCardDPS // top DPS
	Heal           []raidCardDPS // top HPS (healing + absorbs); DPS holds the HPS
	Comp           []raidCardClass
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
	if len(card.KillTimeParses) > 0 {
		scores := make([]string, 0, len(card.KillTimeParses))
		for _, score := range card.KillTimeParses {
			scores = append(scores, strconv.Itoa(score))
		}
		q.Set("killparses", strings.Join(scores, ","))
	}
	if card.KillTimeAvg != nil {
		q.Set("killavg", strconv.Itoa(*card.KillTimeAvg))
	}
	setIf("top", raidCardTopParam(card.Top))
	setIf("heal", raidCardTopParam(card.Heal))
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

// raidCardTopParam encodes players as the `top`/`heal` param:
// name:class:value items joined by ','. Empty for none.
func raidCardTopParam(players []raidCardDPS) string {
	items := make([]string, 0, len(players))
	for _, p := range players {
		items = append(items, p.Name+":"+p.Class+":"+strconv.Itoa(p.DPS))
	}
	return strings.Join(items, ",")
}

// raidCardTimeout bounds loadRaidCard. OG data resolves on every HTML load
// of the page, browsers included, so the card must not hold up the first
// byte for long.
const raidCardTimeout = 1500 * time.Millisecond

// loadRaidCard fills in what base can't get from data the page already
// loaded: boss progress, wipes and top DPS. The queries run in parallel under
// raidCardTimeout, derived from r's context (which also
// carries the tenant). Each part is optional: when its query fails or times
// out, that part is left off the card (boss progress falls back to the log).
func (s *Service) loadRaidCard(r *http.Request, inst database.LogInstancesGuild, encounters []database.LogInstanceEncounter, base raidCard) raidCard {
	ctx, cancel := context.WithTimeout(r.Context(), raidCardTimeout)
	defer cancel()
	db := s.store
	card := base

	// Each goroutine writes only its own variables; all are read after Wait.
	var (
		wg          sync.WaitGroup
		progression []string
		bossCount   *int
		wipes       *int
		records     []database.EncounterDpsRanking
		recordsErr  error
	)
	wg.Go(func() {
		if s.chronicle != nil {
			progression, bossCount = s.chronicle.RegistryForFlavor(s.resolvedSiteFlavor(ctx)).ProgressionBosses(inst.Name)
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
	wg.Wait()

	card.Kills, card.Bosses = raidBossProgress(encounters, progression, bossCount)
	card.Wipes = wipes
	if recordsErr == nil {
		card.Top = raidTopDPS(records, raidCardTopN)
		card.Heal = raidTopHPS(records, raidCardTopN)
	}
	return card
}

// loadRaidKillTimeParses returns server-wide boss kill-time parses in encounter
// order, plus their precise-score average. Missing, disabled, incomplete, and
// sample-too-small scores are omitted so the raid card can fall back cleanly.
func (s *Service) loadRaidKillTimeParses(r *http.Request, inst database.LogInstancesGuild, encounters []database.LogInstanceEncounter) ([]int, *int) {
	ctx, cancel := context.WithTimeout(r.Context(), raidCardTimeout)
	defer cancel()

	tenantID := servicetenant.TenantIDFromContext(ctx)
	if tenantID != uuid.Nil {
		tenant, err := s.store.GetTenantByID(ctx, tenantID)
		if err == nil && servicerankings.IsParseDisabled(tenant.ParseConfig) {
			return nil, nil
		}
	}
	score, err := s.store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{
		TenantID:      tenantID,
		InstanceID:    inst.ID,
		LookbackDays:  servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: int16(timeparsepolicy.PolicyVersion),
		QueryVersion:  timeparsepolicy.QueryVersion,
	})
	if err != nil {
		return nil, nil
	}
	rows, err := s.store.ListTimeParseBossScoresForScore(ctx, score.ID)
	if err != nil {
		return nil, nil
	}

	return raidKillTimeParseSummary(rows, encounters)
}

func raidKillTimeParseSummary(rows []database.TimeParseBossScore, encounters []database.LogInstanceEncounter) ([]int, *int) {
	byEncounter := make(map[uuid.UUID]database.TimeParseBossScore, len(rows))
	for _, row := range rows {
		if row.ServerStatus == string(timeparsepolicy.StatusSampleTooSmall) {
			continue
		}
		if row.ServerStatus != string(timeparsepolicy.StatusOK) && row.ServerStatus != string(timeparsepolicy.StatusLowConfidence) {
			continue
		}
		byEncounter[row.EncounterID] = row
	}
	ordered := append([]database.LogInstanceEncounter(nil), encounters...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if !ordered[i].StartTime.Valid {
			return false
		}
		if !ordered[j].StartTime.Valid {
			return true
		}
		return ordered[i].StartTime.Time.Before(ordered[j].StartTime.Time)
	})

	scores := make([]int, 0, len(byEncounter))
	precise := make([]float64, 0, len(byEncounter))
	for _, encounter := range ordered {
		row, ok := byEncounter[encounter.ID]
		if !ok {
			continue
		}
		scores = append(scores, int(row.ServerDisplayScore))
		precise = append(precise, row.ServerPreciseScore)
		delete(byEncounter, encounter.ID)
	}
	// Persisted rows should match the instance encounters. Keep any unmatched
	// rows rather than dropping valid scores if historical encounter data moved.
	for _, row := range rows {
		if _, ok := byEncounter[row.EncounterID]; !ok {
			continue
		}
		scores = append(scores, int(row.ServerDisplayScore))
		precise = append(precise, row.ServerPreciseScore)
		delete(byEncounter, row.EncounterID)
	}
	average, ok := timeparsepolicy.AverageParse(precise, len(rows))
	if !ok {
		return nil, nil
	}
	avg := average.DisplayScore
	return scores, &avg
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
	return raidTopPerSecond(records, n, func(rec database.EncounterDpsRanking) int64 { return rec.DamageDone })
}

// raidTopHPS is raidTopDPS for healing, counting absorbs like the rankings' HPS.
func raidTopHPS(records []database.EncounterDpsRanking, n int) []raidCardDPS {
	return raidTopPerSecond(records, n, func(rec database.EncounterDpsRanking) int64 { return rec.HealingDone + rec.AbsorbedDone })
}

func raidTopPerSecond(records []database.EncounterDpsRanking, n int, amount func(database.EncounterDpsRanking) int64) []raidCardDPS {
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
		t.damage += amount(rec)
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
