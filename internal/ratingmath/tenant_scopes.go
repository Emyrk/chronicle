package ratingmath

import (
	"fmt"
	"math"
	"sort"
)

// tenantScopeBoss is one already-projected tenant boss score within a single
// generation, subject, cohort, rating metric and window. The caller must not
// mix cohorts here. Renown scores are already curated earned points.
type tenantScopeBoss struct {
	instance, encounter string
	score               float64
}

type tenantScopeSlot struct{ instance, slot string }

// tenantScopeScores computes raid-only scores. Every observed boss has equal
// weight; unobserved bosses are omitted. ZG Edge variants occupy one slot,
// choosing the best variant, while curated Renown always sums individual awards.
func tenantScopeScores(rating string, bosses []tenantScopeBoss) (map[string]float64, error) {
	if rating != "peak" && rating != "mastery" && rating != "ranked_mastery" && rating != "renown" {
		return nil, fmt.Errorf("unsupported tenant scope rating %q", rating)
	}
	slots := make(map[tenantScopeSlot]float64, len(bosses))
	seen := make(map[BossKey]bool, len(bosses))
	for _, boss := range bosses {
		key := BossKey{Instance: boss.instance, Encounter: boss.encounter}
		if boss.instance == "" || boss.encounter == "" || seen[key] || boss.score < 0 || math.IsNaN(boss.score) || math.IsInf(boss.score, 0) {
			return nil, fmt.Errorf("invalid tenant boss score for %q/%q", boss.instance, boss.encounter)
		}
		seen[key] = true
		slot := tenantScopeSlot{boss.instance, boss.encounter}
		if rating != "renown" && boss.instance == "Zul'Gurub" {
			switch boss.encounter {
			case "Gri'lek", "Hazza'rah", "Renataki", "Wushoolay":
				slot.slot = "Edge of Madness"
			}
		}
		if value, ok := slots[slot]; !ok || boss.score > value {
			slots[slot] = boss.score
		}
	}
	ordered := make([]tenantScopeSlot, 0, len(slots))
	for slot := range slots {
		ordered = append(ordered, slot)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].instance != ordered[j].instance {
			return ordered[i].instance < ordered[j].instance
		}
		return ordered[i].slot < ordered[j].slot
	})
	totals := make(map[string]float64)
	counts := make(map[string]int)
	for _, slot := range ordered {
		totals[slot.instance] += slots[slot]
		counts[slot.instance]++
	}
	for raid, score := range totals {
		if rating != "renown" {
			score /= float64(counts[raid])
		}
		if math.IsNaN(score) || math.IsInf(score, 0) {
			return nil, fmt.Errorf("tenant raid score overflow for %q", raid)
		}
		totals[raid] = score
	}
	return totals, nil
}
