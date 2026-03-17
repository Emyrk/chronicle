package combat

import "math/rand"

// ArmorMitigation returns the fraction of physical damage mitigated by armor.
// Ported from vmangos SpellCaster.cpp:858-882.
// Formula: 0.1*armor / (8.5*attackerLevel + 40), capped at 0.75.
func ArmorMitigation(armor, attackerLevel int32) float64 {
	if armor < 0 {
		armor = 0
	}
	a := float64(armor)
	denom := 8.5*float64(attackerLevel) + 40.0
	tmpvalue := 0.1 * a / denom
	tmpvalue = tmpvalue / (1.0 + tmpvalue)
	if tmpvalue < 0 {
		tmpvalue = 0
	}
	if tmpvalue > 0.75 {
		tmpvalue = 0.75
	}
	return tmpvalue
}

// SpellHitChance returns the chance (0-100) for a spell to land.
// Ported from vmangos SpellCaster.cpp:498-606.
func SpellHitChance(attackerLevel, victimLevel int32, attackerSpellHit float64, victimIsPlayer bool) float64 {
	levelDiff := victimLevel - attackerLevel
	lchance := 11.0
	if victimIsPlayer {
		lchance = 7.0
	}
	var modHitChance float64
	if levelDiff < 3 {
		modHitChance = 96.0 - float64(levelDiff)
	} else {
		modHitChance = 94.0 - float64(levelDiff-2)*lchance
	}
	if modHitChance < 22 {
		modHitChance = 22
	}
	modHitChance += attackerSpellHit
	if modHitChance < 1 {
		modHitChance = 1
	}
	if modHitChance > 99 {
		modHitChance = 99
	}
	return modHitChance
}

// SpellResistChance returns the average partial resist fraction (0.0-0.75).
// Ported from vmangos SpellCaster.cpp:608-651.
func SpellResistChance(victimResistance, attackerLevel int32) float64 {
	if attackerLevel <= 0 {
		return 0
	}
	resist := float64(victimResistance) * 0.15 / float64(attackerLevel)
	if resist < 0 {
		resist = 0
	}
	if resist > 0.75 {
		resist = 0.75
	}
	return resist
}

// RollPartialResist rolls a partial resist multiplier using the discrete
// bucket system: returns 1.0, 0.75, 0.5, 0.25, or 0.0.
// averageResist is from SpellResistChance.
func RollPartialResist(rng *rand.Rand, averageResist float64) float64 {
	if averageResist <= 0 {
		return 1.0
	}
	roll := rng.Float64()
	// Approximate bucket probabilities based on average resist.
	// At avg resist R: P(0%) = ~R*0.24, P(25%) = ~R*0.48, P(50%) = ~R*0.24, P(75%) = ~R*0.04
	// Simplified: use linear interpolation across buckets.
	p0 := averageResist * averageResist                // chance of 100% resist
	p25 := averageResist * 2.0 * (1.0 - averageResist) // chance of 75% resist (25% dmg reduction)
	p50 := (1.0 - averageResist) * (1.0 - averageResist) * averageResist * 2.0
	// Clamp total
	if p0+p25+p50 > 1.0 {
		p50 = 1.0 - p0 - p25
	}

	if roll < p0 {
		return 0.0
	}
	if roll < p0+p25 {
		return 0.25
	}
	if roll < p0+p25+p50 {
		return 0.5
	}
	if roll < p0+p25+p50+(averageResist*0.5) {
		return 0.75
	}
	return 1.0
}

// --- Turtle WoW Glancing Blow System (New System) ---
//
// Glancing blow damage scales linearly with weapon skill:
//   damage% = 0.65 + 0.02 * (weaponSkill - 300), clamped to [0.65, 0.95]
// Miss probability from glancing table:
//   miss% = 8.0 - 0.2 * (weaponSkill - 300), clamped to [5.0, 8.0]
// Glancing blow chance against +3 level boss: fixed 40%.

// TurtleGlancingDamage returns the glancing blow damage multiplier for
// the Turtle WoW "New System". Range: [0.65, 0.95].
func TurtleGlancingDamage(weaponSkill int32) float64 {
	if weaponSkill <= 300 {
		return 0.65
	}
	dmg := 0.65 + 0.02*float64(weaponSkill-300)
	if dmg > 0.95 {
		dmg = 0.95
	}
	return dmg
}

// TurtleGlancingMissReduction returns the miss probability reduction
// granted by weapon skill in the Turtle WoW "New System".
// Base miss is 8% at 300 skill, reduced by 0.2% per skill point.
func TurtleGlancingMissReduction(weaponSkill int32) float64 {
	if weaponSkill <= 300 {
		return 8.0
	}
	miss := 8.0 - 0.2*float64(weaponSkill-300)
	if miss < 5.0 {
		miss = 5.0
	}
	return miss
}

// MeleeOutcomeResult holds the outcome of a melee attack roll.
type MeleeOutcomeResult struct {
	Outcome         Outcome
	GlancingDmgMult float64 // only meaningful if Outcome == OutcomeGlancing
}

// RollMeleeOutcome performs the two-roll cumulative melee outcome table.
// Ported from vmangos Unit.cpp:2234-2427 with Turtle WoW glancing modifications.
//
// Params are percentages (0-100). fromBehind disables dodge/parry/block.
// isSpell indicates a melee spell (no glancing, no crushing).
func RollMeleeOutcome(
	rng *rand.Rand,
	missChance, dodgeChance, parryChance float64,
	glancingChance float64, // typically 40% vs boss
	blockChance, critChance, crushingChance float64,
	fromBehind, isSpell bool,
	weaponSkill int32,
) MeleeOutcomeResult {
	roll := rng.Float64() * 100.0
	sum := 0.0

	// 1. Miss
	sum += missChance
	if roll < sum {
		return MeleeOutcomeResult{Outcome: OutcomeMiss}
	}

	// 2. Dodge (not from behind)
	if !fromBehind {
		sum += dodgeChance
		if roll < sum {
			return MeleeOutcomeResult{Outcome: OutcomeDodge}
		}
	}

	// 3. Parry (not from behind, not if parryChance is 0)
	if !fromBehind && parryChance > 0 {
		sum += parryChance
		if roll < sum {
			return MeleeOutcomeResult{Outcome: OutcomeParry}
		}
	}

	// 4. Glancing blow (only for non-spell melee, player attacking NPC)
	if !isSpell && glancingChance > 0 {
		sum += glancingChance
		if roll < sum {
			return MeleeOutcomeResult{
				Outcome:         OutcomeGlancing,
				GlancingDmgMult: TurtleGlancingDamage(weaponSkill),
			}
		}
	}

	// 5. Block (not from behind)
	if !fromBehind && blockChance > 0 {
		sum += blockChance
		if roll < sum {
			return MeleeOutcomeResult{Outcome: OutcomeBlock}
		}
	}

	// 6. Crit
	if critChance > 0 {
		sum += critChance
		if roll < sum {
			return MeleeOutcomeResult{Outcome: OutcomeCrit}
		}
	}

	// 7. Crushing blow (only NPC attacking, not spell)
	if !isSpell && crushingChance > 0 {
		sum += crushingChance
		if roll < sum {
			return MeleeOutcomeResult{Outcome: OutcomeCrushing}
		}
	}

	// 8. Normal hit
	return MeleeOutcomeResult{Outcome: OutcomeHit}
}

// MeleeMissChance computes the base miss chance for a melee attack.
// Uses Turtle WoW new system for weapon skill > 300.
// dualWield adds 19% miss for dual-wielding.
func MeleeMissChance(attackerWeaponSkill, victimDefenseSkill int32, dualWield bool) float64 {
	skillDiff := victimDefenseSkill - attackerWeaponSkill
	var miss float64
	if skillDiff <= 10 {
		miss = 5.0 + float64(skillDiff)*0.1
	} else {
		miss = 5.0 + float64(skillDiff)*0.2
	}

	// Turtle WoW: weapon skill above 300 reduces miss.
	// Each point 300→315 reduces miss by 0.2%.
	if attackerWeaponSkill > 300 {
		bonus := float64(attackerWeaponSkill-300) * 0.2
		miss -= bonus
	}

	if dualWield {
		miss += 19.0
	}
	if miss < 0 {
		miss = 0
	}
	return miss
}

// DefaultSpellCoefficient calculates the default spell power coefficient.
// Ported from vmangos SpellEntry.cpp:619-636.
//
// Direct damage: castTimeMs / 3500.0
// DoT (non-channeled): durationMs / 15000.0
// DoT (channeled): 1.0
// Per-tick: divide total by number of ticks.
func DefaultSpellCoefficient(castTimeMs, durationMs int32, isDoT, isChanneled bool, numTicks int32) float64 {
	if isDoT {
		if isChanneled {
			if numTicks > 0 {
				return 1.0 / float64(numTicks)
			}
			return 1.0
		}
		totalCoeff := float64(durationMs) / 15000.0
		if numTicks > 0 {
			return totalCoeff / float64(numTicks)
		}
		return totalCoeff
	}
	return float64(castTimeMs) / 3500.0
}

// LevelPenalty returns the low-level spell scaling penalty.
// Ported from vmangos SpellCaster.cpp:1542-1561.
func LevelPenalty(spellLevel int32) float64 {
	if spellLevel <= 0 || spellLevel > 20 {
		return 1.0
	}
	penalty := 1.0 - float64(20-spellLevel)*0.0375
	if penalty < 0 {
		penalty = 0
	}
	return penalty
}

// NormalizedWeaponSpeed returns the normalized weapon speed in ms for
// instant melee attacks. Used for AP contribution calculation.
func NormalizedWeaponSpeed(inventoryType int32) int32 {
	switch inventoryType {
	case 13: // 1H sword/mace/axe
		return 2400
	case 17: // 2H weapon
		return 3300
	case 15: // ranged
		return 2800
	default:
		// Daggers and other
		return 1700
	}
}
