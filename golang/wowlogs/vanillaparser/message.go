package vanillaparser

import (
	"time"
)

type Message interface {
	isMessage()
	Timestamp() time.Time
	String() string
}

type MessageBase struct {
	timestamp time.Time
}

func Base(ts time.Time) MessageBase {
	return MessageBase{
		timestamp: ts,
	}
}

func (MessageBase) isMessage() {}
func (m MessageBase) Timestamp() time.Time {
	return m.timestamp
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
