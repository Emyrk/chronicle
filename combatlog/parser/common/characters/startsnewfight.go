package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
)

// StartsNewFight wraps a character whose transition to active creates a hard
// encounter boundary. If another fight is active when this character starts,
// the instance finalizes that fight before starting the character's fight.
type StartsNewFight struct {
	CharacterBase
}

func NewStartsNewFight(character CharacterBase) *StartsNewFight {
	return &StartsNewFight{CharacterBase: character}
}

func (*StartsNewFight) SplitActiveFightOnStart() {}

// PhaseDefinitions delegates to the wrapped character so composing this wrapper
// with a phase-aware boss preserves its phase definitions.
func (c *StartsNewFight) PhaseDefinitions() *phases.EncounterPhases {
	if provider, ok := c.CharacterBase.(phases.PhaseProvider); ok {
		return provider.PhaseDefinitions()
	}
	return nil
}
