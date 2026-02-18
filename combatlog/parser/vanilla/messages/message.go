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
)

func ToString(msg Message) string {
	return fmt.Sprintf("[%T] %s", msg, msg.Date().Format("15:04:05.000"))
}

type Message interface {
	isMessage()
	Date() time.Time
	Affects() []guid.GUID
	IsSynthetic() bool
}

type MessageBase struct {
	Timestamp time.Time `json:"timestamp"`
	Synthetic bool      `json:"synthetic,omitempty"`
}

func WithSynthetic() func(*MessageBase) {
	return func(mb *MessageBase) {
		mb.Synthetic = true
	}
}

func Base(ts time.Time, opts ...func(m *MessageBase)) MessageBase {
	b := MessageBase{
		Timestamp: ts,
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
func (*UnparsedLine) isMessage()           {}

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
func (*Combatant) isMessage()             {}

type Realm struct {
	MessageBase
	realm.Info
}

func (u Realm) Affects() []guid.GUID { return []guid.GUID{} }
func (*Realm) isMessage()            {}

type UnitDied struct {
	MessageBase
	unitdied.Info
}

func (u UnitDied) Affects() []guid.GUID { return []guid.GUID{u.ID} }
func (*UnitDied) isMessage()             {}

type PlayerPosition struct {
	MessageBase
	playerposition.PlayerPosition
}

func (u PlayerPosition) Affects() []guid.GUID { return []guid.GUID{} }
func (*PlayerPosition) isMessage()             {}

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
func (*CombatCount) isMessage()             {}

type Clock struct {
	MessageBase
	realmclock.Info
}

func (c Clock) Affects() []guid.GUID { return []guid.GUID{} }
func (*Clock) isMessage()            {}

type ResourceChange struct {
	MessageBase
	Target    guid.GUID
	Amount    int32
	Resource  types.Resource
	Caster    *guid.GUID
	SpellName *string
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
	Caster    *guid.GUID
	Target    guid.GUID
	HitType   types.HitType
	Amount    int32
	School    types.School
	Trailer   types.Trailer
	// EnvironmentType is only set when the hit type is environmental.
	// It adds some context, but not strictly necessary.
	EnvironmentType *types.EnvironmentType
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
	Amount    int32
	HitType   types.HitType
}

func (h Heal) Affects() []guid.GUID { return []guid.GUID{h.Caster, h.Target} }
func (*Heal) isMessage()            {}

type Slain struct {
	MessageBase
	Victim guid.GUID
	Killer *guid.GUID

	// Attribution is synthetic and not always present.
	// It is the cause of the death
	Attribution Message
}

func (s Slain) Affects() []guid.GUID {
	ids := []guid.GUID{s.Victim}
	if s.Killer != nil {
		ids = append(ids, *s.Killer)
	}
	return ids
}
func (*Slain) isMessage() {}

type Aura struct {
	MessageBase
	Target      guid.GUID
	SpellName   string
	Amount      int32
	Application types.AuraApplication
}

func (a Aura) Affects() []guid.GUID { return []guid.GUID{a.Target} }
func (*Aura) isMessage()            {}

type Interrupt struct {
	MessageBase
	Caster guid.GUID
	// SpellName is the spell that was interrupted
	SpellName string
	Target    guid.GUID
}

func (i Interrupt) Affects() []guid.GUID { return []guid.GUID{i.Caster, i.Target} }
func (*Interrupt) isMessage()             {}

type Create struct {
	MessageBase
	Caster  guid.GUID
	Created string
}

func (c Create) Affects() []guid.GUID { return []guid.GUID{c.Caster} }
func (*Create) isMessage()            {}

// ExtraAttack is a bit strange, but it's a unique message that triggers when extra
// white attacks are granted via some proc.
type ExtraAttack struct {
	MessageBase
	Caster        guid.GUID
	Amount        int32
	FromSpellName string
}

func (e ExtraAttack) Affects() []guid.GUID { return []guid.GUID{e.Caster} }
func (*ExtraAttack) isMessage()             {}

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
