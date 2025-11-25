package state

import (
	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
)

type Combatants struct {
	Parent *Combatants
	// Participants is a map of guids to combatants we've seen. It will always be
	// updated with the last seen combatant for that guid.
	//
	// If the combatant has changed (like gear or w/e), that info needs to be captured
	// in the time bound data.
	Participants map[guid.GUID]combatant.Combatant
}

func NewCombatants(parent *Combatants) *Combatants {
	return &Combatants{
		Parent:       parent,
		Participants: make(map[guid.GUID]combatant.Combatant),
	}
}

func (c *Combatants) Seen(combatant combatant.Combatant) {
	if c == nil {
		return
	}

	if combatant.Guid.IsZero() {
		return
	}

	c.Participants[combatant.Guid] = combatant
	c.Parent.Seen(combatant)
}
