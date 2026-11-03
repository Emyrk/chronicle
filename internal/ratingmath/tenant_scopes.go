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
	// Peak only: the best kill's DPS/HPS and fight length, 0 when unknown.
	raw, duration float64
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

// tenantScopeThroughput is a raid Peak's DPS/HPS over the same slots its score
// counts (ZG Edge variants keep their best-scoring kill): total output over total
// fight time, so long fights weigh more than short ones. ok is false when any
// counted kill lacks its throughput or length, rather than reporting a partial raid.
func tenantScopeThroughput(bosses []tenantScopeBoss) (raw, duration float64, ok bool) {
	chosen := make(map[tenantScopeSlot]tenantScopeBoss, len(bosses))
	for _, boss := range bosses {
		slot := tenantScopeSlot{boss.instance, boss.encounter}
		if boss.instance == "Zul'Gurub" {
			switch boss.encounter {
			case "Gri'lek", "Hazza'rah", "Renataki", "Wushoolay":
				slot.slot = "Edge of Madness"
			}
		}
		if prev, seen := chosen[slot]; !seen || boss.score > prev.score || (boss.score == prev.score && boss.raw > prev.raw) {
			chosen[slot] = boss
		}
	}
	var output float64
	for _, boss := range chosen {
		if boss.raw <= 0 || boss.duration <= 0 || math.IsNaN(boss.raw) || math.IsInf(boss.raw, 0) || math.IsNaN(boss.duration) || math.IsInf(boss.duration, 0) {
			return 0, 0, false
		}
		output += boss.raw * boss.duration
		duration += boss.duration
	}
	if duration <= 0 {
		return 0, 0, false
	}
	return output / duration, duration, true
}

func tenantSlot(instance, encounter string) tenantScopeSlot {
	slot := tenantScopeSlot{instance, encounter}
	if instance == "Zul'Gurub" {
		switch encounter {
		case "Gri'lek", "Hazza'rah", "Renataki", "Wushoolay":
			slot.slot = "Edge of Madness"
		}
	}
	return slot
}

// tenantRaidPeak is a raid Peak over the raid's roster: every boss counts,
// optional ones included, a missed one as 0, so 100 means a 100 Peak on every
// boss. ZG's Edge of Madness is one slot (one of four is up per reset). Kills
// outside the roster are ignored.
// ok is false without a roster (an uncurated raid), where callers keep the
// observed-boss average.
func tenantRaidPeak(bosses []tenantScopeBoss, roster []string) (score float64, ok bool) {
	if len(roster) == 0 || len(bosses) == 0 {
		return 0, false
	}
	instance := bosses[0].instance
	slots := make(map[tenantScopeSlot]bool, len(roster))
	for _, encounter := range roster {
		slots[tenantSlot(instance, encounter)] = true
	}
	best := make(map[tenantScopeSlot]float64, len(bosses))
	for _, boss := range bosses {
		slot := tenantSlot(boss.instance, boss.encounter)
		if !slots[slot] {
			continue
		}
		if value, seen := best[slot]; !seen || boss.score > value {
			best[slot] = boss.score
		}
	}
	var total float64
	var count int
	for slot := range slots {
		total += best[slot]
		count++
	}
	if count == 0 {
		return 0, false
	}
	return total / float64(count), true
}
