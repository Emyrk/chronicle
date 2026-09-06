package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// NewUnrecognizedPet retains unmatched pets in instance unit metadata without
// allowing them to contribute encounter activity. It must remain after all
// specialized pet factories so known guardians can opt into custom behavior.
func NewUnrecognizedPet(id guid.GUID, _ *characters.Characters) (characters.Character, bool) {
	if !id.IsPet() {
		return nil, false
	}
	return characters.NewPersistedNeverActive(id), true
}
