package wotlk

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

// baseParams holds the 6 common fields present on every standard WotLK CLEU event:
// sourceGUID, sourceName, sourceFlags, destGUID, destName, destFlags.
type baseParams struct {
	sourceGUID  guid.GUID
	sourceName  string
	sourceFlags uint32
	destGUID    guid.GUID
	destName    string
	destFlags   uint32
}

func parseBase(m *Matched) baseParams {
	return baseParams{
		sourceGUID:  m.Guid(),
		sourceName:  m.String(),
		sourceFlags: m.HexUint32(),
		destGUID:    m.Guid(),
		destName:    m.String(),
		destFlags:   m.HexUint32(),
	}
}

// spellInfo holds the 3 fields added by SPELL/RANGE/SPELL_PERIODIC/SPELL_BUILDING prefixes.
type spellInfo struct {
	spellID     int32
	spellName   string
	spellSchool types.School
}

func parseSpellPrefix(m *Matched) spellInfo {
	return spellInfo{
		spellID:     m.Int32(),
		spellName:   m.String(),
		spellSchool: m.School(),
	}
}

// dispatch routes a parsed event to the appropriate handler.
func (p *Parser) dispatch(ts time.Time, event string, m *Matched, raw string) ([]messages.Message, error) {
	// Special events first — these have base params but unique structure.
	switch event {
	case "UNIT_DIED", "UNIT_DESTROYED":
		return p.unitDied(ts, m)
	case "PARTY_KILL":
		return p.partyKill(ts, m)
	case "ENCHANT_APPLIED", "ENCHANT_REMOVED":
		return messages.Unparsed(ts, raw), nil
	}

	if hook, ok := p.eventHook[event]; ok {
		return hook(ts, m, raw)
	}

	// Standard events: parse base params.
	base := parseBase(m)
	p.guidNames.Record(base.sourceGUID, base.sourceName)
	p.guidNames.Record(base.destGUID, base.destName)

	prefix, suffix := splitEvent(event)

	// Parse prefix-specific params.
	var spell *spellInfo
	var envType *types.EnvironmentType
	isPeriodic := false

	switch prefix {
	case "SPELL", "RANGE", "SPELL_BUILDING":
		si := parseSpellPrefix(m)
		spell = &si
	case "SPELL_PERIODIC":
		si := parseSpellPrefix(m)
		spell = &si
		isPeriodic = true
	case "SWING":
		// No prefix params.
	case "ENVIRONMENTAL":
		et := EnvironmentTypeFromString(m.String())
		envType = &et
	case "DAMAGE_SHIELD", "DAMAGE_SPLIT":
		si := parseSpellPrefix(m)
		spell = &si
		// DAMAGE_SHIELD uses _DAMAGE suffix, DAMAGE_SPLIT uses _DAMAGE suffix.
		suffix = "_DAMAGE"
	case "DAMAGE_SHIELD_MISSED":
		si := parseSpellPrefix(m)
		spell = &si
		suffix = "_MISSED"
	default:
		// Unknown prefix — return unparsed.
		return messages.Unparsed(ts, raw), nil
	}

	if m.Error() != nil {
		return nil, m.Error()
	}

	// Dispatch to suffix handler.
	switch suffix {
	case "_DAMAGE":
		return p.suffixDamage(ts, base, spell, envType, isPeriodic, prefix, m)
	case "_MISSED":
		return p.suffixMissed(ts, base, spell, isPeriodic, m)
	case "_HEAL":
		return p.suffixHeal(ts, base, spell, isPeriodic, m)
	case "_ENERGIZE":
		return p.suffixEnergize(ts, base, spell, m)
	case "_DRAIN", "_LEECH":
		return p.suffixDrain(ts, base, spell, suffix, m)
	case "_INTERRUPT":
		return p.suffixInterrupt(ts, base, spell, m)
	case "_DISPEL", "_STOLEN":
		return p.suffixDispel(ts, base, spell, m)
	case "_DISPEL_FAILED":
		return p.suffixDispelFailed(ts, base, spell, m)
	case "_EXTRA_ATTACKS":
		return p.suffixExtraAttacks(ts, base, spell, m)
	case "_AURA_APPLIED":
		return p.suffixAura(ts, base, spell, types.AuraStateAdded, messages.AuraTransitionApplied, m)
	case "_AURA_REMOVED":
		return p.suffixAura(ts, base, spell, types.AuraStateRemoved, messages.AuraTransitionRemoved, m)
	case "_AURA_REFRESH":
		return p.suffixAura(ts, base, spell, types.AuraStateModified, messages.AuraTransitionRefreshed, m)
	case "_AURA_APPLIED_DOSE", "_AURA_REMOVED_DOSE":
		return p.suffixAuraDose(ts, base, spell, m)
	case "_AURA_BROKEN":
		return p.suffixAura(ts, base, spell, types.AuraStateRemoved, messages.AuraTransitionRemoved, m)
	case "_AURA_BROKEN_SPELL":
		return p.suffixAuraBrokenSpell(ts, base, spell, m)
	case "_CAST_START":
		return p.suffixCastStart(ts, base, spell, m)
	case "_CAST_SUCCESS":
		return p.suffixCastSuccess(ts, base, spell, m)
	case "_CAST_FAILED":
		return p.suffixCastFailed(ts, base, spell, m)
	case "_SUMMON", "_CREATE":
		return p.suffixSummon(ts, spell, base, m)
	case "_INSTAKILL":
		return p.suffixInstakill(ts, base, m)
	case "_RESURRECT":
		return p.suffixResurrect(ts, base, spell, m)
	default:
		p.logger.Warn("Unparsed line", slog.String("line", raw))
		return messages.Unparsed(ts, raw), nil
	}
}

// ---------------------------------------------------------------------------
// Suffix handlers
// ---------------------------------------------------------------------------

// suffixDamage handles _DAMAGE: amount, overkill, school, resisted, blocked, absorbed, critical, glancing, crushing
func (p *Parser) suffixDamage(ts time.Time, base baseParams, spell *spellInfo, envType *types.EnvironmentType, isPeriodic bool, prefix string, m *Matched) ([]messages.Message, error) {
	amount := m.Int32()
	overkill := m.Int32() // overkill
	school := m.School()
	resisted := m.Int32()
	blocked := m.Int32()
	absorbed := m.Int32()
	critical := m.NilBool()
	glancing := m.NilBool()
	crushing := m.NilBool()

	if err := m.Error(); err != nil {
		return nil, err
	}

	ht := DamageHitType(critical, glancing, crushing, resisted, blocked, absorbed)
	if isPeriodic {
		ht |= types.HitTypePeriodic
	}
	if prefix == "DAMAGE_SPLIT" {
		ht |= types.HitTypeSplit
	}

	var trailer types.Trailer
	if resisted > 0 {
		trailer = append(trailer, types.TrailerEntry{Amount: ptr.Ref(uint32(resisted)), HitType: types.HitTypePartialResist})
	}
	if blocked > 0 {
		trailer = append(trailer, types.TrailerEntry{Amount: ptr.Ref(uint32(blocked)), HitType: types.HitTypePartialBlock})
	}
	if absorbed > 0 {
		trailer = append(trailer, types.TrailerEntry{Amount: ptr.Ref(uint32(absorbed)), HitType: types.HitTypePartialAbsorb})
	}

	var spellName *string
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = &spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
		school = spell.spellSchool
	} else if prefix == "SWING" {
		spellName = ptr.Ref("Auto Attack")
		spellData = p.lookupSpell(chrondbc.SpellIDAutoAttack)
	}

	caster := base.sourceGUID
	return set(&messages.Damage{
		MessageBase:     messages.Base(ts),
		SpellName:       spellName,
		SpellData:       spellData,
		Caster:          &caster,
		Target:          base.destGUID,
		HitType:         ht,
		Amount:          amount,
		Overkill:        overkill,
		School:          school,
		Trailer:         trailer,
		EnvironmentType: envType,
	})
}

// suffixMissed handles _MISSED: missType, isOffHand, amountMissed*
func (p *Parser) suffixMissed(ts time.Time, base baseParams, spell *spellInfo, isPeriodic bool, m *Matched) ([]messages.Message, error) {
	var trailer types.Trailer
	missTypeStr := m.String()
	switch missTypeStr {
	case "ABSORB":
		if m.Remain() < 1 {
			break
		}

		if m.Remain() == 2 {
			m.pop()
		}

		amount := m.Int32()
		trailer = append(trailer, types.TrailerEntry{
			Amount:  ptr.Ref(uint32(amount)),
			HitType: types.HitTypePartialAbsorb,
		})
	}

	// isOffHand and amountMissed are optional and may not be present.
	// We don't consume them to avoid index-out-of-range on short lines.

	ht := MissTypeToHitType(missTypeStr)
	if isPeriodic {
		ht |= types.HitTypePeriodic
	}

	var spellName *string
	var spellData *chrondbc.Spell
	var school types.School
	if spell != nil {
		spellName = &spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
		school = spell.spellSchool
	} else {
		spellName = ptr.Ref("Auto Attack")
		spellData = p.lookupSpell(chrondbc.SpellIDAutoAttack)
		school = types.PhysicalSchool
	}

	caster := base.sourceGUID
	return set(&messages.Damage{
		MessageBase: messages.Base(ts),
		SpellName:   spellName,
		SpellData:   spellData,
		Caster:      &caster,
		Target:      base.destGUID,
		HitType:     ht,
		Amount:      0,
		School:      school,
		Trailer:     trailer,
	})
}

// suffixHeal handles _HEAL: amount, overhealing, absorbed, critical
func (p *Parser) suffixHeal(ts time.Time, base baseParams, spell *spellInfo, isPeriodic bool, m *Matched) ([]messages.Message, error) {
	amount := m.Int32()
	overheal := m.Int32()
	absorbed := m.Int32() // Absorbed healing, not absorbed damage incoming.
	critical := m.NilBool()
	var _ = absorbed

	if err := m.Error(); err != nil {
		return nil, err
	}

	ht := types.HitTypeHit
	if critical != nil && *critical {
		ht = types.HitTypeCrit
	}
	if isPeriodic {
		ht |= types.HitTypePeriodic
	}

	var spellName string
	var spellData *chrondbc.Spell
	var school types.School
	if spell != nil {
		spellName = spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
		school = spell.spellSchool
	}

	return set(&messages.Heal{
		MessageBase: messages.Base(ts),
		Caster:      base.sourceGUID,
		Target:      base.destGUID,
		SpellName:   spellName,
		SpellData:   spellData,
		Amount:      amount,
		Overheal:    overheal,
		// Always 0.
		Absorbed: 0,
		HitType:  ht,
		School:   school,
	})
}

// suffixEnergize handles _ENERGIZE: amount, powerType
func (p *Parser) suffixEnergize(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	amount := m.Int32()
	powerType := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellName *string
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = &spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	caster := base.sourceGUID
	return set(&messages.ResourceChange{
		MessageBase: messages.Base(ts),
		Target:      base.destGUID,
		Amount:      amount,
		Resource:    PowerTypeToResource(powerType),
		Caster:      &caster,
		SpellName:   spellName,
		SpellData:   spellData,
		Direction:   types.ChangeDirectionGain,
	})
}

// suffixDrain handles _DRAIN and _LEECH: amount, powerType, extraAmount
// _LEECH additionally emits a Gain event for the source unit (extraAmount).
func (p *Parser) suffixDrain(ts time.Time, base baseParams, spell *spellInfo, suffix string, m *Matched) ([]messages.Message, error) {
	amount := m.Int32()
	powerType := m.Int32()
	extraAmount := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellName *string
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = &spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	caster := base.sourceGUID
	lossEvent := &messages.ResourceChange{
		MessageBase: messages.Base(ts),
		Target:      base.destGUID,
		Amount:      amount,
		Resource:    PowerTypeToResource(powerType),
		Caster:      &caster,
		SpellName:   spellName,
		SpellData:   spellData,
		Direction:   types.ChangeDirectionLoss,
	}

	if suffix == "_LEECH" && extraAmount > 0 {
		dest := base.destGUID
		gainEvent := &messages.ResourceChange{
			MessageBase: messages.Base(ts),
			Target:      base.sourceGUID,
			Amount:      extraAmount,
			Resource:    PowerTypeToResource(powerType),
			Caster:      &dest,
			SpellName:   spellName,
			SpellData:   spellData,
			Direction:   types.ChangeDirectionGain,
		}
		return set(lossEvent, gainEvent)
	}
	return set(lossEvent)
}

// suffixInterrupt handles _INTERRUPT: extraSpellID, extraSpellName, extraSchool
func (p *Parser) suffixInterrupt(ts time.Time, base baseParams, _ *spellInfo, m *Matched) ([]messages.Message, error) {
	extraSpellID := m.Int32()
	extraSpellName := m.String()
	extraSchool := m.School()

	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.Interrupt{
		MessageBase:  messages.Base(ts),
		Caster:       base.sourceGUID,
		Target:       base.destGUID,
		SpellName:    extraSpellName,
		ExtraSpellID: extraSpellID,
		ExtraSchool:  extraSchool,
	})
}

// suffixDispel handles _DISPEL and _STOLEN: extraSpellID, extraSpellName, extraSchool, auraType
func (p *Parser) suffixDispel(ts time.Time, base baseParams, _ *spellInfo, m *Matched) ([]messages.Message, error) {
	extraSpellID := m.Int32()
	extraSpellName := m.String()
	_ = m.School() // extraSchool
	_ = m.String() // auraType (BUFF/DEBUFF)

	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.Dispel{
		MessageBase: messages.Base(ts),
		Caster:      base.sourceGUID,
		Target:      base.destGUID,
		Spell:       p.lookupSpell(chrondbc.SpellID(extraSpellID), extraSpellName),
	})
}

// suffixDispelFailed handles _DISPEL_FAILED: extraSpellID, extraSpellName, extraSchool
func (p *Parser) suffixDispelFailed(ts time.Time, base baseParams, _ *spellInfo, m *Matched) ([]messages.Message, error) {
	_ = m.Int32()  // extraSpellID
	_ = m.String() // extraSpellName
	_ = m.School() // extraSchool

	if err := m.Error(); err != nil {
		return nil, err
	}

	// No dedicated message type for dispel failed; return unparsed-like skip.
	return messages.Unparsed(ts, "DISPEL_FAILED"), nil
}

// suffixExtraAttacks handles _EXTRA_ATTACKS: amount
func (p *Parser) suffixExtraAttacks(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	amount := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	return set(&messages.ExtraAttack{
		MessageBase: messages.Base(ts),
		Caster:      base.sourceGUID,
		Amount:      amount,
		Spell:       spellData,
	})
}

// suffixAura handles _AURA_APPLIED, _AURA_REMOVED, _AURA_REFRESH, _AURA_BROKEN: auraType
func (p *Parser) suffixAura(ts time.Time, base baseParams, spell *spellInfo, state types.AuraState, transition messages.AuraTransition, m *Matched) ([]messages.Message, error) {
	auraType := m.String() // "BUFF" or "DEBUFF"

	if err := m.Error(); err != nil {
		return nil, err
	}

	isBuff := auraType == "BUFF"

	var spellName string
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	// TODO: This is not wholly correct.
	amt := int32(1)
	if state == types.AuraStateRemoved {
		amt = 0
	}

	var source *guid.GUID
	if !base.sourceGUID.IsZero() {
		source = &base.sourceGUID
	}

	auraMsg := &messages.Aura{
		MessageBase: messages.Base(ts),
		IsBuff:      isBuff,
		Source:      source,
		Target:      base.destGUID,
		SpellName:   spellName,
		SpellData:   spellData,
		Amount:      amt,
		State:       state,
		Transition:  transition,
	}

	// Emit an AuraCast alongside the Aura on application so downstream
	// consumers (possession, enslave demon, etc.) get the same signal they
	// get from vanilla logs.
	if transition == messages.AuraTransitionApplied && spellData != nil {
		dest := base.destGUID
		return []messages.Message{
			auraMsg,
			&messages.AuraCast{
				MessageBase: messages.Base(ts),
				Spell:       spellData,
				Caster:      base.sourceGUID,
				Target:      &dest,
			},
		}, nil
	}

	return set(auraMsg)
}

// suffixAuraDose handles _AURA_APPLIED_DOSE and _AURA_REMOVED_DOSE: auraType, amount
func (p *Parser) suffixAuraDose(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	auraType := m.String() // "BUFF" or "DEBUFF"
	amount := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	isBuff := auraType == "BUFF"

	var spellName string
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	var source *guid.GUID
	if !base.sourceGUID.IsZero() {
		source = &base.sourceGUID
	}

	return set(&messages.Aura{
		MessageBase: messages.Base(ts),
		IsBuff:      isBuff,
		Source:      source,
		Target:      base.destGUID,
		SpellName:   spellName,
		SpellData:   spellData,
		Amount:      amount,
		State:       types.AuraStateModified,
		Transition:  messages.AuraTransitionStackChanged,
	})
}

// suffixAuraBrokenSpell handles _AURA_BROKEN_SPELL: extraSpellID, extraSpellName, extraSchool, auraType
func (p *Parser) suffixAuraBrokenSpell(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	_ = m.Int32()  // extraSpellID
	_ = m.String() // extraSpellName
	_ = m.School() // extraSchool
	auraType := m.String()

	if err := m.Error(); err != nil {
		return nil, err
	}

	isBuff := auraType == "BUFF"

	var spellName string
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = spell.spellName
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	var source *guid.GUID
	if !base.sourceGUID.IsZero() {
		source = &base.sourceGUID
	}

	return set(&messages.Aura{
		MessageBase: messages.Base(ts),
		IsBuff:      isBuff,
		Source:      source,
		Target:      base.destGUID,
		SpellName:   spellName,
		SpellData:   spellData,
		Amount:      0,
		State:       types.AuraStateRemoved,
	})
}

// suffixCastStart handles _CAST_START (no additional suffix params).
func (p *Parser) suffixCastStart(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	target := base.destGUID
	var targetPtr *guid.GUID
	if !target.IsZero() {
		targetPtr = &target
	}

	return set(&messages.SpellStart{
		MessageBase: messages.Base(ts),
		SpellData:   spellData,
		Caster:      base.sourceGUID,
		Target:      targetPtr,
	})
}

// suffixCastSuccess handles _CAST_SUCCESS (no additional suffix params).
func (p *Parser) suffixCastSuccess(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	target := base.destGUID
	var targetPtr *guid.GUID
	if !target.IsZero() {
		targetPtr = &target
	}

	return set(&messages.SpellGo{
		MessageBase: messages.Base(ts),
		SpellData:   spellData,
		Caster:      base.sourceGUID,
		Target:      targetPtr,
	})
}

// suffixResurrect handles _RESURRECT (no additional suffix params).
func (p *Parser) suffixResurrect(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	return set(&messages.Resurrection{
		MessageBase: messages.Base(ts),
		Source:      base.sourceGUID,
		Target:      base.destGUID,
		Spell:       spellData,
	})
}

// suffixCastFailed handles _CAST_FAILED: failedType
func (p *Parser) suffixCastFailed(ts time.Time, base baseParams, spell *spellInfo, m *Matched) ([]messages.Message, error) {
	failedType := m.String()

	if err := m.Error(); err != nil {
		return nil, err
	}

	// Detect ChronicleCompanionWoTLK addon messages smuggled in the failedType field.
	if companion.IsCompanionMessage(failedType) {
		if p.companion == nil {
			p.companion = companion.New(p.logger)
		}
		msgs, err := p.companion.Feed(ts, failedType)
		if err == nil {
			p.SetRealmClockInfo(p.companion.RealmClockInfo())
		}
		return msgs, err
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	return set(&messages.SpellFail{
		MessageBase: messages.Base(ts),
		SpellData:   spellData,
		Caster:      base.sourceGUID,
	})
}

// suffixSummon handles _SUMMON and _CREATE.
func (p *Parser) suffixSummon(ts time.Time, spell *spellInfo, base baseParams, m *Matched) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	if base.destGUID == 0 || base.sourceGUID == 0 {
		return []messages.Message{}, nil
	}

	unitType := types.UnitTypeFromGUID(base.destGUID)

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = p.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	classification := &messages.UnitClassificationEvent{
		MessageBase: messages.Base(ts),
		Target:      base.destGUID,
		UnitType:    unitType,
		Affiliation: types.AffiliationUnknown,
		Controller:  nil,
		Spell:       spellData,
	}
	if base.destGUID.IsVehicle() {
		return set(classification)
	}

	classification.Owner = ptr.Ref(base.sourceGUID)
	return set(
		&messages.NewOwner{
			MessageBase: messages.Base(ts),
			Target:      base.destGUID,
			NewOwner:    base.sourceGUID,
		},
		classification,
	)
}

// suffixInstakill handles _INSTAKILL.
func (p *Parser) suffixInstakill(ts time.Time, base baseParams, m *Matched) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	caster := base.sourceGUID
	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      base.destGUID,
		Killer:      &caster,
	})
}

// ---------------------------------------------------------------------------
// Special events
// ---------------------------------------------------------------------------

// unitDied handles UNIT_DIED and UNIT_DESTROYED.
func (p *Parser) unitDied(ts time.Time, m *Matched) ([]messages.Message, error) {
	base := parseBase(m)
	p.guidNames.Record(base.sourceGUID, base.sourceName)
	p.guidNames.Record(base.destGUID, base.destName)
	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      base.destGUID,
	})
}

// partyKill handles PARTY_KILL.
func (p *Parser) partyKill(ts time.Time, m *Matched) ([]messages.Message, error) {
	base := parseBase(m)
	p.guidNames.Record(base.sourceGUID, base.sourceName)
	p.guidNames.Record(base.destGUID, base.destName)
	if err := m.Error(); err != nil {
		return nil, err
	}

	caster := base.sourceGUID
	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      base.destGUID,
		Killer:      &caster,
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func set(m ...messages.Message) ([]messages.Message, error) {
	return m, nil
}

// lookupSpell is a best-effort spell lookup; returns nil on error rather
// than failing the whole line parse. When a spell is missed, the name from
// the combat log is recorded for diagnostics.
func (p *Parser) lookupSpell(id chrondbc.SpellID, names ...string) *chrondbc.Spell {
	if id == 0 {
		return nil
	}
	s, err := p.wowDB.Spell(context.Background(), id)
	if err != nil {
		entry := p.missedSpells[id]
		entry.Count++
		if entry.Name == "" && len(names) > 0 {
			entry.Name = names[0]
		}
		p.missedSpells[id] = entry
		return nil
	}
	return s
}
