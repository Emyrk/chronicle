// Package wowspec provides World of Warcraft talent specialization inference.
package wowspec

import (
	"math"
	"sort"

	"github.com/Emyrk/chronicle/internal/roleinfer"
)

// specMap maps class name → [3]talent tree spec names (tree0, tree1, tree2).
var specMap = map[string][3]string{
	"WARRIOR":      {"Arms", "Fury", "Protection"},
	"PALADIN":      {"Holy", "Protection", "Retribution"},
	"HUNTER":       {"Beast Mastery", "Marksmanship", "Survival"},
	"ROGUE":        {"Assassination", "Combat", "Subtlety"},
	"PRIEST":       {"Discipline", "Holy", "Shadow"},
	"SHAMAN":       {"Elemental", "Enhancement", "Restoration"},
	"MAGE":         {"Arcane", "Fire", "Frost"},
	"WARLOCK":      {"Affliction", "Demonology", "Destruction"},
	"DRUID":        {"Balance", "Feral", "Restoration"},
	"DEATH_KNIGHT": {"Blood", "Frost", "Unholy"},
}

// InferSpec returns the broad specialization name for the given class and
// talent point distribution. The talentSummary must contain the total points
// spent in each of the class's three talent trees (index 0, 1, 2).
//
// Returns "Unknown" when the class is unrecognized or all talent points are zero.
// Ties are broken by lowest index (conventional tree ordering).
func InferSpec(class string, talentSummary [3]uint8) string {
	trees, ok := specMap[class]
	if !ok {
		return "Unknown"
	}

	// All zeros means no talent data available.
	if talentSummary[0] == 0 && talentSummary[1] == 0 && talentSummary[2] == 0 {
		return "Unknown"
	}

	// Find tree with the most points. Ties go to the lowest index.
	best := 0
	for i := 1; i < 3; i++ {
		if talentSummary[i] > talentSummary[best] {
			best = i
		}
	}

	return trees[best]
}

// Classes returns all recognized class names.
func Classes() []string {
	out := make([]string, 0, len(specMap))
	for k := range specMap {
		out = append(out, k)
	}
	return out
}

// TreeNames returns the three talent tree names for the given class,
// or an empty array if the class is unrecognized.
func TreeNames(class string) [3]string {
	return specMap[class]
}

// Role constants.
const (
	RoleDPS  = "dps"
	RoleHeal = "heal"
	RoleTank = "tank"
)

// Role detection thresholds.
// Must match frontend Roles/roles.processor.ts thresholds exactly.
const (
	HealerZThreshold     = 0.3   // healing done ≥ 0.3σ above mean (~62nd percentile)
	LowDPSPercentile     = 0.185 // damage done in the bottom 18.5%
	HealerHighZThreshold = 1.5   // healing done ≥ 1.5σ bypasses damage check (~93rd percentile)
)

// PlayerMetrics holds the metrics needed for role inference.
type PlayerMetrics struct {
	DamageDone  int64
	HealingDone int64 // should include absorbs (e.g. Power Word: Shield) for accurate healer detection
	// IncomingAutoAttacks maps hostile source → number of Auto Attack attempts
	// directed at this player (including zero-damage misses, dodges, parries).
	// Used by roleinfer for source-aware tank inference.
	IncomingAutoAttacks map[string]int
}

// InferRoles classifies each player's role using source-aware tank inference
// (via roleinfer) and statistical healer detection.
// Returns a map of player ID → role string ("dps", "heal", "tank").
//
// Tank detection uses the roleinfer algorithm: for each hostile source that
// auto-attacked players, score = playerAttempts / (maxAttempts + 5). A player's
// TankScore is the max sourceScore across all sources. Tank when ≥ 0.5.
//
// Healer detection uses z-score outlier analysis on healing done.
//
// Priority: Tank > Healer > DPS.
func InferRoles[K comparable](players map[K]PlayerMetrics) map[K]string {
	roles := make(map[K]string, len(players))
	if len(players) == 0 {
		return roles
	}

	// Build roleinfer input: source → player → attempt count.
	attacks := make(roleinfer.IncomingAutoAttacks[string, K])
	for k, m := range players {
		for src, count := range m.IncomingAutoAttacks {
			targets := attacks[src]
			if targets == nil {
				targets = make(map[K]int)
				attacks[src] = targets
			}
			targets[k] = count
		}
	}
	tankResults := roleinfer.InferTanks(attacks)

	// Collect values for healer stats.
	hdValues := make([]float64, 0, len(players))
	ddValues := make([]float64, 0, len(players))
	for _, m := range players {
		hdValues = append(hdValues, float64(m.HealingDone))
		ddValues = append(ddValues, float64(m.DamageDone))
	}

	hdMean, hdStd := meanStdDev(hdValues)
	lowDPSCutoff := percentile(ddValues, LowDPSPercentile)

	for k, m := range players {
		isTank := false
		if tr, ok := tankResults[k]; ok {
			isTank = tr.IsTank
		}

		hdZ := zScore(float64(m.HealingDone), hdMean, hdStd)

		// Healer detection:
		// 1. Must have done meaningful healing (> 0)
		// 2. Healing z-score must be above threshold
		// 3. Healing must exceed damage done (prevents DPS self-healers)
		// 4. Must also have low DPS OR very high healing
		var isHealer bool
		if m.HealingDone > 0 && m.HealingDone > m.DamageDone {
			hasHealing := hdZ >= HealerZThreshold
			hasLowDPS := float64(m.DamageDone) <= lowDPSCutoff
			hasHighHealing := hdZ >= HealerHighZThreshold
			isHealer = hasHealing && (hasLowDPS || hasHighHealing)
		}

		if isTank {
			roles[k] = RoleTank
		} else if isHealer {
			roles[k] = RoleHeal
		} else {
			roles[k] = RoleDPS
		}
	}

	return roles
}

func meanStdDev(values []float64) (float64, float64) {
	if len(values) == 0 {
		return 0, 0
	}
	var sum float64
	for _, v := range values {
		sum += v
	}
	avg := sum / float64(len(values))
	if len(values) < 2 {
		return avg, 0
	}
	var sqDiffSum float64
	for _, v := range values {
		d := v - avg
		sqDiffSum += d * d
	}
	return avg, math.Sqrt(sqDiffSum / float64(len(values)))
}

func percentile(values []float64, fraction float64) float64 {
	if len(values) == 0 {
		return 0
	}

	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	position := float64(len(sorted)-1) * fraction
	lowerIndex := int(math.Floor(position))
	upperIndex := int(math.Ceil(position))
	weight := position - float64(lowerIndex)

	return sorted[lowerIndex] + (sorted[upperIndex]-sorted[lowerIndex])*weight
}

func zScore(value, avg, sd float64) float64 {
	if sd == 0 {
		if value > avg {
			return math.Inf(1)
		}
		return 0
	}
	return (value - avg) / sd
}
