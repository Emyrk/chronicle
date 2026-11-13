// Package cleu owns lexical and semantic decoding shared by native TBC and
// WotLK COMBAT_LOG_EVENT_UNFILTERED records. Expansion packages provide an
// explicit format and flavor; this package never infers either from wire data.
package cleu

import (
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

// Context is the resolved semantic context for a CLEU decoder. Both fields are
// mandatory even where a particular record currently only branches on Format.
type Context struct {
	Format database.LogFormat
	Flavor database.WoWFlavor
}

func (c Context) validate() error {
	if c.Format == "" {
		return errors.New("CLEU decoder format is required")
	}
	if len(c.Flavor) == 0 {
		return errors.New("CLEU decoder flavor is required")
	}
	return nil
}

// Cursor is the semantic field cursor supplied by the lexical CLEU decoder.
// The legacy WotLK cursor implements this interface while parsernext owns the
// semantic interpretation of its values.
type Cursor interface {
	Error() error
	Remain() int
	String() string
	Guid() guid.GUID
	HexUint32() uint32
	Int32() int32
	Int64() int64
	Uint32() uint32
	OptionalGuid() *guid.GUID
	School() types.School
	NilBool() *bool
}

// Fields is a parsernext-owned cursor over already lexed CLEU fields.
type Fields struct {
	parts []string
	index int
	err   error
}

func NewFields(parts []string) *Fields { return &Fields{parts: parts} }
func (m *Fields) Error() error         { return m.err }
func (m *Fields) Remain() int          { return len(m.parts) - m.index }

// SetError records a format-specific conversion error without replacing an earlier error.
func (m *Fields) SetError(err error) { m.setError(err) }

func (m *Fields) setError(err error) {
	if m.err == nil {
		m.err = err
	}
}
func (m *Fields) pop() string {
	if m.index >= len(m.parts) {
		m.setError(fmt.Errorf("field index %d out of range (have %d fields)", m.index, len(m.parts)))
		return ""
	}
	value := m.parts[m.index]
	m.index++
	return value
}
func (m *Fields) String() string { return m.pop() }
func (m *Fields) Guid() guid.GUID {
	return parseField(m, func(raw string) (guid.GUID, error) {
		id, err := guid.FromString(raw)
		if err != nil {
			return 0, err
		}
		return SyntheticGUID(id), nil
	})
}
func (m *Fields) OptionalGuid() *guid.GUID {
	return parseField(m, func(s string) (*guid.GUID, error) {
		if s == "" || s == "nil" || s == "0x0000000000000000" {
			return nil, nil
		}
		id, err := guid.FromString(s)
		if err != nil {
			return nil, err
		}
		if id == 0 {
			return nil, nil
		}
		id = SyntheticGUID(id)
		return &id, nil
	})
}

// HexUint32 parses the next field as a hex integer (e.g. "0x10512" for unit flags).
func (m *Fields) HexUint32() uint32 {
	return parseField(m, func(s string) (uint32, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		v, err := strconv.ParseUint(strings.TrimPrefix(s, "0x"), 16, 32)
		return uint32(v), err
	})
}

// Int32 parses the next field as a decimal int32. "nil" is treated as 0.
func (m *Fields) Int32() int32 {
	return parseField(m, func(s string) (int32, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		v, err := strconv.ParseInt(s, 10, 32)
		return int32(v), err
	})
}

// Int64 parses the next field as a decimal int64. "nil" is treated as 0.
func (m *Fields) Int64() int64 {
	return parseField(m, func(s string) (int64, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		return strconv.ParseInt(s, 10, 64)
	})
}

// Uint32 parses the next field as a decimal uint32. "nil" is treated as 0.
func (m *Fields) Uint32() uint32 {
	return parseField(m, func(s string) (uint32, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		v, err := strconv.ParseUint(s, 10, 32)
		return uint32(v), err
	})
}

// School parses the next field as a types.School bitmask. In WotLK logs,
// spell prefix schools are hex ("0x1"), while suffix schools are decimal ("1").
// This method detects the "0x" prefix and parses accordingly.
func (m *Fields) School() types.School {
	return parseField(m, func(s string) (types.School, error) {
		if s == "nil" || s == "" {
			return types.NoneSchool, nil
		}
		if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
			v, err := strconv.ParseUint(s[2:], 16, 16)
			return types.School(v), err
		}
		v, err := strconv.ParseUint(s, 10, 16)
		return types.School(v), err
	})
}

// NilBool preserves the legacy numeric boolean contract.
func (m *Fields) NilBool() *bool {
	return parseField(m, func(s string) (*bool, error) {
		if s == "nil" || s == "" {
			return nil, nil
		}
		value := s == "1"
		return &value, nil
	})
}

func parseField[T any](m *Fields, fn func(string) (T, error)) T {
	raw := m.pop()
	value, err := fn(raw)
	if err != nil {
		m.setError(fmt.Errorf("parsing field %d (%q): %w", m.index-1, raw, err))
	}
	return value
}

// Hooks preserve integration owned by the caller: DBC lookup, format-specific
// companion records, exact legacy event overrides, GUID name storage, and
// logging. The semantic decoder owns none of those execution lifecycles.
type Hooks struct {
	LookupSpell     func(id chrondbc.SpellID, names ...string) *chrondbc.Spell
	DecodeCompanion func(ts time.Time, payload string) ([]messages.Message, bool, error)
	DecodeEvent     func(ts time.Time, event string, cursor Cursor, raw string) ([]messages.Message, bool, error)
	RecordGUIDName  func(id guid.GUID, name string)
	WarnUnparsed    func(raw string)
}

// Decoder converts a lexed CLEU record to the shared message model.
type Decoder struct {
	context Context
	hooks   Hooks
}

func NewDecoder(context Context, hooks Hooks) (*Decoder, error) {
	if err := context.validate(); err != nil {
		return nil, err
	}
	return &Decoder{context: context, hooks: hooks}, nil
}

func (d *Decoder) recordGUIDName(id guid.GUID, name string) {
	if d.hooks.RecordGUIDName != nil {
		d.hooks.RecordGUIDName(id, name)
	}
}

func (d *Decoder) lookupSpell(id chrondbc.SpellID, names ...string) *chrondbc.Spell {
	if d.hooks.LookupSpell == nil {
		return nil
	}
	return d.hooks.LookupSpell(id, names...)
}

func (d *Decoder) warnUnparsed(raw string) {
	if d.hooks.WarnUnparsed != nil {
		d.hooks.WarnUnparsed(raw)
		return
	}
	slog.Default().Warn("Unparsed line", slog.String("line", raw))
}

// Record is a normalized CLEU record ready for semantic decoding. Format-owned
// sources are responsible for timestamp conversion, event normalization, and
// field extraction before constructing it. Fields are already unquoted and in
// semantic wire order. Raw is optional and used only for diagnostics.
type Record struct {
	Timestamp time.Time
	Event     string
	Fields    []string
	Raw       string
}

// DecodeRecord converts one normalized record to shared combat messages. It
// does not run synthetics, normalize clocks, reorder records, or invoke legacy
// parser execution.
func (d *Decoder) DecodeRecord(record Record) ([]messages.Message, error) {
	return d.Decode(record.Timestamp, record.Event, NewFields(record.Fields), record.Raw)
}

// Decode interprets one lexed CLEU record. Timestamp normalization, ordering,
// physical scanning, and format-specific synthetic pipelines remain caller-owned.
func (d *Decoder) Decode(ts time.Time, event string, cursor Cursor, raw string) ([]messages.Message, error) {
	return d.dispatch(ts, event, cursor, raw)
}

// SyntheticGUID normalizes known WotLK GUID type mistakes before messages are
// built so every downstream classifier sees the corrected entity type.
func SyntheticGUID(id guid.GUID) guid.GUID {
	entry, ok := id.GetEntry()
	if !ok || entry != 33090 { // Pool of Tar
		return id
	}
	return id.AsVehicle()
}

// PowerTypeToResource maps WotLK integer powerType values to shared resources.
func PowerTypeToResource(pt int32) types.Resource {
	switch pt {
	case -2:
		return types.ResourceHealth
	case 0:
		return types.ResourceMana
	case 1:
		return types.ResourceRage
	case 2:
		return types.ResourceFocus
	case 3:
		return types.ResourceEnergy
	default:
		return types.ResourceUnknown
	}
}

func MissTypeToHitType(value string) types.HitType {
	switch strings.ToUpper(value) {
	case "ABSORB":
		return types.HitTypeFullAbsorb
	case "BLOCK":
		return types.HitTypeFullBlock
	case "DEFLECT":
		return types.HitTypeDeflect
	case "DODGE":
		return types.HitTypeDodge
	case "EVADE":
		return types.HitTypeEvade
	case "IMMUNE":
		return types.HitTypeImmune
	case "MISS":
		return types.HitTypeMiss
	case "PARRY":
		return types.HitTypeParry
	case "REFLECT":
		return types.HitTypeReflect
	case "RESIST":
		return types.HitTypeFullResist
	default:
		return types.HitTypeMiss
	}
}

func WeaponHandHitType(isOffHand *bool) types.HitType {
	if isOffHand == nil {
		return types.HitTypeNone
	}
	if *isOffHand {
		return types.HitTypeOffHand
	}
	return types.HitTypeMainHand
}

func EnvironmentTypeFromString(value string) types.EnvironmentType {
	switch strings.ToUpper(value) {
	case "DROWNING":
		return types.EnvironmentTypeDrowning
	case "FALLING":
		return types.EnvironmentTypeFall
	case "FATIGUE":
		return types.EnvironmentTypeFatigue
	case "FIRE":
		return types.EnvironmentTypeFire
	case "LAVA":
		return types.EnvironmentTypeLava
	case "SLIME":
		return types.EnvironmentTypeSlime
	default:
		return types.EnvironmentType(strings.ToLower(value))
	}
}

func DamageHitType(critical, glancing, crushing *bool, resisted, blocked, absorbed int32) types.HitType {
	hitType := types.HitTypeHit
	if critical != nil && *critical {
		hitType = types.HitTypeCrit
	}
	if glancing != nil && *glancing {
		hitType = types.HitTypeGlancing
	}
	if crushing != nil && *crushing {
		hitType = types.HitTypeCrushing
	}
	if resisted > 0 {
		hitType |= types.HitTypePartialResist
	}
	if blocked > 0 {
		hitType |= types.HitTypePartialBlock
	}
	if absorbed > 0 {
		hitType |= types.HitTypePartialAbsorb
	}
	return hitType
}

// SplitEvent decomposes a CLEU event name into its semantic prefix and suffix.
func SplitEvent(event string) (prefix, suffix string) {
	knownPrefixes := []string{"DAMAGE_SHIELD_MISSED", "SPELL_PERIODIC", "SPELL_BUILDING", "DAMAGE_SHIELD", "DAMAGE_SPLIT", "SWING", "RANGE", "SPELL", "ENVIRONMENTAL"}
	for _, candidate := range knownPrefixes {
		if !strings.HasPrefix(event, candidate) {
			continue
		}
		rest := event[len(candidate):]
		if rest == "" {
			return candidate, ""
		}
		if rest[0] == '_' {
			return candidate, rest
		}
	}
	return event, ""
}

func set(values ...messages.Message) ([]messages.Message, error) { return values, nil }

type baseParams struct {
	sourceGUID  guid.GUID
	sourceName  string
	sourceFlags uint32
	destGUID    guid.GUID
	destName    string
	destFlags   uint32
}

func parseBase(m Cursor) baseParams {
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

func parseSpellPrefix(m Cursor) spellInfo {
	return spellInfo{
		spellID:     m.Int32(),
		spellName:   m.String(),
		spellSchool: m.School(),
	}
}

// dispatch routes a parsed event to the appropriate handler.
func (d *Decoder) dispatch(ts time.Time, event string, m Cursor, raw string) ([]messages.Message, error) {
	// Special events first — these have base params but unique structure.
	switch event {
	case "UNIT_DIED", "UNIT_DESTROYED", "UNIT_DISSIPATES":
		return d.unitDied(ts, m)
	case "PARTY_KILL":
		return d.partyKill(ts, m)
	case "ENCHANT_APPLIED", "ENCHANT_REMOVED":
		return messages.Unparsed(ts, raw), nil
	}

	if d.hooks.DecodeEvent != nil {
		decoded, handled, err := d.hooks.DecodeEvent(ts, event, m, raw)
		if handled || err != nil {
			return decoded, err
		}
	}

	// Standard events: parse base params.
	base := parseBase(m)
	d.recordGUIDName(base.sourceGUID, base.sourceName)
	d.recordGUIDName(base.destGUID, base.destName)

	prefix, suffix := SplitEvent(event)

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
		return d.suffixDamage(ts, base, spell, envType, isPeriodic, prefix, m)
	case "_MISSED":
		return d.suffixMissed(ts, base, spell, isPeriodic, m)
	case "_HEAL":
		return d.suffixHeal(ts, base, spell, isPeriodic, m)
	case "_ENERGIZE":
		return d.suffixEnergize(ts, base, spell, m)
	case "_DRAIN", "_LEECH":
		return d.suffixDrain(ts, base, spell, suffix, m)
	case "_INTERRUPT":
		return d.suffixInterrupt(ts, base, spell, m)
	case "_DISPEL", "_STOLEN":
		return d.suffixDispel(ts, base, spell, m)
	case "_DISPEL_FAILED":
		return d.suffixDispelFailed(ts, base, spell, m)
	case "_EXTRA_ATTACKS":
		return d.suffixExtraAttacks(ts, base, spell, m)
	case "_AURA_APPLIED":
		return d.suffixAura(ts, base, spell, types.AuraStateAdded, messages.AuraTransitionApplied, m)
	case "_AURA_REMOVED":
		return d.suffixAura(ts, base, spell, types.AuraStateRemoved, messages.AuraTransitionRemoved, m)
	case "_AURA_REFRESH":
		return d.suffixAura(ts, base, spell, types.AuraStateModified, messages.AuraTransitionRefreshed, m)
	case "_AURA_APPLIED_DOSE", "_AURA_REMOVED_DOSE":
		return d.suffixAuraDose(ts, base, spell, m)
	case "_AURA_BROKEN":
		return d.suffixAura(ts, base, spell, types.AuraStateRemoved, messages.AuraTransitionRemoved, m)
	case "_AURA_BROKEN_SPELL":
		return d.suffixAuraBrokenSpell(ts, base, spell, m)
	case "_CAST_START":
		return d.suffixCastStart(ts, base, spell, m)
	case "_CAST_SUCCESS":
		return d.suffixCastSuccess(ts, base, spell, m)
	case "_CAST_FAILED":
		return d.suffixCastFailed(ts, base, spell, m)
	case "_SUMMON", "_CREATE":
		return d.suffixSummon(ts, spell, base, m)
	case "_INSTAKILL":
		return d.suffixInstakill(ts, base, m)
	case "_RESURRECT":
		return d.suffixResurrect(ts, base, spell, m)
	default:
		d.warnUnparsed(raw)
		return messages.Unparsed(ts, raw), nil
	}
}

// ---------------------------------------------------------------------------
// Suffix handlers
// ---------------------------------------------------------------------------

// suffixDamage handles _DAMAGE. WotLK adds overkill between amount and school;
// native TBC 2.4.3 records do not include that field.
func (d *Decoder) suffixDamage(ts time.Time, base baseParams, spell *spellInfo, envType *types.EnvironmentType, isPeriodic bool, prefix string, m Cursor) ([]messages.Message, error) {
	amount := m.Int32()
	var overkill int32
	if d.context.Format != database.LogFormat243CcAddon {
		overkill = m.Int32()
	}
	school := m.School()
	resisted := m.Int32()
	blocked := m.Int32()
	absorbed := m.Int32()
	critical := m.NilBool()
	glancing := m.NilBool()
	crushing := m.NilBool()
	var isOffHand *bool
	if prefix == "SWING" && m.Remain() > 0 {
		isOffHand = m.NilBool()
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	ht := DamageHitType(critical, glancing, crushing, resisted, blocked, absorbed)
	ht |= WeaponHandHitType(isOffHand)
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
	var spellID chrondbc.SpellID
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = &spell.spellName
		spellID = chrondbc.SpellID(spell.spellID)
		spellData = d.lookupSpell(spellID, spell.spellName)
		school = spell.spellSchool
	} else if prefix == "SWING" {
		spellName = ptr.Ref("Auto Attack")
		spellData = d.lookupSpell(chrondbc.SpellIDAutoAttack)
	}

	caster := base.sourceGUID
	return set(&messages.Damage{
		MessageBase:     messages.Base(ts),
		SpellName:       spellName,
		SpellID:         spellID,
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
func (d *Decoder) suffixMissed(ts time.Time, base baseParams, spell *spellInfo, isPeriodic bool, m Cursor) ([]messages.Message, error) {
	var trailer types.Trailer
	missTypeStr := m.String()
	var isOffHand *bool
	if spell == nil && m.Remain() > 0 && (missTypeStr != "ABSORB" || m.Remain() > 1) {
		isOffHand = m.NilBool()
	}
	if missTypeStr == "ABSORB" && m.Remain() > 0 {
		amount := m.Int32()
		trailer = append(trailer, types.TrailerEntry{
			Amount:  ptr.Ref(uint32(amount)),
			HitType: types.HitTypePartialAbsorb,
		})
	}

	ht := MissTypeToHitType(missTypeStr)
	ht |= WeaponHandHitType(isOffHand)
	if isPeriodic {
		ht |= types.HitTypePeriodic
	}

	var spellName *string
	var spellID chrondbc.SpellID
	var spellData *chrondbc.Spell
	var school types.School
	if spell != nil {
		spellName = &spell.spellName
		spellID = chrondbc.SpellID(spell.spellID)
		spellData = d.lookupSpell(spellID, spell.spellName)
		school = spell.spellSchool
	} else {
		spellName = ptr.Ref("Auto Attack")
		spellData = d.lookupSpell(chrondbc.SpellIDAutoAttack)
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

// suffixHeal handles _HEAL. Native TBC 2.4.3 records contain amount and
// critical only; WotLK adds overhealing and absorbed healing before critical.
func (d *Decoder) suffixHeal(ts time.Time, base baseParams, spell *spellInfo, isPeriodic bool, m Cursor) ([]messages.Message, error) {
	amount := m.Int32()
	var overheal int32
	if d.context.Format != database.LogFormat243CcAddon {
		overheal = m.Int32()
		_ = m.Int32() // Absorbed healing, not absorbed damage incoming.
	}
	critical := m.NilBool()

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
		spellData = d.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
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
func (d *Decoder) suffixEnergize(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	amount := m.Int32()
	powerType := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellName *string
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = &spell.spellName
		spellData = d.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
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
func (d *Decoder) suffixDrain(ts time.Time, base baseParams, spell *spellInfo, suffix string, m Cursor) ([]messages.Message, error) {
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
		spellData = d.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
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
func (d *Decoder) suffixInterrupt(ts time.Time, base baseParams, _ *spellInfo, m Cursor) ([]messages.Message, error) {
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
func (d *Decoder) suffixDispel(ts time.Time, base baseParams, _ *spellInfo, m Cursor) ([]messages.Message, error) {
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
		Spell:       d.lookupSpell(chrondbc.SpellID(extraSpellID), extraSpellName),
	})
}

// suffixDispelFailed handles _DISPEL_FAILED: extraSpellID, extraSpellName, extraSchool
func (d *Decoder) suffixDispelFailed(ts time.Time, base baseParams, _ *spellInfo, m Cursor) ([]messages.Message, error) {
	_ = m.Int32()  // extraSpellID
	_ = m.String() // extraSpellName
	_ = m.School() // extraSchool

	if err := m.Error(); err != nil {
		return nil, err
	}

	// No dedicated message type for dispel failed; return unparsed-like skid.
	return messages.Unparsed(ts, "DISPEL_FAILED"), nil
}

// suffixExtraAttacks handles _EXTRA_ATTACKS: amount
func (d *Decoder) suffixExtraAttacks(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	amount := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = d.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	return set(&messages.ExtraAttack{
		MessageBase: messages.Base(ts),
		Caster:      base.sourceGUID,
		Amount:      amount,
		Spell:       spellData,
	})
}

// suffixAura handles _AURA_APPLIED, _AURA_REMOVED, _AURA_REFRESH, _AURA_BROKEN: auraType
func (d *Decoder) suffixAura(ts time.Time, base baseParams, spell *spellInfo, state types.AuraState, transition messages.AuraTransition, m Cursor) ([]messages.Message, error) {
	auraType := m.String() // "BUFF" or "DEBUFF"

	if err := m.Error(); err != nil {
		return nil, err
	}

	isBuff := auraType == "BUFF"

	var spellName string
	var spellID chrondbc.SpellID
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = spell.spellName
		spellID = chrondbc.SpellID(spell.spellID)
		spellData = d.lookupSpell(spellID, spell.spellName)
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
		SpellID:     spellID,
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
func (d *Decoder) suffixAuraDose(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	auraType := m.String() // "BUFF" or "DEBUFF"
	amount := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	isBuff := auraType == "BUFF"

	var spellName string
	var spellID chrondbc.SpellID
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = spell.spellName
		spellID = chrondbc.SpellID(spell.spellID)
		spellData = d.lookupSpell(spellID, spell.spellName)
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
		SpellID:     spellID,
		SpellData:   spellData,
		Amount:      amount,
		State:       types.AuraStateModified,
		Transition:  messages.AuraTransitionStackChanged,
	})
}

// suffixAuraBrokenSpell handles _AURA_BROKEN_SPELL: extraSpellID, extraSpellName, extraSchool, auraType
func (d *Decoder) suffixAuraBrokenSpell(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	_ = m.Int32()  // extraSpellID
	_ = m.String() // extraSpellName
	_ = m.School() // extraSchool
	auraType := m.String()

	if err := m.Error(); err != nil {
		return nil, err
	}

	isBuff := auraType == "BUFF"

	var spellName string
	var spellID chrondbc.SpellID
	var spellData *chrondbc.Spell
	if spell != nil {
		spellName = spell.spellName
		spellID = chrondbc.SpellID(spell.spellID)
		spellData = d.lookupSpell(spellID, spell.spellName)
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
		SpellID:     spellID,
		SpellData:   spellData,
		Amount:      0,
		State:       types.AuraStateRemoved,
	})
}

// suffixCastStart handles _CAST_START (no additional suffix params).
func (d *Decoder) suffixCastStart(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellID chrondbc.SpellID
	var spellData *chrondbc.Spell
	if spell != nil {
		spellID = chrondbc.SpellID(spell.spellID)
		spellData = d.lookupSpell(spellID, spell.spellName)
	}

	target := base.destGUID
	var targetPtr *guid.GUID
	if !target.IsZero() {
		targetPtr = &target
	}

	return set(&messages.SpellStart{
		MessageBase: messages.Base(ts),
		SpellID:     spellID,
		SpellData:   spellData,
		Caster:      base.sourceGUID,
		Target:      targetPtr,
	})
}

// suffixCastSuccess handles _CAST_SUCCESS (no additional suffix params).
func (d *Decoder) suffixCastSuccess(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellID chrondbc.SpellID
	var spellData *chrondbc.Spell
	if spell != nil {
		spellID = chrondbc.SpellID(spell.spellID)
		spellData = d.lookupSpell(spellID, spell.spellName)
	}

	target := base.destGUID
	var targetPtr *guid.GUID
	if !target.IsZero() {
		targetPtr = &target
	}

	return set(&messages.SpellGo{
		MessageBase: messages.Base(ts),
		SpellID:     spellID,
		SpellData:   spellData,
		Caster:      base.sourceGUID,
		Target:      targetPtr,
	})
}

// suffixResurrect handles _RESURRECT (no additional suffix params).
func (d *Decoder) suffixResurrect(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = d.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	return set(&messages.Resurrection{
		MessageBase: messages.Base(ts),
		Source:      base.sourceGUID,
		Target:      base.destGUID,
		Spell:       spellData,
	})
}

// suffixCastFailed handles _CAST_FAILED: failedType
func (d *Decoder) suffixCastFailed(ts time.Time, base baseParams, spell *spellInfo, m Cursor) ([]messages.Message, error) {
	failedType := m.String()

	if err := m.Error(); err != nil {
		return nil, err
	}

	// Companion ownership remains with the format composition layer. It may
	// recognize payloads smuggled in failedType and update caller-owned clock state.
	if d.hooks.DecodeCompanion != nil {
		decoded, handled, err := d.hooks.DecodeCompanion(ts, failedType)
		if handled || err != nil {
			return decoded, err
		}
	}

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = d.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
	}

	return set(&messages.SpellFail{
		MessageBase: messages.Base(ts),
		SpellData:   spellData,
		Caster:      base.sourceGUID,
	})
}

// suffixSummon handles _SUMMON and _CREATE.
func (d *Decoder) suffixSummon(ts time.Time, spell *spellInfo, base baseParams, m Cursor) ([]messages.Message, error) {
	if err := m.Error(); err != nil {
		return nil, err
	}

	if base.destGUID == 0 || base.sourceGUID == 0 {
		return []messages.Message{}, nil
	}

	unitType := types.UnitTypeFromGUID(base.destGUID)

	var spellData *chrondbc.Spell
	if spell != nil {
		spellData = d.lookupSpell(chrondbc.SpellID(spell.spellID), spell.spellName)
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
func (d *Decoder) suffixInstakill(ts time.Time, base baseParams, m Cursor) ([]messages.Message, error) {
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

// unitDied handles unit removal events that do not identify a killer.
func (d *Decoder) unitDied(ts time.Time, m Cursor) ([]messages.Message, error) {
	base := parseBase(m)
	d.recordGUIDName(base.sourceGUID, base.sourceName)
	d.recordGUIDName(base.destGUID, base.destName)
	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      base.destGUID,
	})
}

// partyKill handles PARTY_KILL.
func (d *Decoder) partyKill(ts time.Time, m Cursor) ([]messages.Message, error) {
	base := parseBase(m)
	d.recordGUIDName(base.sourceGUID, base.sourceName)
	d.recordGUIDName(base.destGUID, base.destName)
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
