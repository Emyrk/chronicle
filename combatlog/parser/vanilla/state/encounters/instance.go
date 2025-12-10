package encounters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

// Instance represents a dungeon or raid instance
type Instance interface {
	// Name returns the instance name (e.g., "Scarlet Monastery Cathedral")
	Name() string

	// MatchesZone checks if this instance handles the given zone
	MatchesZone(z zone.Zone) bool

	// Process handles a message for this instance
	Process(m messages.Message) error

	// Encounters returns all possible encounters for this instance
	Encounters() []Encounter

	// CurrentEncounter returns the active encounter, if any
	CurrentEncounter() Encounter

	// AllFights returns all fights across all encounters
	AllFights() []*Fight
}

// BaseInstance provides common functionality for all instances
type BaseInstance struct {
	name       string
	zones      []string
	encounters []Encounter
	fights     *Fights
}

func (b *BaseInstance) Name() string {
	return b.name
}

func (b *BaseInstance) MatchesZone(z zone.Zone) bool {
	for _, zoneName := range b.zones {
		if z.Name == zoneName {
			return true
		}
	}
	return false
}

func (b *BaseInstance) Encounters() []Encounter {
	return b.encounters
}

func (b *BaseInstance) AllFights() []*Fight {
	return b.fights.Fights
}
