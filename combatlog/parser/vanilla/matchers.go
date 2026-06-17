package vanilla

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/playerposition"
	"github.com/Emyrk/chronicle/combatlog/parser/regexs"
	"github.com/Emyrk/chronicle/combatlog/parser/regexs/compiled"
	"github.com/Emyrk/chronicle/combatlog/parser/regexs/compiled/matchers"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/castv2"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatcount"
	"github.com/Emyrk/chronicle/combatlog/parser/types/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitdied"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/ptr"
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

	return set(&messages.Cast{
		CastV2:      c,
		MessageBase: messages.Base(ts),
	}), nil
}

func (p *Parser) fLoot(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, loot.PrefixLoot) {
		return messages.NotHandled()
	}

	li, err := loot.ParseLootInfo(p.liner.RealmClockInfo(), content)
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

	zi, err := zone.ParseZoneInfo(p.liner.RealmClockInfo(), content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse zone info: %v", err)
	}

	return set(&messages.Zone{
		MessageBase: messages.Base(ts),
		Zone:        zi,
	}), nil
}

func (p *Parser) fUnitInfo(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, unitinfo.PrefixUnitInfo) {
		return messages.NotHandled()
	}

	ut, err := unitinfo.ParseUnitInfo(p.liner.RealmClockInfo(), content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse unit info: %v", err)
	}

	return set(&messages.Unit{
		MessageBase: messages.Base(ts),
		Info:        ut,
	}), nil
}

func (p *Parser) fCombatantInfo(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, combatant.PrefixCombatant) {
		return messages.NotHandled()
	}

	cbt, err := combatant.ParseCombatantInfo(p.liner.RealmClockInfo(), content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	return set(&messages.Combatant{
		Combatant:   cbt,
		MessageBase: messages.Base(ts),
	}), nil
}

func (p *Parser) fCombatCount(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, combatcount.PrefixCombatCount) {
		return messages.NotHandled()
	}

	cbt, err := combatcount.ParseCombatCount(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	return set(&messages.CombatCount{
		Count:       cbt,
		MessageBase: messages.Base(ts),
	}), nil
}

func (p *Parser) fRealm(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, realm.PrefixRealmInfo) {
		return messages.NotHandled()
	}

	ut, err := realm.ParseRealmInfo(p.liner.RealmClockInfo(), content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	return set(&messages.Realm{
		MessageBase: messages.Base(ts),
		Info:        ut,
	}), nil
}

func (p *Parser) fUnitDied(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, unitdied.PrefixUnitDied) {
		return messages.NotHandled()
	}

	d, err := unitdied.ParseUnitDead(p.liner.RealmClockInfo(), content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse unit died info: %v", err)
	}

	return set(&messages.UnitDied{
		MessageBase: messages.Base(ts),
		Info:        d,
	}), nil
}

func (p *Parser) fPlayerPosition(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, playerposition.PrefixPlayerPosition) {
		return messages.NotHandled()
	}

	ut, err := playerposition.ParsePlayerPosition(p.liner.RealmClockInfo(), content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	return set(&messages.PlayerPosition{
		MessageBase:    messages.Base(ts),
		PlayerPosition: ut,
	}), nil
}

func (p *Parser) fClockInfo(ts time.Time, content string) ([]messages.Message, error) {
	if !strings.HasPrefix(content, realmclock.PrefixClockInfo) {
		return messages.NotHandled()
	}

	ci, err := realmclock.ParseClockInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse unit info: %v", err)
	}

	return set(&messages.Clock{
		MessageBase: messages.Base(ts),
		Info:        ci,
	}), nil
}

func (p *Parser) fBugDamageSpellHitOrCrit(ts time.Time, content string) ([]messages.Message, error) {
	if !compiled.CompiledReBugDamageSpellHitOrCrit.MatchString(content) {
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
	//matched := regexs.CompiledCompiledReSpellCastAttempt.MatchString(content)
	matched := compiled.CompiledReSpellCastAttempt.MatchString(content)
	if !matched {
		return messages.NotHandled()
	}

	return messages.Skip(ts, "handled castsv2"), nil
}

func (p *Parser) fGain(ts time.Time, content string) ([]messages.Message, error) {
	matched, ok := matchers.ReGain().Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, targetGUID := matched.UnitOrGUID()
	direction := matched.ResourceChange()
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

	return set(&messages.ResourceChange{
		MessageBase: messages.Base(ts),
		Target:      targetGUID,
		Amount:      amount,
		Resource:    resource,
		Caster:      ptr.Ref(casterGUID),
		SpellName:   spellName,
		Direction:   direction,
	}), nil
}

func (p *Parser) fGainNoSource(ts time.Time, content string) ([]messages.Message, error) {
	matched, ok := types.FromRegex(regexs.ReGainNoSource).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, targetGUID := matched.UnitOrGUID()
	direction := matched.ResourceChange()
	amount := matched.Int32()
	resource := matched.Resource()
	spellName := ptr.Ref(matched.String())

	if err := matched.Error(); err != nil {
		return nil, fmt.Errorf("gain: %w", err)
	}

	if targetGUID.IsZero() {
		return messages.Skip(ts, "gain: not using guids"), nil
	}

	return set(&messages.ResourceChange{
		MessageBase: messages.Base(ts),
		Target:      targetGUID,
		Amount:      amount,
		Resource:    resource,
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

	sp := &messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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
	} else {
		school = types.PhysicalSchool
	}
	trailer := matches.Trailer()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageHitOrCritSchool: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageHitOrCritSchool: not using guids"), nil
	}

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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

	return set(&messages.Heal{
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

	return set(&messages.Aura{
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

	return set(&messages.Aura{
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
	// 0x00000000000D8985's Soul Link causes 0xF1400A5C5100000F 62 damage.
	matches, ok := types.FromRegex(regexs.ReDamageSpellSplit).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()
	amount := matches.Int32()
	trailer := matches.Trailer()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellSplit: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "DamageSpellSplit: not using guids"), nil
	}

	//attacker, spellID, victim, amount, trailer := matches[1], matches[2], matches[3], matches[4], matches[5]

	// Return spell cast & SpellDamage Message
	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
		SpellName:   ptr.Ref(spellName),
		HitType:     types.HitTypeSplit,
		Target:      target,
		Amount:      amount,
		School:      types.NoneSchool,
		Trailer:     trailer,
	}), nil
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
	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
		SpellName:   ptr.Ref(spellName),
		HitType:     types.HitTypeMiss,
		Target:      target,
		Amount:      0,
		School:      types.NoneSchool,
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

	school := types.NoneSchool
	if hitType.Has(types.HitTypeFullBlock) || hitType.Has(types.HitTypeParry) || hitType.Has(types.HitTypeEvade) {
		school = types.PhysicalSchool
	}

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
		SpellName:   ptr.Ref(spellName),
		HitType:     hitType,
		Target:      target,
		Amount:      0,
		School:      school,
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

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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
	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
		Target:      target,
		HitType:     types.HitTypeMiss,
		Amount:      0,
		School:      types.PhysicalSchool,
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

	school := types.PhysicalSchool
	if hitType.Has(types.HitTypeFullBlock) || hitType.Has(types.HitTypeParry) || hitType.Has(types.HitTypeEvade) {
		school = types.PhysicalSchool
	}

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
		Target:      target,
		HitType:     hitType,
		School:      school,
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

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
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

	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
		Target:      target,
		HitType:     types.HitTypeImmune,
		Amount:      0,
		School:      types.PhysicalSchool,
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
	matches, ok := types.FromRegex(regexs.ReSpellCastPerform).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	matches.Skip()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("SpellCastPerformUnknown: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "SpellCastPerform: not using guids"), nil
	}

	return set(&messages.LegacyCast{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      &target,
		Spell:       spellName,
	}), nil
}

func (p *Parser) fSpellCastPerformUnknown(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReSpellCastPerformUnknown).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	matches.Skip() // skip the word "perform"
	spellName := matches.String()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("SpellCastPerformUnknown: %w", err)
	}

	if caster.IsZero() {
		return messages.Skip(ts, "SpellCastPerformUnknown: not using guids"), nil
	}

	return set(&messages.LegacyCast{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      nil,
		Spell:       spellName,
	}), nil
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

	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      victim,
		Killer:      nil,
	}), nil
}

func (p *Parser) fUnitDieDestroyedExperience(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReUnitDieDestroyedExp).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, victim := matches.UnitOrGUID()
	// TODO: capture experience amount

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if victim.IsZero() {
		return messages.Skip(ts, "UnitDieDestroyed: not using guids"), nil
	}

	return set(&messages.Slain{
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

	return set(&messages.Slain{
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

	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      victim,
		Killer:      ptr.Ref(killer),
	}), nil
}

func (p *Parser) fPetDismissed(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.RePetDismissed).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, owner := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if owner.IsZero() || target.IsZero() {
		return messages.Skip(ts, "PetDismissed: not using guids"), nil
	}

	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      target,
		Killer:      ptr.Ref(owner),
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

	if target.IsZero() {
		return messages.Skip(ts, "AuraDispel: not using guids"), nil
	}

	return set(&messages.Aura{
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

	return set(&messages.Interrupt{
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
		return nil, fmt.Errorf("creates: %w", err)
	}

	if caster.IsZero() {
		return messages.Skip(ts, "Creates: not using guids"), nil
	}

	return set(&messages.Create{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Created:     created,
	}), nil
}

func (p *Parser) fGainsAttack(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReGainsAttack).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	amount := matches.Int32()
	spellName := matches.String()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("GainsAttack: %w", err)
	}

	if caster.IsZero() {
		return messages.Skip(ts, "GainsAttack: not using guids"), nil
	}

	return set(&messages.ExtraAttack{
		MessageBase:   messages.Base(ts),
		Caster:        caster,
		Amount:        amount,
		FromSpellName: spellName,
	}), nil
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

	return set(&messages.Damage{
		MessageBase:     messages.Base(ts),
		Target:          target,
		HitType:         types.HitTypeEnvironment,
		Amount:          amount,
		EnvironmentType: ptr.Ref(types.EnvironmentTypeFall),
	}), nil
}

func (p *Parser) fLavaSwimming(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReLavaSwimming).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, target := matches.UnitOrGUID()
	amount := matches.Int32()
	trailer := matches.Trailer()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("FallDamage: %w", err)
	}

	if target.IsZero() {
		return messages.Skip(ts, "FallDamage: not using guids"), nil
	}

	return set(&messages.Damage{
		MessageBase:     messages.Base(ts),
		Target:          target,
		HitType:         types.HitTypeEnvironment,
		Amount:          amount,
		Trailer:         trailer,
		EnvironmentType: ptr.Ref(types.EnvironmentTypeLava),
	}), nil
}

func (p *Parser) fDurabilityLoss(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReDurabilityLoss).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, target := matches.UnitOrGUID()
	amount := matches.Int32()
	var _ = amount

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("FallDamage: %w", err)
	}

	if target.IsZero() {
		return messages.Skip(ts, "FallDamage: not using guids"), nil
	}

	return messages.Skip(ts, "durability not implemented"), nil
}

func (p *Parser) fUsesConsumable(ts time.Time, content string) ([]messages.Message, error) {
	_, ok := types.FromRegex(regexs.ReUsesConsumable).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	return messages.Skip(ts, "consumables sourced from castsv2"), nil
}

func (p *Parser) fResourceDrain(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReResourceDrain).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	amount := matches.Int32()
	resource := matches.Resource()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("ResourceDrain: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "ResourceDrain: not using guids"), nil
	}

	return set(&messages.ResourceChange{
		MessageBase: messages.Base(ts),
		Target:      target,
		Amount:      amount,
		Resource:    resource,
		Caster:      ptr.Ref(caster),
		SpellName:   ptr.Ref(spellName),
		Direction:   types.ChangeDirectionLoss,
	}), nil
}

func (p *Parser) fReputationChange(ts time.Time, content string) ([]messages.Message, error) {
	_, ok := types.FromRegex(regexs.ReReputationChange).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	return messages.Skip(ts, "reputation changes are only for 'me'"), nil
}

func (p *Parser) fPetEats(ts time.Time, content string) ([]messages.Message, error) {
	_, ok := types.FromRegex(regexs.RePetEats).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	return messages.Skip(ts, "pet food is not important"), nil
}

func (p *Parser) fKilledBy(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReKilledBy).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, victim := matches.UnitOrGUID()
	spellName := matches.String()
	var _ = spellName // Ignored for now

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("KilledBy: %w", err)
	}

	if victim.IsZero() {
		return messages.Skip(ts, "KilledBy: not using guids"), nil
	}

	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      victim,
		Killer:      nil,
	}), nil
}

func (p *Parser) fFullResist(ts time.Time, content string) ([]messages.Message, error) {
	_, ok := types.FromRegex(regexs.ReFullResist).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	return messages.Skip(ts, "not sure what to do with full resist"), nil
}

func (p *Parser) fPetHappiness(ts time.Time, content string) ([]messages.Message, error) {
	_, ok := types.FromRegex(regexs.ReHappiness).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	return messages.Skip(ts, "pet happiness does not use guids"), nil
}

func (p *Parser) fFullImmune(ts time.Time, content string) ([]messages.Message, error) {
	matches, ok := types.FromRegex(regexs.ReFullImmune).Match(content)
	if !ok {
		return messages.NotHandled()
	}

	_, target := matches.UnitOrGUID()
	_, caster := matches.UnitOrGUID()
	spellName := matches.String()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("FullImmune: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return messages.Skip(ts, "FullImmune: not using guids"), nil
	}

	return set(&messages.Damage{
		MessageBase:     messages.Base(ts),
		SpellName:       ptr.Ref(spellName),
		Caster:          ptr.Ref(caster),
		Target:          target,
		HitType:         types.HitTypeImmune,
		Amount:          0,
		School:          0,
		Trailer:         nil,
		EnvironmentType: nil,
	}), nil
}

func OnlyRaw(do func(ts time.Time, content string) ([]messages.Message, error)) parseLine {
	return func(lCtx *logfile.Context, ts time.Time, content string) ([]messages.Message, error) {
		if lCtx != nil &&
			lCtx.IsRaw != nil &&
			!(*lCtx.IsRaw) {
			return messages.Skip(ts, "will source only from raw logs"), nil
		}

		return do(ts, content)
	}
}

func Either(do func(ts time.Time, content string) ([]messages.Message, error)) parseLine {
  return func(lCtx *logfile.Context, ts time.Time, content string) ([]messages.Message, error) {
    return do(ts, content)
  }
}