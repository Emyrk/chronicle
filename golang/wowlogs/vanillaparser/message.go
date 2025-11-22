package vanillaparser

import (
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/castv2"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
)

type Message interface {
	isMessage()
	Date() time.Time
}

type MessageBase struct {
	Timestamp time.Time `json:"timestamp"`
}

func Base(ts time.Time) MessageBase {
	return MessageBase{
		Timestamp: ts,
	}
}

func (m MessageBase) String(content string) string {
	return m.Timestamp.Format("02/01 15:04:05.000") + "  " + content
}
func (MessageBase) isMessage() {}

func (m MessageBase) Date() time.Time {
	return m.Timestamp
}

type SkippedMessage struct {
	MessageBase
	Reason string
}

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

func Unparsed(ts time.Time, content string) []Message {
	return set(&UnparsedLine{
		MessageBase: Base(ts),
		Content:     content,
	})
}

func notHandled() ([]Message, error) {
	return nil, nil
}

func set(m ...Message) []Message {
	return m
}

type Cast struct {
	castv2.CastV2
	MessageBase
}

type Combatant struct {
	combatant.Combatant
	MessageBase
}

type Zone struct {
	MessageBase
	zone.Zone
}

type ResourceChange struct {
	MessageBase
	Target    guid.GUID
	Amount    int32
	Resource  types.Resource
	Caster    *guid.GUID
	SpellName *string
	// 10/29 22:12:55.926  Naga (Kryaa) gains 35 Happiness from Kryaa 's Feed Pet Effect.
	// 10/17 21:36:12.823  Sfantu 's Nosferatu loses 52 happiness.
	Direction string // "gains" or "loses"
}

type SpellDamage struct {
	MessageBase
	Caster    guid.GUID
	SpellName string
	HitType   types.HitType
	Target    guid.GUID
	Amount    int32
	Trailer   types.Trailer
	School    types.School
}

type PeriodicDamage struct {
	MessageBase
	Caster    guid.GUID
	Target    guid.GUID
	Amount    int32
	School    types.School
	SpellName string
	Trailer   types.Trailer
}

type Damage struct {
	MessageBase
	Caster  guid.GUID
	Target  guid.GUID
	HitType types.HitType
	Amount  int32
	School  types.School
	Trailer types.Trailer
}

type Heal struct {
	MessageBase
	Caster    guid.GUID
	Target    guid.GUID
	SpellName string
	Amount    int32
	HitType   types.HitType
}

type Slain struct {
	MessageBase
	Victim guid.GUID
	Killer *guid.GUID
}
