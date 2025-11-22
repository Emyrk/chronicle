package vanillaparser

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/internal/ptr"
	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
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

	var _ = li

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

	p.state.Zone(zi)

	return set(Zone{
		MessageBase: Base(ts),
		Zone:        zi,
	}), nil
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

	return Skip(ts, "handled castsv2"), nil
}

func (p *Parser) fGainWithSource(ts time.Time, content string) ([]Message, error) {
	return p.fGain(true, ts, content)
}

func (p *Parser) fGainNoSource(ts time.Time, content string) ([]Message, error) {
	return p.fGain(false, ts, content)
}

func (p *Parser) fGain(hasSource bool, ts time.Time, content string) ([]Message, error) {
	re := regexs.ReGainNoSource
	if hasSource {
		re = regexs.ReGain
	}
	matched, ok := types.FromRegex(re).Match(content)
	if !ok {
		return notHandled()
	}

	_, targetGUID := matched.UnitOrGUID()
	direction := matched.String()
	amount := matched.Int32()
	resource := matched.Resource()

	var casterGUID *guid.GUID
	var spellName *string
	if hasSource {
		_, gid := matched.UnitOrGUID()
		casterGUID = &gid
		spellName = ptr.Ref(matched.String())
	}

	if err := matched.Error(); err != nil {
		return nil, fmt.Errorf("gain: %w", err)
	}

	if targetGUID.IsZero() {
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

func (p *Parser) fDamageSpellHitOrCritSchool(ts time.Time, content string) ([]Message, error) {
	return p.fDamageSpellHitOrCrit(true, ts, content)
}

func (p *Parser) fDamageSpellHitOrCritNoSchool(ts time.Time, content string) ([]Message, error) {
	return p.fDamageSpellHitOrCrit(false, ts, content)
}

/**
 * Spell Damage
 */
// 11/18 07:21:45.192  0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage.
func (p *Parser) fDamageSpellHitOrCrit(hasSchool bool, ts time.Time, content string) ([]Message, error) {
	re := regexs.ReDamageSpellHitOrCrit
	if hasSchool {
		re = regexs.ReDamageSpellHitOrCritSchool
	}

	matches, ok := types.FromRegex(re).Match(content)
	if !ok {
		return notHandled()
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
		return Skip(ts, "DamageSpellHitOrCrit: not using guids"), nil
	}

	// Add the hitmask from the main line to the trailer entries
	for i := range trailer {
		trailer[i].HitType = trailer[i].HitType | hitType
	}

	sp := SpellDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		HitType:     hitType,
		Target:      target,
		Amount:      amount,
		Trailer:     trailer,
		School:      school,
	}
	p.state.SpellDamage(sp)
	return set(sp), nil
}

func (p *Parser) fDamagePeriodic(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamagePeriodic).Match(content)
	if !ok {
		return notHandled()
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
		return Skip(ts, "DamagePeriodic: not using guids"), nil
	}

	return set(PeriodicDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		Target:      target,
		Amount:      amount,
		School:      school,
		SpellName:   spellName,
		Trailer:     trailer,
	}), nil
}

func (p *Parser) fDamageShield(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageShield).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	amount := matches.Int32()
	school := matches.School()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageShield: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageShield: not using guids"), nil
	}

	return set(Damage{
		MessageBase: Base(ts),
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

func (p *Parser) fDamageHitOrCritNoSchool(ts time.Time, content string) ([]Message, error) {
	return p.fDamageHitOrCrit(false, ts, content)
}

func (p *Parser) fDamageHitOrCritSchool(ts time.Time, content string) ([]Message, error) {
	return p.fDamageHitOrCrit(true, ts, content)
}

func (p *Parser) fDamageHitOrCrit(hasScool bool, ts time.Time, content string) ([]Message, error) {
	re := regexs.ReDamageHitOrCrit
	if hasScool {
		re = regexs.ReDamageHitOrCritSchool
	}

	matches, ok := types.FromRegex(re).Match(content)
	if !ok {
		return notHandled()
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
		return Skip(ts, "DamageHitOrCritSchool: not using guids"), nil
	}

	return set(Damage{
		MessageBase: Base(ts),
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

func (p *Parser) fHeal(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReHeal).Match(content)
	if !ok {
		return notHandled()
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
		return Skip(ts, "Heal: not using guids"), nil
	}

	return set(Heal{
		MessageBase: Base(ts),
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

func (p *Parser) fAuraGainHarmfulHelpful(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraGainHarmfulHelpful).Match(content)
	if !ok {
		return notHandled()
	}

	_, target := matches.UnitOrGUID()
	matches.Skip()
	spellName := matches.String()
	amount := matches.Int32()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraGainHarmfulHelpful: %w", err)
	}

	if target.IsZero() {
		return Skip(ts, "AuraGainHarmfulHelpful: not using guids"), nil
	}

	return set(Aura{
		MessageBase: Base(ts),
		Target:      target,
		SpellName:   spellName,
		Amount:      amount,
		Application: types.AuraApplicationGains,
	}), nil
}

func (p *Parser) fAuraFade(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraFade).Match(content)
	if !ok {
		return notHandled()
	}

	spellName := matches.String()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraFade: %w", err)
	}

	if target.IsZero() {
		return Skip(ts, "AuraFade: not using guids"), nil
	}

	return set(Aura{
		MessageBase: Base(ts),
		Target:      target,
		SpellName:   spellName,
		Amount:      0,
		Application: types.AuraApplicationFades,
	}), nil
}

/**
 * Spell Damage cont
 */
func (p *Parser) fDamageSpellSplit(ts time.Time, content string) ([]Message, error) {
	// TODO: What is this? Warlock soul link? Disc priest capstone talent?
	matches := regexs.ReDamageSpellSplit.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//attacker, spellID, victim, amount, trailer := matches[1], matches[2], matches[3], matches[4], matches[5]

	// Return spell cast & SpellDamage Message
	return Unparsed(ts, "DamageSpellSplit not implemented"), nil
}

func (p *Parser) fDamageSpellMiss(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellMiss).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	matches.Skip() // Ignore this match
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellMiss: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageSpellMiss: not using guids"), nil
	}

	//attacker, spellID, victim := matches[1], matches[2], matches[4]
	return set(SpellDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		HitType:     types.HitTypeMiss,
		Target:      target,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

func (p *Parser) fDamageSpellBlockParryEvadeDodgeResistDeflect(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellBlockParryEvadeDodgeResistDeflect).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	hitType := matches.HitType()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellBlockParryEvadeDodgeDeflect: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageSpellBlockParryEvadeDodgeDeflect: not using guids"), nil
	}

	return set(SpellDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		HitType:     hitType,
		Target:      target,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

// fDamageSpellAbsorb is a full absorb
func (p *Parser) fDamageSpellAbsorb(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellAbsorb).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellAbsorb: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageSpellAbsorb: not using guids"), nil
	}

	return set(SpellDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		HitType:     types.HitTypeFullAbsorb,
		Target:      target,
		Amount:      0,
		Trailer:     nil,
		School:      0,
	}), nil
}

func (p *Parser) fDamageSpellAbsorbSelf(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageSpellAbsorbSelf.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//victim, attacker, spellID := matches[1], matches[2], matches[3]
	return Unparsed(ts, "DamageSpellAbsorbSelf not implemented"), nil
}

func (p *Parser) fDamageReflect(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageReflect).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageReflect: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageReflect: not using guids"), nil
	}

	return set(SpellDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		HitType:     types.HitTypeReflect,
		Target:      target,
		Amount:      0,
		Trailer:     nil,
		School:      0,
	}), nil
}

func (p *Parser) fDamageProcResist(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReDamageProcResist.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//victim, attacker, spellID := matches[1], matches[2], matches[3]
	return Unparsed(ts, "DamageProcResist not implemented"), nil
}

func (p *Parser) fDamageSpellImmune(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageSpellImmune).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	spellName := matches.String()
	_, target := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageSpellImmune: %w", err)
	}
	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageSpellImmune: not using guids"), nil
	}
	return set(SpellDamage{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
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

func (p *Parser) fDamageMiss(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageMiss).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageMiss: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageMiss: not using guids"), nil
	}

	return set(Damage{
		MessageBase: Base(ts),
		Caster:      caster,
		Target:      target,
		HitType:     types.HitTypeMiss,
		Amount:      0,
		School:      0,
		Trailer:     nil,
	}), nil
}

func (p *Parser) fDamageBlockParryEvadeDodgeDeflect(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageBlockParryEvadeDodgeDeflect).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	hitType := matches.HitType()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageBlockParryEvadeDodgeDeflect: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageBlockParryEvadeDodgeDeflect: not using guids"), nil
	}

	return set(Damage{
		MessageBase: Base(ts),
		Caster:      caster,
		Target:      target,
		HitType:     hitType,
	}), nil

	//attacker, victim, hitType := matches[1], matches[2], matches[3]
	return Unparsed(ts, "DamageBlockParryEvadeDodgeResistDeflect not implemented"), nil
}

// TODO: No examples found yet
func (p *Parser) fDamageAbsorbResist(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageAbsorbResist).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	hitType := matches.HitType()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageAbsorbResist: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageAbsorbResist: not using guids"), nil
	}

	return set(Damage{
		MessageBase: Base(ts),
		Caster:      caster,
		Target:      target,
		HitType:     hitType,
	}), nil
}

func (p *Parser) fDamageImmune(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReDamageImmune).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("DamageImmune: %w", err)
	}
	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "DamageImmune: not using guids"), nil
	}

	return set(Damage{
		MessageBase: Base(ts),
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
func (p *Parser) fSpellCastPerformDurability(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReSpellCastPerformDurability.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//caster, spellID, target := matches[1], matches[3], matches[4]
	return Unparsed(ts, "SpellCastPerformDurability not implemented"), nil
}

func (p *Parser) fSpellCastPerform(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReSpellCastPerform.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//caster, spellID, target := matches[1], matches[3], matches[4]
	return Skip(ts, "'SpellCastPerform' handled by castsv2"), nil
}

func (p *Parser) fSpellCastPerformUnknown(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReSpellCastPerformUnknown.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	//caster, spellID := matches[1], matches[3]
	return Skip(ts, "'SpellCastPerformUnknown' handled by castsv2"), nil
}

/**
 * Unit Death
 */

func (p *Parser) fHonorableKill(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReHonorableKill).Match(content)
	if !ok {
		return notHandled()
	}

	_, victim := matches.UnitOrGUID()
	rank := matches.String()
	honor := matches.Int32()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if victim.IsZero() {
		return Unparsed(ts, "UnitDieDestroyed: not using guids"), nil
	}

	// TODO: Add "ResourceGain" message for honor gained?
	var _, _ = rank, honor

	return set(Slain{
		MessageBase: Base(ts),
		Victim:      victim,
		Killer:      nil,
	}), nil
}

func (p *Parser) fUnitDieDestroyed(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReUnitDieDestroyed).Match(content)
	if !ok {
		return notHandled()
	}

	_, victim := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if victim.IsZero() {
		return Unparsed(ts, "UnitDieDestroyed: not using guids"), nil
	}

	return set(Slain{
		MessageBase: Base(ts),
		Victim:      victim,
		Killer:      nil,
	}), nil
}

// What about 'You have slain 0xF130002AE6024CA7!'?
func (p *Parser) fUnitSlay(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReUnitSlay).Match(content)
	if !ok {
		return notHandled()
	}

	_, victim := matches.UnitOrGUID()
	_, killer := matches.UnitOrGUID()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("UnitSlay: %w", err)
	}

	if victim.IsZero() {
		return Unparsed(ts, "UnitSlay: not using guids"), nil
	}

	return set(Slain{
		MessageBase: Base(ts),
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

func (p *Parser) fAuraDispel(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraDispel).Match(content)
	if !ok {
		return notHandled()
	}

	_, target := matches.UnitOrGUID()
	spellName := matches.String()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraDispel: %w", err)
	}

	return set(Aura{
		MessageBase: Base(ts),
		Target:      target,
		SpellName:   spellName,
		Amount:      0,
		Application: types.AuraApplicationRemoved,
	}), nil
}

func (p *Parser) fAuraInterrupt(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReAuraInterrupt).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	_, target := matches.UnitOrGUID()
	spellName := matches.String()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("AuraInterrupt: %w", err)
	}

	if caster.IsZero() || target.IsZero() {
		return Skip(ts, "AuraInterrupt: not using guids"), nil
	}

	return set(Interrupt{
		MessageBase: Base(ts),
		Caster:      caster,
		SpellName:   spellName,
		Target:      target,
	}), nil
}

/**
 * Misc
 */

func (p *Parser) fCreates(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReCreates).Match(content)
	if !ok {
		return notHandled()
	}

	_, caster := matches.UnitOrGUID()
	created := matches.String()
	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("Creates: %w", err)
	}

	if caster.IsZero() {
		return Skip(ts, "Creates: not using guids"), nil
	}

	return set(Create{
		MessageBase: Base(ts),
		Caster:      caster,
		Created:     created,
	}), nil
}

func (p *Parser) fGainsAttack(ts time.Time, content string) ([]Message, error) {
	matches := regexs.ReGainsAttack.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	return Unparsed(ts, "GainsAttack not implemented"), nil
}

func (p *Parser) fFallDamage(ts time.Time, content string) ([]Message, error) {
	matches, ok := types.FromRegex(regexs.ReFallDamage).Match(content)
	if !ok {
		return notHandled()
	}

	_, target := matches.UnitOrGUID()
	amount := matches.Int32()

	if err := matches.Error(); err != nil {
		return nil, fmt.Errorf("FallDamage: %w", err)
	}

	if target.IsZero() {
		return Skip(ts, "FallDamage: not using guids"), nil
	}

	return set(FallDamage{
		MessageBase: Base(ts),
		Target:      target,
		Amount:      amount,
	}), nil
}
