package vanillaparser

import (
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/types/castv2"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
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
