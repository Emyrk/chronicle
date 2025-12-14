package characterv1

import (
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

type characterFactory func(id guid.GUID, chars *Characters) (Character, bool)

var characterFactories = []characterFactory{
	NewTotemCharacter,
}

type Character interface {
	ID() guid.GUID
	String() string
	// TODO: Remove named string?
	NamedString(name string) string
	Process(m messages.Message) error
	Periods() []Active
}

const (
	ReasonTimeout    = "timeout"
	ReasonSlain      = "slain"
	ReasonOwnerSlain = "owner_slain"
)

type Characters struct {
	All map[guid.GUID]Character
	db  *unitdb.Units
}

func NewCharacters(db *unitdb.Units) *Characters {
	return &Characters{
		db:  db,
		All: make(map[guid.GUID]Character),
	}
}

func (c Characters) AddAll(ids ...guid.GUID) {
	for _, id := range ids {
		c.Add(id)
	}
}

func (c Characters) Add(id guid.GUID) Character {
	char, exists := c.All[id]
	if !exists {
		for _, factory := range characterFactories {
			if specialChar, ok := factory(id, &c); ok {
				char = specialChar
				break
			}
		}

		if char == nil {
			// Just assume they are a normal character then
			char = NewCommonCharacter(id, &c)
		}

		c.All[id] = char
	}
	return char
}

// TODO: Maybe a "synthetic" boolean should exist on message base. This would
// allow inserting custom messages for totems/pets that indicate their death/recall.
// This would have to be returned here to be added to the message stream.
// Idk how feasible that is though. Maybe the original processor can handle this
// for general types.
func (c Characters) Process(m messages.Message) error {
	// Add all affected characters to the instance's character list
	c.AddAll(m.Affects()...)

	for _, char := range c.All {
		// TODO: Dead characters that will never return should be removed from processing?
		// Or at least have some kind of speedup
		err := char.Process(m)
		if err != nil {
			return fmt.Errorf("processing character %s: %w", char.ID().String(), err)
		}
	}
	return nil
}
