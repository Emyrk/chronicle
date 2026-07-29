package messages

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/playerposition"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/castv2"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatcount"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitdied"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type ActivityEventType string

const (
	ActivityStart ActivityEventType = "start"
	ActivityEnd   ActivityEventType = "end"
	ActivitySlain ActivityEventType = "slain"
	ActivityBump  ActivityEventType = "bump"
)

func ToString(msg Message) string {
	return fmt.Sprintf("[%T] %s", msg, msg.Date().Format("15:04:05.000"))
}

type Message interface {
	isMessage()
	Date() time.Time
	Affects() []guid.GUID
	IsSynthetic() bool
	Activity() map[guid.GUID]ActivityEventType
	AddActivity(guid.GUID, ActivityEventType)
	ResetActivity()

	// Marks add custom behavior to messages.

	MarksExist() bool
	MarkHas(markType MarkType, me guid.GUID) (string, bool)
}

type MessageBase struct {
	Timestamp time.Time `json:"timestamp"`
	Synthetic bool      `json:"synthetic,omitempty"`

	// activity is used for debugging
	activity map[guid.GUID]ActivityEventType
	*marks
}

func WithSynthetic() func(*MessageBase) {
	return func(mb *MessageBase) {
		mb.Synthetic = true
	}
}

func Base(ts time.Time, opts ...func(m *MessageBase)) MessageBase {
	b := MessageBase{
		Timestamp: ts,
		activity:  nil,
		marks:     &marks{},
	}
	for _, opt := range opts {
		opt(&b)
	}
	return b
}

// IsSynthetic indicates whether this message was synthetically generated,
// meaning these were not sourced from the original combat log. There is no
// mapping to a line in the log file.
func (m MessageBase) IsSynthetic() bool {
	return m.Synthetic
}

func (m MessageBase) Serialize(content string) string {
	return m.Timestamp.Format("02/01 15:04:05.000") + "  " + content
}

func (m MessageBase) Date() time.Time {
	return m.Timestamp
}

func (m MessageBase) Activity() map[guid.GUID]ActivityEventType {
	return m.activity
}

func (m *MessageBase) ResetActivity() {
	m.activity = nil
}

func (m *MessageBase) AddActivity(id guid.GUID, eventType ActivityEventType) {
	if m == nil {
		return
	}
	if m.activity == nil {
		m.activity = make(map[guid.GUID]ActivityEventType)
	}
	if eventType == ActivityBump {
		if _, ok := m.activity[id]; ok {
			return
		}
	}
	m.activity[id] = eventType
}

type SkippedMessage struct {
	MessageBase
	Reason string
}

func (SkippedMessage) Affects() []guid.GUID { return nil }
func (*SkippedMessage) isMessage()          {}

func Skip(ts time.Time, reason string) []Message {
	return set(&SkippedMessage{
		MessageBase: Base(ts),
		Reason:      reason,
	})
}

func (m SkippedMessage) String() string {
	return "SkippedMessage: " + m.Reason
}

type UnparsedLine struct {
	MessageBase
	Content string
}

func (UnparsedLine) Affects() []guid.GUID { return nil }
func (*UnparsedLine) isMessage()          {}

func Unparsed(ts time.Time, content string) []Message {
	return set(&UnparsedLine{
		MessageBase: Base(ts),
		Content:     content,
	})
}

func NotHandled() ([]Message, error) {
	return nil, nil
}

func set(m ...Message) []Message {
	return m
}

// LegacyCast comes from non CAST: v2 messages. This is included because
// SuperWoWLogger removed v2 casts from raw logs. So sometimes the v1 style casts
// are all we have.
type LegacyCast struct {
	MessageBase
	Caster guid.GUID
	Target *guid.GUID
	Spell  string
}

func (c LegacyCast) Affects() []guid.GUID {
	if c.Target == nil {
		return []guid.GUID{c.Caster}
	}
	return []guid.GUID{c.Caster, *c.Target}
}
func (*LegacyCast) isMessage() {}

// Deprecated: Cast is the legacy cast message from the CAST: v2 log format.
// New code should use SpellGo, which carries richer spell data (*chrondbc.Spell)
// and uses bare guid.GUID fields instead of types.Unit wrappers.
// Cast is retained for backward compatibility with older log formats.
type Cast struct {
	castv2.CastV2
	MessageBase
}

func (c Cast) Affects() []guid.GUID {
	if c.Target == nil {
		return []guid.GUID{c.Caster.Gid}
	}
	return []guid.GUID{c.Caster.Gid, c.Target.Gid}
}
func (*Cast) isMessage() {}

type Unit struct {
	MessageBase
	unitinfo.Info
}

func (u Unit) Affects() []guid.GUID { return []guid.GUID{u.Guid} }
func (*Unit) isMessage()            {}

type Combatant struct {
	MessageBase
	combatant.Combatant
}

func (c Combatant) Affects() []guid.GUID { return []guid.GUID{c.Guid} }
func (*Combatant) isMessage()            {}

type Transmog struct {
	MessageBase
	PlayerName string
	Transmogs  []combatant.Transmog
}

func (c Transmog) Affects() []guid.GUID { return []guid.GUID{} }
func (*Transmog) isMessage()            {}

// CombatantTalents is emitted from COMBATANT_TALENTS log lines.
// It carries detailed talent tab info (with tab names) for a player.
type CombatantTalents struct {
	MessageBase
	Guid       guid.GUID
	PlayerName string
	Tabs       [3]CombatantTalentTab
}

type CombatantTalentTab struct {
	TabName     string
	PointsSpent int
	RankDigits  string
}

func (c CombatantTalents) Affects() []guid.GUID { return []guid.GUID{c.Guid} }
func (*CombatantTalents) isMessage()            {}

type Realm struct {
	MessageBase
	realm.Info
}

func (u Realm) Affects() []guid.GUID { return []guid.GUID{} }
func (*Realm) isMessage()            {}

type Versions struct {
	MessageBase
	Player   *guid.GUID
	Versions map[string]string
}

func (v Versions) Affects() []guid.GUID { return []guid.GUID{} }
func (*Versions) isMessage()            {}

type UnitDied struct {
	MessageBase
	unitdied.Info
}

func (u UnitDied) Affects() []guid.GUID { return []guid.GUID{u.ID} }
func (*UnitDied) isMessage()            {}

type PlayerPosition struct {
	MessageBase
	playerposition.PlayerPosition
}

func (u PlayerPosition) Affects() []guid.GUID { return []guid.GUID{} }
func (*PlayerPosition) isMessage()            {}

type Zone struct {
	MessageBase
	zone.Zone
}

func (z Zone) Affects() []guid.GUID { return nil }
func (*Zone) isMessage()            {}

type CombatCount struct {
	MessageBase
	combatcount.Count
}

func (c CombatCount) Affects() []guid.GUID { return []guid.GUID{} }
func (*CombatCount) isMessage()            {}

type Clock struct {
	MessageBase
	realmclock.Info
}

func (c Clock) Affects() []guid.GUID { return []guid.GUID{} }
func (*Clock) isMessage()            {}

type ResourceChange struct {
	MessageBase
	Target       guid.GUID
	Amount       int32
	OverResource int32
	Resource     types.Resource
	Caster       *guid.GUID
	SpellName    *string
	SpellData    *chrondbc.Spell
	// 10/29 22:12:55.926  Naga (Kryaa) gains 35 Happiness from Kryaa 's Feed Pet Effect.
	// 10/17 21:36:12.823  Sfantu 's Nosferatu loses 52 happiness.
	Direction types.ChangeDirection
}

func (r ResourceChange) Affects() []guid.GUID {
	ids := []guid.GUID{r.Target}
	if r.Caster != nil {
		ids = append(ids, *r.Caster)
	}
	return ids
}
func (*ResourceChange) isMessage() {}

type Damage struct {
	MessageBase
	// SpellName is nil for things like environmental and melee damage
	SpellName *string
	SpellData *chrondbc.Spell
	Caster    *guid.GUID
	Target    guid.GUID
	HitType   types.HitType
	Amount    int32
	Overkill  int32
	School    types.School
	Trailer   types.Trailer
	// EnvironmentType is only set when the hit type is environmental.
	// It adds some context, but not strictly necessary.
	EnvironmentType *types.EnvironmentType
}

// RequiresActive indicates this damage could only have been applied by an active
// unit.
func (d Damage) RequiresActive() bool {
	if d.SpellData == nil {
		return !d.HitType.Has(types.HitTypePeriodic)
	}

	spd := d.SpellData.SpellDamageType()
	if spd.Has(chrondbc.SpellDamageNoEngageCombat) {
		return false
	}

	if spd.Has(chrondbc.SpellDamagePeriodic) &&
		(d.HitType.Has(types.HitTypeFullResist) ||
			d.HitType.Has(types.HitTypeImmune) ||
			d.HitType.Has(types.HitTypeFullAbsorb)) {
		// Periodic damage can "miss" and should not be counted as active.
		return false
	}

	if d.SpellData.Attrs.Has(chrondbc.AttrEx_ChannelTrackTarget) ||
		d.SpellData.Attrs.Has(chrondbc.AttrEx_Channeled1) {
		return true
	}

	if !d.HitType.Has(types.HitTypePeriodic) {
		return true
	}

	return false
}

func (d Damage) SourceName() string {
	if d.SpellName != nil {
		return *d.SpellName
	}

	if d.EnvironmentType != nil {
		return d.EnvironmentType.String()
	}

	return "Auto Attack"
}

func (d Damage) Affects() []guid.GUID {
	ids := []guid.GUID{d.Target}
	if d.Caster != nil {
		ids = append(ids, *d.Caster)
	}
	return ids
}
func (*Damage) isMessage() {}

type Heal struct {
	MessageBase
	Caster    guid.GUID
	Target    guid.GUID
	SpellName string
	SpellData *chrondbc.Spell
	Amount    int32
	Overheal  int32
	Absorbed  int32
	HitType   types.HitType
	School    types.School
}

func (h Heal) Affects() []guid.GUID { return []guid.GUID{h.Caster, h.Target} }
func (*Heal) isMessage()            {}

type Slain struct {
	MessageBase
	Victim guid.GUID
	Killer *guid.GUID

	// Attribution is synthetic and not always present.
	// It is the cause of the death
	Attribution Message `json:"-"`
}

func (s Slain) Affects() []guid.GUID {
	ids := []guid.GUID{s.Victim}
	if s.Killer != nil {
		ids = append(ids, *s.Killer)
	}
	return ids
}
func (*Slain) isMessage() {}

//type AuraCast struct {
//	MessageBase
//	Caster          guid.GUID
//	Target          guid.GUID
//	EffectID        chrondbc.SpellID
//	EffectAuraName  string
//	EffectAmplitude int32
//	EffectMiscValue int32
//	DurationMS      int32
//	AuraCapStatus   int32
//}

type AuraCast struct {
	MessageBase
	Spell           *chrondbc.Spell
	Caster          guid.GUID
	Target          *guid.GUID
	Effect          chrondbc.Effect
	Amplitude       int32 // ms how often it ticks
	EffectAuraName  chrondbc.AuraEffect
	DurationMS      int32
	AuraCapStatus   int32 // 1 for buffs full, 2 for debuffs full, 3 for both
	EffectMiscValue int32
}

func (a AuraCast) Affects() []guid.GUID {
	if a.Target == nil {
		return []guid.GUID{a.Caster}
	}
	return []guid.GUID{a.Caster, *a.Target}
}
func (*AuraCast) isMessage() {}

type Aura struct {
	MessageBase
	// IsBuff is false if it is a debuff
	IsBuff bool
	// Source is who applied the aura. Nil when unknown (e.g. vanilla parser
	// logs that don't carry source information for aura events).
	Source    *guid.GUID
	Target    guid.GUID
	SpellName string
	SpellData *chrondbc.Spell
	// Amount is the current stacks
	Amount int32
	// Application
	// Deprecated: Use State
	Application types.AuraApplication
	State       types.AuraState
}

func (a Aura) Affects() []guid.GUID {
	if a.Source != nil {
		return []guid.GUID{*a.Source, a.Target}
	}
	return []guid.GUID{a.Target}
}
func (*Aura) isMessage() {}

type Interrupt struct {
	MessageBase
	Caster guid.GUID
	Target guid.GUID
	// SpellName is the spell that was interrupted
	SpellName    string
	ExtraSpellID int32
	ExtraSchool  types.School

	// InterruptSpell is the spell used to interrupt (e.g. Kick, Counterspell).
	// Populated by the AzerothCore parser; nil for vanilla/WotLK parsed events.
	InterruptSpell *chrondbc.Spell
	// InterruptedSpell is the spell that was being cast and got interrupted.
	// Populated by the AzerothCore parser; nil for vanilla/WotLK parsed events.
	InterruptedSpell *chrondbc.Spell
}

func (i Interrupt) Affects() []guid.GUID { return []guid.GUID{i.Caster, i.Target} }
func (*Interrupt) isMessage()            {}

type Create struct {
	MessageBase
	Caster  guid.GUID
	Created string
}

func (c Create) Affects() []guid.GUID { return []guid.GUID{c.Caster} }
func (*Create) isMessage()            {}

type SpellFail struct {
	MessageBase
	SpellData      *chrondbc.Spell
	Caster         guid.GUID
	FailedByServer bool
}

func (c SpellFail) Affects() []guid.GUID {
	return []guid.GUID{c.Caster}
}
func (*SpellFail) isMessage() {}

type SpellStart struct {
	MessageBase
	ItemID          *int32
	SpellData       *chrondbc.Spell
	Caster          guid.GUID
	Target          *guid.GUID
	Flags           types.CastFlags
	CastTime        time.Duration
	ChannelDuration time.Duration
	SpellType       int32
}

func (c SpellStart) Affects() []guid.GUID {
	ids := []guid.GUID{c.Caster}
	if c.Target != nil {
		ids = append(ids, *c.Target)
	}

	return ids
}
func (*SpellStart) isMessage() {}

// SpellGo is fired when a spell goes off.
type SpellGo struct {
	MessageBase
	// Item is set if triggered by an item, otherwise nil.
	ItemID           *int32
	SpellData        *chrondbc.Spell
	Caster           guid.GUID
	Target           *guid.GUID
	Flags            types.CastFlags
	NumTargetsHit    int32
	NumTargetsMissed int32
	CorpseOwner      *guid.GUID
}

func (c SpellGo) Affects() []guid.GUID {
	if c.Target == nil && c.CorpseOwner == nil {
		return []guid.GUID{c.Caster}
	}
	ids := []guid.GUID{c.Caster}
	if c.Target != nil {
		ids = append(ids, *c.Target)
	}
	if c.CorpseOwner != nil {
		ids = append(ids, *c.CorpseOwner)
	}
	return ids
}
func (*SpellGo) isMessage() {}

type Resurrection struct {
	MessageBase
	Source guid.GUID
	Target guid.GUID
	Spell  *chrondbc.Spell
}

func (r Resurrection) Affects() []guid.GUID { return []guid.GUID{r.Source, r.Target} }
func (*Resurrection) isMessage()            {}

// ExtraAttack is a bit strange, but it's a unique message that triggers when extra
// white attacks are granted via some proc.
type ExtraAttack struct {
	MessageBase
	Caster guid.GUID
	Amount int32
	Spell  *chrondbc.Spell
	// FromSpellName is deprecated
	FromSpellName string
}

func (e ExtraAttack) Affects() []guid.GUID { return []guid.GUID{e.Caster} }
func (*ExtraAttack) isMessage()            {}

type Timeout struct {
	MessageBase
}

func TimedOut(ts time.Time) Message {
	return &Timeout{
		MessageBase: Base(ts, WithSynthetic()),
	}
}

func (t Timeout) Affects() []guid.GUID { return []guid.GUID{} }
func (*Timeout) isMessage()            {}

// NewOwner can be used to change the owner of a given unit.
// Useful for enslave demon
type NewOwner struct {
	MessageBase
	Target   guid.GUID
	NewOwner guid.GUID
}

func (t NewOwner) Affects() []guid.GUID { return []guid.GUID{t.NewOwner, t.Target} }
func (*NewOwner) isMessage()            {}

// PossessionChange represents a temporary control effect starting or ending.
// Unlike NewOwner (permanent ownership), this tracks temporal effects like Mind Control.
type PossessionChange struct {
	MessageBase
	Target     guid.GUID
	Controller guid.GUID
	Spell      *chrondbc.Spell
	Gained     bool // true = possessed, false = released
	// Duration is the max duration.
	Duration time.Duration // from AuraCast.DurationMS; 0 = unknown
}

func (t PossessionChange) Affects() []guid.GUID { return []guid.GUID{t.Controller, t.Target} }
func (*PossessionChange) isMessage()            {}

// UnitClassificationEvent is a synthetic event injected during encounter processing
// to communicate affiliation/possession state changes to the frontend.
type UnitClassificationEvent struct {
	MessageBase
	Target      guid.GUID
	UnitType    types.UnitType
	Affiliation types.Affiliation
	Owner       *guid.GUID      // permanent owner (pet/totem)
	Controller  *guid.GUID      // possession controller (nil if not possessed)
	Spell       *chrondbc.Spell // possession spell (nil if not possessed)
}

func (u *UnitClassificationEvent) Affects() []guid.GUID { return []guid.GUID{u.Target} }
func (*UnitClassificationEvent) isMessage()             {}

type Dispel struct {
	MessageBase
	Caster guid.GUID
	Target guid.GUID
	Spell  *chrondbc.Spell
}

func (d Dispel) Affects() []guid.GUID { return []guid.GUID{d.Caster, d.Target} }
func (*Dispel) isMessage()            {}

type Loot struct {
	MessageBase
	PlayerName   string
	ItemName     string
	ItemID       int32
	ItemSuffixID int32
	Quantity     int32
}

func (l Loot) Affects() []guid.GUID { return []guid.GUID{} }
func (*Loot) isMessage()            {}

type LootTrade struct {
	MessageBase
	FromPlayerName string
	ToPlayerName   string
	ItemName       string
	ItemID         int32 // Item ID (populated by companion addon)
}

func (l LootTrade) Affects() []guid.GUID { return []guid.GUID{} }
func (*LootTrade) isMessage()            {}

// UnitEvade is emitted when a creature enters evade mode (resets aggro/returns home).
type UnitEvade struct {
	MessageBase
	UnitGUID guid.GUID
	UnitName string
	Reason   uint8 // AzerothCore EvadeReason: 0=Other, 1=Boundary, 2=NoHostiles, 3=SequenceBreak, 4=NoPath
}

func (u UnitEvade) Affects() []guid.GUID { return []guid.GUID{u.UnitGUID} }
func (*UnitEvade) isMessage()            {}

// UnitCombatEnter is emitted when a unit enters combat with another unit.
type UnitCombatEnter struct {
	MessageBase
	UnitGUID  guid.GUID
	UnitName  string
	OtherGUID guid.GUID
	OtherName string
}

func (u UnitCombatEnter) Affects() []guid.GUID { return []guid.GUID{u.UnitGUID, u.OtherGUID} }
func (*UnitCombatEnter) isMessage()            {}

// EncounterCredit is emitted when the server grants encounter credit for a boss kill.
type EncounterCredit struct {
	MessageBase
	UnitGUID guid.GUID
	UnitName string
}

func (e EncounterCredit) Affects() []guid.GUID { return []guid.GUID{e.UnitGUID} }
func (*EncounterCredit) isMessage()            {}

// Absorbed records which absorb aura soaked how much of an
// incoming damage event. Fires once per absorb aura per hit.
type Absorbed struct {
	MessageBase
	Attacker guid.GUID
	Target   guid.GUID
	// DamageSpell is nil for melee (swing) damage.
	DamageSpell  *chrondbc.Spell
	Caster       guid.GUID
	AbsorbSpell  *chrondbc.Spell
	AbsorbSchool types.School
	Amount       int32
}

func (s Absorbed) Affects() []guid.GUID {
	return []guid.GUID{s.Attacker, s.Target, s.Caster}
}
func (*Absorbed) isMessage() {}

// CompanionStats carries relay health diagnostics from the ChronicleCompanionWoTLK addon.
// Dirty is the total number of pending (unsent) segments across all providers.
// Each bucket represents landed chunk counts for a one-minute window
// (index 0 = current minute, index 9 = 9 minutes ago).
type CompanionStats struct {
	MessageBase
	Dirty   int
	Buckets [10]int
}

func (CompanionStats) Affects() []guid.GUID { return nil }
func (*CompanionStats) isMessage()          {}
