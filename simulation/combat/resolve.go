package combat

import (
	"math"
	"math/rand"

	"github.com/Emyrk/chronicle/simulation/gamedata"
)

// CalculateSpellEffectValue computes base damage from a spell effect template.
// Ported from vmangos SpellCaster.cpp:884-963.
func CalculateSpellEffectValue(effect *gamedata.SpellEffect, casterLevel, spellLevel, comboPoints int32, rng *rand.Rand) int32 {
	level := casterLevel
	if spellLevel > 0 && level > spellLevel {
		level = casterLevel
	}

	value := float64(effect.BasePoints)

	// Level scaling
	if spellLevel > 0 && casterLevel > spellLevel {
		value += float64(casterLevel-spellLevel) * float64(effect.PointsPerLevel)
	}

	// Random range: rand between baseDice and dieSides
	if effect.DieSides > 0 {
		minRoll := int32(1)
		if effect.BaseDice > 0 {
			minRoll = effect.BaseDice
		}
		maxRoll := effect.DieSides
		if maxRoll < minRoll {
			minRoll, maxRoll = maxRoll, minRoll
		}
		value += float64(minRoll + rng.Int31n(maxRoll-minRoll+1))
	}

	// Combo point bonus
	if comboPoints > 0 && effect.PointsPerCombo > 0 {
		value += float64(comboPoints) * float64(effect.PointsPerCombo)
	}

	return int32(math.Round(value))
}

// SpellBonusCoefficient returns the spell power coefficient for a given effect.
// Uses the effect's BonusCoefficient if set (>= 0), otherwise computes default.
func SpellBonusCoefficient(spell *gamedata.SpellData, effectIdx int, isDoT bool) float64 {
	eff := &spell.Effects[effectIdx]
	if eff.BonusCoefficient >= 0 {
		return float64(eff.BonusCoefficient)
	}
	// Calculate default: castTime/3500 for direct, duration-based for DoT.
	numTicks := int32(0)
	if isDoT && eff.AuraPeriodMs > 0 && spell.DurationMs > 0 {
		numTicks = spell.DurationMs / eff.AuraPeriodMs
	}
	return DefaultSpellCoefficient(spell.CastTimeMs, spell.DurationMs, isDoT, false, numTicks)
}

// ResolveSpellDamage performs the full spell damage pipeline for one effect.
func ResolveSpellDamage(
	spell *gamedata.SpellData,
	effectIdx int,
	caster, target *CombatUnit,
	rng *rand.Rand,
) DamageResult {
	eff := &spell.Effects[effectIdx]

	// 1. Base damage
	baseDmg := CalculateSpellEffectValue(eff, caster.Level, spell.SpellLevel, 0, rng)

	// 2. Spell power bonus
	coeff := SpellBonusCoefficient(spell, effectIdx, false)
	spellPower := caster.SpellPower[0] // all-schools
	// Add school-specific bonus
	for i := 1; i < gamedata.NumSchools; i++ {
		if spell.School&(1<<i) != 0 && caster.SpellPower[i] > spellPower {
			spellPower = caster.SpellPower[i]
		}
	}
	bonus := float64(spellPower) * coeff * LevelPenalty(spell.SpellLevel)
	totalDmg := float64(baseDmg) + bonus

	// 3. Crit check
	outcome := OutcomeHit
	isCrit := rng.Float64()*100.0 < caster.SpellCrit
	if isCrit {
		totalDmg *= 1.5 // spells crit for 150% in vanilla
		outcome = OutcomeCrit
	}

	// 4. Spell hit check
	hitChance := SpellHitChance(caster.Level, target.Level, caster.SpellHit, target.IsPlayer)
	if rng.Float64()*100.0 >= hitChance {
		return DamageResult{Outcome: OutcomeResist, School: spell.School}
	}

	// 5. Armor mitigation (physical spells only)
	if spell.School == gamedata.SchoolMaskPhysical {
		mitigation := ArmorMitigation(target.Armor, caster.Level)
		totalDmg *= (1.0 - mitigation)
	}

	// 6. Partial resist (non-physical spells)
	var resisted int32
	if spell.School != gamedata.SchoolMaskPhysical {
		resistance := target.GetResistanceForSchool(spell.School)
		avgResist := SpellResistChance(resistance, caster.Level)
		mult := RollPartialResist(rng, avgResist)
		if mult < 1.0 {
			resisted = int32(totalDmg * (1.0 - mult))
			totalDmg *= mult
		}
	}

	if totalDmg < 0 {
		totalDmg = 0
	}

	return DamageResult{
		Damage:   int32(math.Round(totalDmg)),
		Outcome:  outcome,
		School:   spell.School,
		Resisted: resisted,
	}
}

// ResolveMeleeDamage performs the full melee damage pipeline for one swing.
func ResolveMeleeDamage(
	caster, target *CombatUnit,
	attackType AttackType,
	weaponSkill int32,
	rng *rand.Rand,
) DamageResult {
	// 1. Calculate weapon damage range + AP bonus
	var dmgMin, dmgMax float64
	var speedMs int32
	switch attackType {
	case AttackMainHand:
		dmgMin, dmgMax = caster.MHDmgMin, caster.MHDmgMax
		speedMs = caster.MHSpeedMs
	case AttackOffHand:
		dmgMin, dmgMax = caster.OHDmgMin, caster.OHDmgMax
		speedMs = caster.OHSpeedMs
	default:
		dmgMin, dmgMax = caster.MHDmgMin, caster.MHDmgMax
		speedMs = caster.MHSpeedMs
	}

	// AP contribution: AP / 14.0 * (speed in seconds)
	apBonus := float64(caster.AttackPower) / 14.0 * (float64(speedMs) / 1000.0)
	rawDmg := dmgMin + rng.Float64()*(dmgMax-dmgMin) + apBonus

	// Off-hand penalty: 50% damage
	if attackType == AttackOffHand {
		rawDmg *= 0.5
	}

	// 2. Roll melee outcome
	defenseSkill := target.DefenseSkill
	if defenseSkill == 0 {
		defenseSkill = target.Level * 5
	}

	dualWield := caster.OHSpeedMs > 0
	missChance := MeleeMissChance(weaponSkill, defenseSkill, dualWield)
	missChance -= caster.HitChance // subtract hit from gear
	if missChance < 0 {
		missChance = 0
	}

	dodgeChance := 5.0 // base NPC dodge
	parryChance := 0.0 // bosses typically don't parry from behind
	blockChance := 0.0

	// Glancing: 40% chance vs +3 level boss
	glancingChance := 0.0
	levelDiff := target.Level - caster.Level
	if levelDiff > 0 && caster.IsPlayer && !target.IsPlayer {
		glancingChance = 10.0 + float64(levelDiff)*10.0
		if glancingChance > 40.0 {
			glancingChance = 40.0
		}
	}

	outcomeResult := RollMeleeOutcome(
		rng,
		missChance, dodgeChance, parryChance,
		glancingChance,
		blockChance, caster.CritChance, 0,
		true,  // from behind (typical raid scenario)
		false, // not a spell
		weaponSkill,
	)

	// 3. Apply outcome multiplier
	switch outcomeResult.Outcome {
	case OutcomeMiss, OutcomeDodge, OutcomeParry:
		return DamageResult{Outcome: outcomeResult.Outcome, School: gamedata.SchoolMaskPhysical}
	case OutcomeGlancing:
		rawDmg *= outcomeResult.GlancingDmgMult
	case OutcomeCrit:
		rawDmg *= 2.0 // melee crits for 200%
	case OutcomeCrushing:
		rawDmg *= 1.5
	case OutcomeBlock:
		rawDmg -= float64(target.Armor) * 0.01 // simplified block value
		if rawDmg < 0 {
			rawDmg = 0
		}
	}

	// 4. Armor mitigation
	mitigation := ArmorMitigation(target.Armor, caster.Level)
	rawDmg *= (1.0 - mitigation)

	if rawDmg < 0 {
		rawDmg = 0
	}

	return DamageResult{
		Damage:  int32(math.Round(rawDmg)),
		Outcome: outcomeResult.Outcome,
		School:  gamedata.SchoolMaskPhysical,
	}
}
