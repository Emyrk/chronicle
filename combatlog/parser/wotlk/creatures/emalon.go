package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewEmalon(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	switch entry {
	case 33993:
		return characters.NewAdsGoWithBoss(33993, 33998)(id, all)
	case 33994:
		return characters.NewAdsGoWithBoss(33994, 34200)(id, all)
	default:
		return nil, false
	}
}
