package participants

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

var _ characters.SetHook = (*Tracker)(nil)

type Tracker struct {
	Active map[guid.GUID]bool
}

func New() *Tracker {
	return &Tracker{
		Active: make(map[guid.GUID]bool),
	}
}

func (t *Tracker) ActivityChange(m messages.Message, chars ...characters.Character) {
	for _, c := range chars {
		if c.IsActive() {
			t.Active[c.ID()] = true
		}
	}
}

func (t *Tracker) CharacterAdded(m messages.Message, chars ...characters.Character) {}
