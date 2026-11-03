package ratingmath

import (
	"context"
	"fmt"
	"math"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// writeRatingScopes projects explicit eligible-boss and raid policy into
// per-raid and cross-raid scores. Missing eligible bosses/raids contribute zero
// to competitive averages, while Renown sums earned points without averaging.
func writeRatingScopes(ctx context.Context, store ratingStore, generation, tenant, group uuid.UUID,
	evidence map[scopeKey]map[BossKey]float64, bosses []database.RatingGroupBossPolicy,
	raids []database.RatingGroupRaidPolicy) (int, error) {
	bossesByRaid := make(map[string][]database.RatingGroupBossPolicy)
	for _, boss := range bosses {
		bossesByRaid[boss.InstanceName] = append(bossesByRaid[boss.InstanceName], boss)
	}
	written := 0
	for key, observed := range evidence {
		perRaid := make(map[string]float64, len(raids))
		for _, raid := range raids {
			eligible := bossesByRaid[raid.InstanceName]
			if len(eligible) == 0 {
				return written, fmt.Errorf("raid %q has no eligible bosses", raid.InstanceName)
			}
			var numerator, denominator float64
			hasEvidence := false
			for _, boss := range eligible {
				value, ok := observed[BossKey{Instance: raid.InstanceName, Encounter: boss.EncounterName}]
				if ok {
					hasEvidence = true
				}
				if key.rating == "renown" {
					numerator += value
					continue
				}
				weight := boss.MasteryWeight
				if key.rating == "peak" {
					weight = boss.PeakWeight
				}
				numerator += weight * value
				denominator += weight
			}
			if !hasEvidence {
				continue
			}
			score := numerator
			if key.rating != "renown" {
				score /= denominator
			}
			if math.IsNaN(score) || math.IsInf(score, 0) || score < 0 {
				return written, fmt.Errorf("invalid %s score for raid %q", key.rating, raid.InstanceName)
			}
			perRaid[raid.InstanceName] = score
			if err := store.InsertRatingScopeScore(ctx, ratingScopeParams(generation, tenant, group, key, raid.InstanceName, score)); err != nil {
				return written, err
			}
			written++
		}
		var numerator, denominator float64
		for _, raid := range raids {
			score := perRaid[raid.InstanceName]
			if key.rating == "renown" {
				numerator += score
				continue
			}
			weight := raid.MasteryWeight
			if key.rating == "peak" {
				weight = raid.PeakWeight
			}
			numerator += weight * score
			denominator += weight
		}
		if key.rating != "renown" {
			numerator /= denominator
		}
		if math.IsNaN(numerator) || math.IsInf(numerator, 0) || numerator < 0 {
			return written, fmt.Errorf("invalid global %s score", key.rating)
		}
		if err := store.InsertRatingScopeScore(ctx, ratingScopeParams(generation, tenant, group, key, "", numerator)); err != nil {
			return written, err
		}
		written++
	}
	return written, nil
}

func ratingScopeParams(generation, tenant, group uuid.UUID, key scopeKey, instance string, score float64) database.InsertRatingScopeScoreParams {
	c := key.character
	return database.InsertRatingScopeScoreParams{
		GenerationID: generation, TenantID: tenant, GroupID: group,
		RealmID: c.realm, PlayerGuid: c.player, InstanceName: instance,
		DifficultyName: c.difficulty, MaxPlayers: c.size, PlayerClass: c.class,
		PlayerSpec: c.spec, PlayerSubSpec: c.subSpec, PerformanceMetric: c.metric,
		RatingMetric: key.rating, WindowKind: key.window, Score: score,
	}
}
