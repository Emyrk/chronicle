package vanillaparser

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/internal/ptr"
	"github.com/Emyrk/chronicle/golang/wowlogs/regexs"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/castv2"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/loot"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/unitinfo"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"
)

func (p *Parser) fV2Casts(ts time.Time, content string) ([]messages.Message, error) {
	if _, ok := castv2.IsCast(content); !ok {
		return messages.NotHandled()
	}

	c, err := castv2.ParseCast(content)
	if err != nil {
		return nil, fmt.Errorf("castv2: %w", err)
	}

	if !c.Caster.HasGuid() || (c.Target != nil && !c.Target.HasGuid()) {
		return messages.Skip(ts, "castv2: not using guids"), nil
	}

	return set(messages.Cast{
		CastV2:      c,
		MessageBase: messages.Base(ts),
	}), nil
}

func (p *Parser) fLoot(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, loot.PrefixLoot) {
		return messages.NotHandled()
	}

	li, err := loot.ParseLootInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse zone info: %v", err)
	}

	var _ = li

	return messages.Skip(ts, "loot info"), nil
}

func (p *Parser) fZoneInfo(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, zone.PrefixZone) {
		return messages.NotHandled()
	}

	zi, err := zone.ParseZoneInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse zone info: %v", err)
	}

	return set(messages.Zone{
		MessageBase: messages.Base(ts),
		Zone:        zi,
	}), nil
}

func (p *Parser) fUnitInfo(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, unitinfo.PrefixUnitInfo) {
		return messages.NotHandled()
	}

	ut, err := unitinfo.ParseUnitInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	return set(messages.Unit{
		MessageBase: messages.Base(ts),
		Info:        ut,
	}), nil
}

func (p *Parser) fCombatantInfo(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, combatant.PrefixCombatant) {
		return messages.NotHandled()
	}

	cbt, err := combatant.ParseCombatantInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	return set(messages.Combatant{
		Combatant:   cbt,
		MessageBase: messages.Base(ts),
	}), nil
}

func (p *Parser) fBugDamageSpellHitOrCrit(ts time.Time, content string) ([]messages.Message, error) {
	if !regexs.ReBugDamageSpellHitOrCrit.MatchString(content) {
		return messages.NotHandled()
	}

	p.logger.Error("bugged line in logs, skipping",
		slog.String("content", content),
	)
	return messages.Skip(ts, "bugged line in logs"), nil
}

// 10/29 22:09:40.825  Randgriz begins to cast Flash Heal.
// 10/29 22:09:42.175  Randgriz casts Flash Heal on Katrix.
// 10/29 22:09:42.175  Randgriz 's Flash Heal critically heals Katrix for 2534.
func (p *Parser) fSpellCastAttempt(ts time.Time, content string) ([]messages.Message, error) {
	matches := regexs.ReSpellCastAttempt.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	return messages.Skip(ts, "handled castsv2"), nil
}

func (p *Parser) fGain(ts time.Time, content string) ([]messages.Message, error) {
	matched, ok := types.FromRegex(regexs.ReGain).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, targetGUID := matched.UnitOrGUID()
	direction := matched.String()
	amount := matched.Int32()
	resource := matched.Resource()
	_, casterGUID := matched.UnitOrGUID()
	spellName := ptr.Ref(matched.String())

	if err := matched.Error(); err != nil {
		return nil, fmt.Errorf("gain: %w", err)
	}

	if targetGUID.IsZero() {
		return messages.Skip(ts, "gain: not using guids"), nil
	}

	return set(messages.ResourceChange{
		MessageBase: messages.Base(ts),
		Target:      targetGUID,
		Amount:      amount,
		Resource:    resource,
		Caster:      ptr.Ref(casterGUID),
		SpellName:   spellName,
		Direction:   direction,
	}), nil
}

func (p *Parser) fDamageSpellHitOrCritSchool(ts time.Time, content string) ([]messages.Message, error) {
	return p.fDamageSpellHitOrCrit(true, ts, content)
}

func (p *Parser) fDamageSpellHitOrCritNoSchool(ts time.Time, content string) ([]messages.Message, error) {
	return p.fDamageSpellHitOrCrit(false, ts, content)
}

/**
 * Spell Damage
 */
// 11/18 07:21:45.192  0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage.
func (p *Parser) fDamageSpellHitOrCrit(hasSchool bool, ts time.Time, content string) ([]messages.Message, error) {
	re := regexs.ReDamageSpellHitOrCrit
	if hasSchool {
		re = regexs.ReDamageSpellHitOrCritSchool
	}

	matches, ok := types.FromRegex(re).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	hitType := matches.ShortHitType()
	_, target := matches.UnitOrGUID()
	amount := matches.Int32()

	var school types.School
	if hasSchool {
		school = matches.School()
	}
	trailer := matches.Trailer()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellHitOrCrit: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageSpellHitOrCrit: not using guids"), nil
	}

	// Add the hitmask from the main line to the trailer entries
	for i := range trailer {
		trailer[i].HitType = trailer[i].HitType | hitType
	}

	sp := messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellName:   ptr.Ref(spellName),
		HitType:     hitType,
		Target:      target,
		Amount:      amount,
		Trailer:     trailer,
		School:      school,
	}
	return set(sp), nil
}

func (p *Parser) fDamagePeriodic(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamagePeriodic).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, target := matches.UnitOrGUID()
	amount := matches.Int32()
	school := matches.School()
	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	trailer := matches.Trailer()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamagePeriodic: %w", err)
	}

	if target.IsZero() || caster.IsZero() {
		return messages.Skip(ts, "DamagePeriodic: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		Amount:      amount,
		School:      school,
		HitType:     types.HitTypePeriodic,
		SpellName:   ptr.Ref(spellName),
		Trailer:     trailer,
	}), nil
}

func (p *Parser) fDamageShield(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageShield).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	amount := matches.Int32()
	school := matches.School()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageShield: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageShield: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		// Reflected damage from something like thorns?
		// TODO: Verify this
		HitType: types.HitTypeHit | types.HitTypeReflect,
		Amount:  amount,
		School:  school,
		Trailer: nil,
	}), nil
}

/**
 * Melee Damage
 */

func (p *Parser) fDamageHitOrCritNoSchool(ts time.Time, content string) ([]messages.Message, error) {
	return p.fDamageHitOrCrit(false, ts, content)
}

func (p *Parser) fDamageHitOrCritSchool(ts time.Time, content string) ([]messages.Message, error) {
	return p.fDamageHitOrCrit(true, ts, content)
}

func (p *Parser) fDamageHitOrCrit(hasScool bool, ts time.Time, content string) ([]messages.Message, error) {
	re := regexs.ReDamageHitOrCrit
	if hasScool {
		re = regexs.ReDamageHitOrCritSchool
	}

	matches, ok := types.FromRegex(re).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	hitType := matches.ShortHitType()
	_, target := matches.UnitOrGUID()
	amount := matches.Int32()

	var school types.School
	if hasScool {
		school = matches.School()
	}
	trailer := matches.Trailer()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageHitOrCritSchool: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageHitOrCritSchool: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		HitType:     hitType,
		Target:      target,
		Amount:      amount,
		School:      school,
		Trailer:     trailer,
	}), nil
}

/**
 * Heal
 */

func (p *Parser) fHeal(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReHeal).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	crit := matches.String() == "critically "
	_, target := matches.UnitOrGUID()
	amount := matches.Int32()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("HealHit: %w", err)
	}

	hit := types.HitTypeHit
	if crit {
		hit = types.HitTypeCrit
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "Heal: not using guids"), nil
	}

	return set(messages.Heal{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		SpellName:   spellName,
		Amount:      amount,
		HitType:     hit,
	}), nil
}

/**
 * Aura Application
 */

func (p *Parser) fAuraGainHarmfulHelpful(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraGainHarmfulHelpful).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, target := matches.UnitOrGUID()
	matches.Skip()
	spellName := matches.String()
	amount := matches.Int32()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraGainHarmfulHelpful: %w", err)
	}

	if target.IsZero() {
		return messages.Skip(ts, "AuraGainHarmfulHelpful: not using guids"), nil
	}

	return set(messages.Aura{
		MessageBase: messages.Base(ts),
		Target:      target,
		SpellName:   spellName,
		Amount:      amount,
		Application: types.AuraApplicationGains,
	}), nil
}

func (p *Parser) fAuraFade(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraFade).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	spellName := matches.String()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraFade: %w", err)
	}

	if target.IsZero() {
		return messages.Skip(ts, "AuraFade: not using guids"), nil
	}

	return set(messages.Aura{
		MessageBase: messages.Base(ts),
		Target:      target,
		SpellName:   spellName,
		Amount:      0,
		Application: types.AuraApplicationFades,
	}), nil
}

/**
 * Spell Damage cont
 */
func (p *Parser) fDamageSpellSplit(ts time.Time, content string) ([]messages.Message, error) {
	// TODO: What is this? Warlock soul link? Disc priest capstone talent?
	matches := regexs.ReDamageSpellSplit.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	//attacker, spellID, victim, amount, trailer := matches[1], matches[2], matches[3], matches[4], matches[5]

	// Return spell cast & SpellDamage Message
	return messages.Unparsed(ts, "DamageSpellSplit not implemented"), nil
}

func (p *Parser) fDamageSpellMiss(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellMiss).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	matches.Skip() // Ignore this match
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellMiss: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageSpellMiss: not using guids"), nil
	}

	//attacker, spellID, victim := matches[1], matches[2], matches[4]
	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellName:   ptr.Ref(spellName),
		HitType:     types.HitTypeMiss,
		Target:      target,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

func (p *Parser) fDamageSpellBlockParryEvadeDodgeResistDeflect(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellBlockParryEvadeDodgeResistDeflect).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	hitType := matches.HitType()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellBlockParryEvadeDodgeDeflect: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageSpellBlockParryEvadeDodgeDeflect: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellName:   ptr.Ref(spellName),
		HitType:     hitType,
		Target:      target,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

// fDamageSpellAbsorb is a full absorb
func (p *Parser) fDamageSpellAbsorb(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellAbsorb).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellAbsorb: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageSpellAbsorb: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellName:   ptr.Ref(spellName),
		HitType:     types.HitTypeFullAbsorb,
		Target:      target,
		Amount:      0,
		Trailer:     nil,
		School:      0,
	}), nil
}

func (p *Parser) fDamageSpellAbsorbSelf(ts time.Time, content string) ([]messages.Message, error) {
	matches := regexs.ReDamageSpellAbsorbSelf.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	//victim, attacker, spellID := matches[1], matches[2], matches[3]
	return messages.Unparsed(ts, "DamageSpellAbsorbSelf not implemented"), nil
}

func (p *Parser) fDamageReflect(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageReflect).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageReflect: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageReflect: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellName:   ptr.Ref(spellName),
		HitType:     types.HitTypeReflect,
		Target:      target,
		Amount:      0,
		Trailer:     nil,
		School:      0,
	}), nil
}

func (p *Parser) fDamageProcResist(ts time.Time, content string) ([]messages.Message, error) {
	matches := regexs.ReDamageProcResist.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	//victim, attacker, spellID := matches[1], matches[2], matches[3]
	return messages.Unparsed(ts, "DamageProcResist not implemented"), nil
}

func (p *Parser) fDamageSpellImmune(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellImmune).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellImmune: %w", err)
	}
	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageSpellImmune: not using guids"), nil
	}
	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellName:   ptr.Ref(spellName),
		HitType:     types.HitTypeImmune,
		Target:      target,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

/**
 * Melee Damage cont
 */

func (p *Parser) fDamageMiss(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageMiss).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageMiss: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageMiss: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		HitType:     types.HitTypeMiss,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

func (p *Parser) fDamageBlockParryEvadeDodgeDeflect(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageBlockParryEvadeDodgeDeflect).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	hitType := matches.HitType()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageBlockParryEvadeDodgeDeflect: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageBlockParryEvadeDodgeDeflect: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		HitType:     hitType,
	}), nil
}

// TODO: No examples found yet
func (p *Parser) fDamageAbsorbResist(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageAbsorbResist).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	hitType := matches.HitType()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageAbsorbResist: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageAbsorbResist: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		HitType:     hitType,
	}), nil
}

func (p *Parser) fDamageImmune(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageImmune).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageImmune: %w", err)
	}
	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageImmune: not using guids"), nil
	}

	return set(messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		HitType:     types.HitTypeImmune,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

/**
 * Spell Casts
 */

// fSpellCastPerformDurability is when items are damaged from spell casts.
// Maybe try resurrecting at a spirit healer to get this log?
func (p *Parser) fSpellCastPerformDurability(ts time.Time, content string) ([]messages.Message, error) {
	matches := regexs.ReSpellCastPerformDurability.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	//caster, spellID, target := matches[1], matches[3], matches[4]
	return messages.Unparsed(ts, "SpellCastPerformDurability not implemented"), nil
}

func (p *Parser) fSpellCastPerform(ts time.Time, content string) ([]messages.Message, error) {
	matches := regexs.ReSpellCastPerform.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	//caster, spellID, target := matches[1], matches[3], matches[4]
	return messages.Skip(ts, "'SpellCastPerform' handled by castsv2"), nil
}

func (p *Parser) fSpellCastPerformUnknown(ts time.Time, content string) ([]messages.Message, error) {
	matches := regexs.ReSpellCastPerformUnknown.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	//caster, spellID := matches[1], matches[3]
	return messages.Skip(ts, "'SpellCastPerformUnknown' handled by castsv2"), nil
}

/**
 * Unit Death
 */

func (p *Parser) fHonorableKill(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReHonorableKill).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, victim := matches.UnitOrGUID()
	rank := matches.String()
	honor := matches.Int32()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if victim.IsZero() {
		return messages.Skip(ts, "UnitDieDestroyed: not using guids"), nil
	}

	// TODO: Add "ResourceGain" message for honor gained?
	var _, _ = rank, honor

	return set(messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      victim,
		Killer:      nil,
	}), nil
}

func (p *Parser) fUnitDieDestroyed(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReUnitDieDestroyed).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, victim := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if victim.IsZero() {
		return messages.Skip(ts, "UnitDieDestroyed: not using guids"), nil
	}

	return set(messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      victim,
		Killer:      nil,
	}), nil
}

// What about 'You have slain 0xF130002AE6024CA7!'?
func (p *Parser) fUnitSlay(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReUnitSlay).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, victim := matches.UnitOrGUID()
	_, killer := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if victim.IsZero() {
		return messages.Skip(ts, "UnitSlay: not using guids"), nil
	}

	return set(messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      victim,
		Killer:      ptr.Ref(killer),
	}), nil
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

func (p *Parser) fAuraDispel(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraDispel).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, target := matches.UnitOrGUID()
	spellName := matches.String()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraDispel: %w", err)
	}

	return set(messages.Aura{
		MessageBase: messages.Base(ts),
		Target:      target,
		SpellName:   spellName,
		Amount:      0,
		Application: types.AuraApplicationRemoved,
	}), nil
}

func (p *Parser) fAuraInterrupt(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraInterrupt).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	spellName := matches.String()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraInterrupt: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "AuraInterrupt: not using guids"), nil
	}

	return set(messages.Interrupt{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		Target:      target,
	}), nil
}

/**
 * Misc
 */

func (p *Parser) fCreates(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReCreates).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	created := matches.String()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("Creates: %w", err)
	}

	if caster.IsZero() {
		return messages.Skip(ts, "Creates: not using guids"), nil
	}

	return set(messages.Create{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Created:     created,
	}), nil
}

func (p *Parser) fGainsAttack(ts time.Time, content string) ([]messages.Message, error) {
	matches := regexs.ReGainsAttack.FindStringSubmatch(content)
	if matches == nil {
		return messages.NotHandled()
	}

	return messages.Unparsed(ts, "GainsAttack not implemented"), nil
}

func (p *Parser) fFallDamage(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReFallDamage).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, target := matches.UnitOrGUID()
	amount := matches.Int32()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("FallDamage: %w", err)
	}

	if target.IsZero() {
		return messages.Skip(ts, "FallDamage: not using guids"), nil
	}

	return set(messages.FallDamage{
		MessageBase: messages.Base(ts),
		Target:      target,
		Amount:      amount,
	}), nil
}
