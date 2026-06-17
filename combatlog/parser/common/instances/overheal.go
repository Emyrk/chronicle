package instances

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/google/uuid"
)

var _ instancehook.Hook = (*Overhealing)(nil)

type Overhealing struct {
	deficits map[guid.GUID]int32
}

func (o *Overhealing) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
  if !active {
		return nil
	}
	switch msg := m.(type) {
	case *messages.Slain:
		// Reset to 0
		delete(o.deficits, msg.Victim)
	case *messages.Damage:
		// Increase target deficit
		o.deficits[msg.Target] += msg.Amount
	case *messages.ResourceChange:
		switch msg.Resource {
		case types.ResourceHealth:
			amount := msg.Amount
			if msg.Direction == types.ChangeDirectionLoss {
				o.deficits[msg.Target] += amount
				return nil
			}
			msg.OverResource = o.heal(msg.Target, amount)
		}
	case *messages.Heal:
		msg.Overheal = o.heal(msg.Target, msg.Amount)
	}
	return nil
}

func (o *Overhealing) heal(target guid.GUID, amount int32) int32 {
	// deficit is how much health the unit is missing
	deficit := o.deficits[target]
	// Effective healing is the minimum of the amount and the current deficit
	effective := min(amount, deficit)
	// Overheal is how much healing exceeds the current deficit
	overheal := amount - effective

	// Should never go below 0
	o.deficits[target] = max(0, deficit-effective)
	return overheal
}

func (o *Overhealing) Finalize(_ context.Context) error {
	o.deficits = make(map[guid.GUID]int32)
	return nil
}

func (o *Overhealing) FightStarted(_ uuid.UUID, _ messages.Message) {
	o.deficits = make(map[guid.GUID]int32)
}

func (o *Overhealing) FightEnded(_ uuid.UUID, _ messages.Message) {
	o.deficits = make(map[guid.GUID]int32)
}
