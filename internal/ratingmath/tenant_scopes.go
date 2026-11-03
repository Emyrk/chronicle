package ratingmath

import (
	"fmt"
	"math"
)

// tenantScopeBoss is one already-projected tenant boss score within a single
// generation, subject, cohort, rating metric and window. Slot identifies a
// logical boss: rotating variants may share one slot, rather than occupying
// several denominator positions. The caller must not mix cohorts here.
// Renown scores are already curated points and are always summed as written.
type tenantScopeBoss struct {
	instance, encounter, slot string
	score                     float64
}

type tenantScopeSlot struct{ instance, slot string }

// tenantScopeScores computes scores only for raids with observed boss scores.
// Competitive ratings average observed logical boss slots, then observed
// raids, using explicitly supplied boss and raid weights. The caller must
// freeze these weights with its generation checkpoint before writing scores.
// Rotating variants in one slot contribute the best observed score once.
// Renown sums earned points and ignores weights. No realm-group manifest or
// boss allowlist applies.
func tenantScopeScores(rating string, bosses []tenantScopeBoss, bossWeights map[tenantScopeSlot]float64, raidWeights map[string]float64) (map[string]float64, float64, error) {
	if rating != "peak" && rating != "mastery" && rating != "ranked_mastery" && rating != "renown" {
		return nil, 0, fmt.Errorf("unsupported tenant scope rating %q", rating)
	}
	slots := make(map[tenantScopeSlot]float64, len(bosses))
	seen := make(map[BossKey]bool, len(bosses))
	for _, boss := range bosses {
		key := BossKey{Instance: boss.instance, Encounter: boss.encounter}
		if boss.instance == "" || boss.encounter == "" || boss.slot == "" || seen[key] || boss.score < 0 || math.IsNaN(boss.score) || math.IsInf(boss.score, 0) {
			return nil, 0, fmt.Errorf("invalid tenant boss score for %q/%q", boss.instance, boss.encounter)
		}
		seen[key] = true
		if rating == "renown" {
			// Renown awards are per kill, not an average of rotating slots.
			slots[tenantScopeSlot{boss.instance, boss.encounter}] = boss.score
			continue
		}
		slot := tenantScopeSlot{boss.instance, boss.slot}
		if value, ok := slots[slot]; !ok || boss.score > value {
			slots[slot] = boss.score
		}
	}
	if len(slots) == 0 {
		return nil, 0, nil
	}
	raids := make(map[string]float64)
	bossTotals := make(map[string]float64)
	for slot, score := range slots {
		if rating == "renown" {
			raids[slot.instance] += score
			continue
		}
		weight := bossWeights[slot]
		if weight <= 0 || math.IsNaN(weight) || math.IsInf(weight, 0) {
			return nil, 0, fmt.Errorf("missing or invalid tenant boss weight for %q/%q", slot.instance, slot.slot)
		}
		raids[slot.instance] += score * weight
		bossTotals[slot.instance] += weight
	}
	var numerator, denominator float64
	for raid, score := range raids {
		if rating == "renown" {
			numerator += score
		} else {
			score /= bossTotals[raid]
			weight := raidWeights[raid]
			if weight <= 0 || math.IsNaN(weight) || math.IsInf(weight, 0) {
				return nil, 0, fmt.Errorf("missing or invalid tenant raid weight for %q", raid)
			}
			numerator += score * weight
			denominator += weight
		}
		if math.IsNaN(score) || math.IsInf(score, 0) {
			return nil, 0, fmt.Errorf("tenant raid score overflow for %q", raid)
		}
		raids[raid] = score
	}
	if rating != "renown" {
		numerator /= denominator
	}
	if math.IsNaN(numerator) || math.IsInf(numerator, 0) || numerator < 0 {
		return nil, 0, fmt.Errorf("tenant global score overflow")
	}
	return raids, numerator, nil
}
