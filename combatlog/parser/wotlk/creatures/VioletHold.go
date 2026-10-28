package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewVoidSentry(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || !(entry == 29364 || entry == 29365) {
		return nil, false
	}

	return characters.NewNamedNeverActive(id, all, "Void Sentry"), true
}
