package parser

import (
	"fmt"
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

// SpellCastAttempt is a log to indicate a spell attempt has been made.
// The target and result (hit/miss/crit/interrupted) are logged separately.
type SpellCastAttempt struct {
	MessageBase
	Caster    Unit
	SpellName string
}

func (m SpellCastAttempt) String() string {
	return fmt.Sprintf("%s begins to cast %s", m.Caster.Name, m.SpellName)
}

type ResourceChange struct {
	MessageBase
	Target    Unit
	Amount    uint32
	Resource  string
	Caster    Unit
	Spell     string
	Direction string // "gains" or "loses"
}

func (m ResourceChange) String() string {
	return fmt.Sprintf("%s gains %d %s from %s's %s", m.Target.Name, m.Amount, m.Resource, m.Caster.Name, m.Spell)
}

type SpellCast struct {
	Caster    Unit
	Target    *Unit
	SpellName string
	HitMask   string
}

type Unit struct {
	Name string
	// TODO: guid would be preferred
}
