package chrondbc

import (
	"time"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
)

// MaxAuraDuration returns the theoretical maximum duration for a spell,
// assuming every possible duration modifier talent is active at max rank.
// Returns the base MaxDuration for spells with no modifiers.
// Returns -1ms for permanent auras, 0 for instant/no duration.
func MaxAuraDuration(spell *Spell) time.Duration {
	dur := spell.Duration
	if dur.MaxDuration <= 0 {
		return time.Duration(dur.MaxDuration) * time.Millisecond
	}

	bitMap, ok := dbcmem.DurationModifiersByClassBit[int32(spell.SpellClassSet)]
	if !ok {
		return time.Duration(dur.MaxDuration) * time.Millisecond
	}

	// Collect all matching modifiers via bit decomposition.
	mask := uint64(spell.SpellClassMask)
	seen := make(map[int32]bool)
	var matched []dbcmem.DurationModifier
	for bit := uint64(0); bit < 64; bit++ {
		b := uint64(1) << bit
		if mask&b == 0 {
			continue
		}
		for _, id := range bitMap[b] {
			if seen[id] {
				continue
			}
			seen[id] = true
			mod := dbcmem.DurationModifiers[id]
			if mod.Deprecated {
				continue
			}
			matched = append(matched, mod)
		}
	}

	if len(matched) == 0 {
		return time.Duration(dur.MaxDuration) * time.Millisecond
	}

	// A player can only have one rank of each talent. Group by name
	// and keep the strongest rank to get the true maximum.
	best := make(map[string]dbcmem.DurationModifier)
	for _, mod := range matched {
		prev, exists := best[mod.Name]
		if !exists || mod.Percent > prev.Percent || mod.Flat > prev.Flat {
			best[mod.Name] = mod
		}
	}

	// Sum the best rank of each distinct talent, skipping any that
	// would reduce duration (we want the theoretical maximum).
	var totalPct, totalFlat int32
	for _, mod := range best {
		if mod.Percent > 0 {
			totalPct += mod.Percent
		}
		if mod.Flat > 0 {
			totalFlat += mod.Flat
		}
	}

	base := time.Duration(dur.MaxDuration) * time.Millisecond
	result := base + time.Duration(totalFlat)*time.Millisecond
	if totalPct != 0 {
		result = time.Duration(float64(result) * (1.0 + float64(totalPct)/100.0))
	}
	return result
}
