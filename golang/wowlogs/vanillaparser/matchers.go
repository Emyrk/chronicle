package vanillaparser

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/regexs"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/castv2"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/loot"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
)

func (p *Parser) fV2Casts(ts time.Time, content string) ([]Message, error) {
	if _, ok := castv2.IsCast(content); !ok {
		return notHandled()
	}

	c, err := castv2.ParseCast(content)
	if err != nil {
		return nil, fmt.Errorf("castv2: %w", err)
	}

	p.state.CastV2(c)

	return set(Cast{
		CastV2:      c,
		MessageBase: Base(ts),
	}), nil
}

func (p *Parser) fLoot(ts time.Time, content string) ([]Message, error) {
	if !strings.HasPrefix(content, loot.PrefixLoot) {
		return notHandled()
	}

	li, err := loot.ParseLootInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse zone info: %v", err)
	}

	var _ = li // TODO: use loot info

	return Skip(ts, "loot info"), nil
}

func (p *Parser) fZoneInfo(ts time.Time, content string) ([]Message, error) {
	if !strings.HasPrefix(content, zone.PrefixZone) {
		return notHandled()
	}

	zi, err := zone.ParseZoneInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse zone info: %v", err)
	}

	var _ = zi // TODO: use zone info

	return Skip(ts, "zone info"), nil
}

func (p *Parser) fCombatantInfo(ts time.Time, content string) ([]Message, error) {
	if !strings.HasPrefix(content, combatant.PrefixCombatant) {
		return notHandled()
	}

	cbt, err := combatant.ParseCombatantInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	p.state.Combatant(cbt)

	return set(Combatant{
		Combatant:   cbt,
		MessageBase: Base(ts),
	}), nil
}

func (p *Parser) fCombatantGUID(ts time.Time, content string) ([]Message, error) {
	if !strings.HasPrefix(content, "COMBATANT_GUID:") {
		return notHandled()
	}

	_, err := combatant.ParseCombatantGUID(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant guid: %v", err)
	}

	return Skip(ts, "combatant guid"), nil
}

func (p *Parser) fBugDamageSpellHitOrCrit(ts time.Time, content string) ([]Message, error) {
	if !regexs.ReBugDamageSpellHitOrCrit.MatchString(content) {
		return notHandled()
	}

	p.logger.Error("bugged line in logs, skipping",
		slog.String("content", content),
	)
	return Skip(ts, "bugged line in logs"), nil
}

// 10/29 22:09:40.825  Randgriz begins to cast Flash Heal.
// 10/29 22:09:42.175  Randgriz casts Flash Heal on Katrix.
// 10/29 22:09:42.175  Randgriz 's Flash Heal critically heals Katrix for 2534.
func (p *Parser) fSpellCastAttempt(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReSpellCastAttempt.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//unit, spell := matches[1], matches[2]
	return Skip(ts, "handled castsv2"), nil
}

func (p *Parser) fGain(ts time.Time, content string) ([]Message, error) {
	matched, ok := types.FromRegex(regexs.ReGain).Match(content)
	if !ok {
		return notHandled()
	}

	_, targetGUID := matched.UnitOrGUID()
	direction := matched.String()
	amount := matched.Int32()
	resource := matched.Resource()
	_, casterGUID := matched.UnitOrGUID()
	spellName := matched.String()

	if err := matched.Error(); err != nil {
		return nil, fmt.Errorf("gain: %w", err)
	}

	if targetGUID.IsZero() || casterGUID.IsZero() {
		return Skip(ts, "gain: not using guids"), nil
	}

	return set(ResourceChange{
		MessageBase: Base(ts),
		Target:      targetGUID,
		Amount:      amount,
		Resource:    resource,
		Caster:      casterGUID,
		SpellName:   spellName,
		Direction:   direction,
	}), nil
}

/**
 * Spell Damage
 */
// 11/18 07:21:45.192  0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage.
func (p *Parser) fDamageSpellHitOrCrit(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellHitOrCrit).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	hitType := matches.HitType()
	_, target := matches.UnitOrGUID()
	amount := matches.Int32()
	trailer := matches.Trailer()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellHitOrCrit: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageSpellHitOrCrit: not using guids"), nil
	}

	// Add the hitmask from the main line to the trailer entries
	for i := range trailer {
		trailer[i].HitType = trailer[i].HitType | hitType
	}

	return set(SpellDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		HitType:     hitType,
		Target:      target,
		Amount:      amount,
		Trailer:     trailer,
	}), nil
}

func (p *Parser) fDamageSpellHitOrCritSchool(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellHitOrCritSchool.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, hitMask, victom, damage, school, trailer := matches[1], matches[2], matches[3], matches[4], matches[5], matches[6], matches[7]
	// Return spell cast & spell damage message
	return Skip(ts, "DamageSpellHitOrCritSchool not implemented"), nil
}

func (p *Parser) fDamagePeriodic(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamagePeriodic.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//victim, damage, school, attacker, spellID, trailer := matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]
	// return spell cast and spell damage message
	return Skip(ts, "DamagePeriodic not implemented"), nil
}

func (p *Parser) fDamageShield(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageShield.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, damage, school, victom := matches[1], matches[2], matches[3], matches[4]
	//spellID := 2 // reflection spell ID?

	// Return spell cast & spell damage message
	return Skip(ts, "DamageShield not implemented"), nil
}

/**
 * Melee Damage
 */

func (p *Parser) fDamageHitOrCrit(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageHitOrCrit.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, hitMask, victim, damage, trailer := matches[1], matches[2], matches[3], matches[4], matches[5]

	// Return melee damage message
	return Skip(ts, "DamageHitOrCrit not implemented"), nil
}

func (p *Parser) fDamageHitOrCritSchool(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageHitOrCritSchool.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, hitMask, victim, damage, school, trailer := matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]

	// Return melee damage message
	return Skip(ts, "DamageHitOrCritSchool not implemented"), nil
}

/**
 * Heal
 */

func (p *Parser) fHealCrit(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReHealCrit.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//caster, spellID, target, amount := matches[1], matches[2], matches[4]

	// return spell cast & heal message
	return Skip(ts, "HealCrit not implemented"), nil
}

func (p *Parser) fHealHit(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReHealHit.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	// caster, spellID, target, amount := matches[1], matches[2], matches[3], matches[4]

	// return spell cast & heal message
	return Skip(ts, "HealHit not implemented"), nil
}

/**
 * Aura Application
 */

func (p *Parser) fAuraGainHarmfulHelpful(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReAuraGainHarmfulHelpful.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//target, spellID, stackAmount := matches[1], matches[3], matches[4]

	// return aura application message
	return Skip(ts, "AuraGainHarmfulHelpful not implemented"), nil
}

func (p *Parser) fAuraFade(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReAuraFade.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//target, spellID := matches[2], matches[1]

	// return aura application message
	return Skip(ts, "AuraFade not implemented"), nil
}

/**
 * Spell Damage cont
 */
func (p *Parser) fDamageSpellSplit(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellSplit.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, victim, amount, trailer := matches[1], matches[2], matches[3], matches[4], matches[5]

	// Return spell cast & SpellDamage Message
	return Skip(ts, "DamageSpellSplit not implemented"), nil
}

func (p *Parser) fDamageSpellMiss(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellMiss.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, victim := matches[1], matches[2], matches[4]
	return Skip(ts, "DamageSpellMiss not implemented"), nil
}

func (p *Parser) fDamageSpellBlockParryEvadeDodgeResistDeflect(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellBlockParryEvadeDodgeResistDeflect.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, hitType, vuctim := matches[1], matches[2], matches[3], matches[4]
	return Skip(ts, "DamageSpellBlockParryEvadeDodgeResistDeflect not implemented"), nil
}

func (p *Parser) fDamageSpellAbsorb(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellAbsorb.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, victim := matches[1], matches[2], matches[3]
	return Skip(ts, "DamageSpellAbsorb not implemented"), nil
}

func (p *Parser) fDamageSpellAbsorbSelf(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellAbsorbSelf.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//victim, attacker, spellID := matches[1], matches[2], matches[3]
	return Skip(ts, "DamageSpellAbsorbSelf not implemented"), nil
}

func (p *Parser) fDamageReflect(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageReflect.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, victim := matches[1], matches[2], matches[3]
	return Skip(ts, "DamageReflect not implemented"), nil
}

func (p *Parser) fDamageProcResist(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageProcResist.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//victim, attacker, spellID := matches[1], matches[2], matches[3]
	return Skip(ts, "DamageProcResist not implemented"), nil
}

func (p *Parser) fDamageSpellImmune(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellImmune.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, victim := matches[1], matches[2], matches[3]
	return Skip(ts, "DamageSpellImmune not implemented"), nil
}

/**
 * Melee Damage cont
 */

func (p *Parser) fDamageMiss(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageMiss.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, victim := matches[1], matches[2]
	return Skip(ts, "DamageMiss not implemented"), nil
}

func (p *Parser) fDamageBlockParryEvadeDodgeDeflect(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageBlockParryEvadeDodgeDeflect.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, victim, hitType := matches[1], matches[2], matches[3]
	return Skip(ts, "DamageBlockParryEvadeDodgeResistDeflect not implemented"), nil
}

func (p *Parser) fDamageAbsorbResist(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageAbsorbResist.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, victim, hitType := matches[1], matches[2], matches[3]

	return Skip(ts, "DamageAbsorbResist not implemented"), nil
}

func (p *Parser) fDamageImmune(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageImmune.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, victom := matches[1], matches[2]
	return Skip(ts, "DamageImmune not implemented"), nil
}

/**
 * Spell Casts
 */

func (p *Parser) fSpellCastPerformDurability(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReSpellCastPerformDurability.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//caster, spellID, target := matches[1], matches[3], matches[4]
	return Skip(ts, "SpellCastPerformDurability not implemented"), nil
}

func (p *Parser) fSpellCastPerform(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReSpellCastPerform.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//caster, spellID, target := matches[1], matches[3], matches[4]
	return Skip(ts, "SpellCastPerform not implemented"), nil
}

func (p *Parser) fSpellCastPerformUnknown(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReSpellCastPerformUnknown.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//caster, spellID := matches[1], matches[3]
	return Skip(ts, "SpellCastPerformUnknown not implemented"), nil
}

/**
 * Unit Death
 */

func (p *Parser) fUnitDieDestroyed(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReUnitDieDestroyed.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//unit := matches[1]
	return Skip(ts, "UnitDieDestroyed not implemented"), nil
}

func (p *Parser) fUnitSlay(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReUnitSlay.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//victim, cause := matches[1], matches[2]
	return Skip(ts, "UnitSlay not implemented"), nil
}

/**
 * Misc
 */

// TODO: CONSOLIDATED:
// TODO: PET:
// TODO:

/**
 * Dispel, Steal and Interrupt
 */

func (p *Parser) fAuraDispel(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReAuraDispel.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	// What the heck is this?
	//let un_aura_caster = Unit { is_player: true, unit_id: 0 };
	//let un_aura_spell_id = 42;
	//target, targetSpellID := matches[1], matches[2]

	return Skip(ts, "AuraDispel not implemented"), nil
}

func (p *Parser) fAuraInterrupt(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReAuraInterrupt.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//unAuraCaster, target, interruptedSpellID := matches[1], matches[2], matches[3]
	return Skip(ts, "AuraInterrupt not implemented"), nil
}

/**
 * Misc
 */

func (p *Parser) fCreates(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReCreates.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//creator, created := matches[1], matches[2]
	return Skip(ts, "Creates not implemented"), nil
}

func (p *Parser) fGainsAttack(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReGainsAttack.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	return Skip(ts, "GainsAttack not implemented"), nil
}

func (p *Parser) fFallDamage(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReFallDamage.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	return Skip(ts, "FallDamage not implemented"), nil
}

func (p *Parser) fGainNoSource(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReGainNoSource.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}
	//
	//target, direction, amountStr, resource := matches[1], matches[2], matches[3], matches[4]
	//amount, err := strconv.ParseUint(amountStr, 10, 64)
	//if err != nil {
	//	return nil, fmt.Errorf("resource gain amount %q is not valid: %v", amountStr, err)
	//}

	return Skip(ts, "GainNoSource not implemented"), nil
	//return set(ResourceChange{
	//	MessageBase: Base(ts),
	//	Target:      Unit{Name: target},
	//	Amount:      uint32(amount),
	//	Resource:    resource,
	//	//Caster:      Unit{Name: caster},
	//	//Spell:       spell,
	//	Direction: direction,
	//}), nil
}
