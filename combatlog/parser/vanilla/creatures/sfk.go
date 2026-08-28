package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewHauntingSpirit(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 4958 {
		return nil, false
	}

	c := characters.NewNamedNeverActive(id, all, "Haunting Spirit")

	return c, true
}
