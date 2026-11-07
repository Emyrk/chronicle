package serviceog

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// characterCardStatTimeout bounds each stat lookup for the character card.
// They run while the page HTML is served; a slow one drops its stat.
const characterCardStatTimeout = 1500 * time.Millisecond

// characterCardBestBosses caps the boss pills on the character card.
const characterCardBestBosses = 3

// characterCardStats are the character card's optional lookups. A nil slice
// means the lookup failed or timed out, so its stats are dropped.
type characterCardStats struct {
	Parses     []database.GetCharacterParseHistoryRow
	Encounters []database.GetCharacterEncounterStatsRow
}

// fetchCharacterCardStats runs the parse and kill lookups concurrently, each
// with its own timeout. Errors only drop the stat.
func (s *Service) fetchCharacterCardStats(ctx context.Context, p database.GetGamePlayerByGUIDRow) characterCardStats {
	var (
		stats characterCardStats
		wg    sync.WaitGroup
	)
	playerGUID := p.ID.String()
	wg.Add(2)
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(ctx, characterCardStatTimeout)
		defer cancel()
		rows, err := s.store.GetCharacterParseHistory(ctx, database.GetCharacterParseHistoryParams{
			TenantID:   servicetenant.TenantIDFromContext(ctx),
			PlayerGuid: playerGUID,
			Metric:     characterCardMetric(characterSpec(p)),
			Since:      pgtype.Timestamptz{Time: time.Now().AddDate(0, 0, -int(parsepolicy.DefaultLookbackDays)), Valid: true},
		})
		if err == nil {
			stats.Parses = append([]database.GetCharacterParseHistoryRow{}, rows...)
		}
	}()
	go func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(ctx, characterCardStatTimeout)
		defer cancel()
		rows, err := s.store.GetCharacterEncounterStats(ctx, database.GetCharacterEncounterStatsParams{
			PlayerGuid: playerGUID,
			RealmID:    uuid.NullUUID{UUID: p.RealmID, Valid: true},
		})
		if err == nil {
			stats.Encounters = append([]database.GetCharacterEncounterStatsRow{}, rows...)
		}
	}()
	wg.Wait()
	return stats
}

// characterSpec infers the spec from the player's talent points, or "" when
// there are no talents.
func characterSpec(p database.GetGamePlayerByGUIDRow) string {
	if p.Talents == nil {
		return ""
	}
	var summary [3]uint8
	for i, tree := range p.Talents.Trees {
		summary[i] = uint8(min(max(tree.PointsSpent, 0), math.MaxUint8))
	}
	spec := wowspec.InferSpec(string(p.Class), summary)
	if spec == "Unknown" {
		return ""
	}
	return spec
}

// characterCardMetric matches the armory's default metric: healing trees
// rank on HPS, everything else on DPS.
func characterCardMetric(spec string) string {
	switch spec {
	case "Holy", "Restoration", "Discipline":
		return "hps"
	}
	return "dps"
}

// characterAverageItemLevel averages item level over equipped slots, skipping
// shirt and tabard like the armory tracker. ok is false when no equipped item
// has a known item level.
func characterAverageItemLevel(gear *database.PlayerOutfit) (avg int, ok bool) {
	if gear == nil {
		return 0, false
	}
	const slotShirt, slotTabard = 3, 18
	var sum, count int
	for i, item := range gear {
		if i == slotShirt || i == slotTabard || item.ItemID == 0 || item.ItemLevel == nil {
			continue
		}
		sum += int(*item.ItemLevel)
		count++
	}
	if count == 0 {
		return 0, false
	}
	return int(math.Round(float64(sum) / float64(count))), true
}

// characterCardParams builds the `character` card's query params. With
// parses the stats are parse · ilvl · kills plus up to three boss pills;
// without them, ilvl · raids with kills · last seen. Missing stats are omitted.
func characterCardParams(p database.GetGamePlayerByGUIDRow, race, class string, stats characterCardStats) url.Values {
	params := url.Values{}
	params.Set("name", p.Name)
	params.Set("class", strings.ToLower(class))
	params.Set("race", race)
	params.Set("realm", p.RealmName)
	if spec := characterSpec(p); spec != "" {
		params.Set("spec", spec)
	}
	if p.Level > 0 {
		params.Set("level", strconv.Itoa(int(p.Level)))
	}
	if p.GuildName.String != "" {
		params.Set("guild", p.GuildName.String)
	}
	if ilvl, ok := characterAverageItemLevel(p.Gear); ok {
		params.Set("ilvl", strconv.Itoa(ilvl))
	}

	if len(stats.Parses) > 0 {
		parses := make([]chroniclesdk.CharacterParse, 0, len(stats.Parses))
		for _, row := range stats.Parses {
			parses = append(parses, chroniclesdk.CharacterParse{
				InstanceName:  row.InstanceName,
				EncounterName: row.EncounterName,
				PreciseScore:  row.PreciseScore,
			})
		}
		if score := servicerankings.ComputeCharacterScore(parses); score != nil {
			params.Set("parse", strconv.FormatFloat(math.Round(score.Value*10)/10, 'f', 1, 64))
		}
		if best := characterBestBosses(parses); best != "" {
			params.Set("best", best)
		}
		if stats.Encounters != nil {
			kills := 0
			for _, e := range stats.Encounters {
				kills += int(e.Kills)
			}
			params.Set("kills", strconv.Itoa(kills))
		}
		return params
	}

	// Distinct raids with at least one boss kill: rankings rows are kills only.
	raids := map[string]struct{}{}
	for _, e := range stats.Encounters {
		raids[e.InstanceName] = struct{}{}
	}
	if len(raids) > 0 {
		params.Set("raids", strconv.Itoa(len(raids)))
	}
	if p.UpdatedAt.Valid {
		params.Set("seen", p.UpdatedAt.Time.UTC().Format("Jan 2006"))
	}
	return params
}

// characterBestBosses returns the top bosses as `Name:score,…`, scoring each
// (instance, boss) like the armory: the average of its best three parses,
// rounded for display. Separators in boss names become spaces.
func characterBestBosses(parses []chroniclesdk.CharacterParse) string {
	type key struct{ instance, encounter string }
	groups := map[key][]float64{}
	for _, p := range parses {
		k := key{p.InstanceName, p.EncounterName}
		groups[k] = append(groups[k], p.PreciseScore)
	}
	type boss struct {
		name  string
		score int
		exact float64
	}
	bosses := make([]boss, 0, len(groups))
	for k, scores := range groups {
		sort.Sort(sort.Reverse(sort.Float64Slice(scores)))
		scores = scores[:min(3, len(scores))]
		var sum float64
		for _, s := range scores {
			sum += s
		}
		avg := sum / float64(len(scores))
		bosses = append(bosses, boss{name: k.encounter, score: parsepolicy.RoundDisplay(avg), exact: avg})
	}
	sort.Slice(bosses, func(i, j int) bool {
		if bosses[i].exact != bosses[j].exact {
			return bosses[i].exact > bosses[j].exact
		}
		return bosses[i].name < bosses[j].name
	})

	clean := strings.NewReplacer(",", " ", ":", " ")
	items := make([]string, 0, characterCardBestBosses)
	for _, b := range bosses[:min(characterCardBestBosses, len(bosses))] {
		name := shortenBossName(strings.TrimSpace(clean.Replace(b.name)))
		items = append(items, fmt.Sprintf("%s:%d", name, b.score))
	}
	return strings.Join(items, ",")
}

// characterCardBossNameMax keeps `Name:score` inside the card's 40-character
// list item, so a long encounter name can't cut off its score.
const characterCardBossNameMax = 30

// shortenBossName clips a name to characterCardBossNameMax runes, ending in
// an ellipsis when it was cut.
func shortenBossName(name string) string {
	runes := []rune(name)
	if len(runes) <= characterCardBossNameMax {
		return name
	}
	return strings.TrimSpace(string(runes[:characterCardBossNameMax-1])) + "…"
}
