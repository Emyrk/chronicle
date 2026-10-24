package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewFlameLeviathan(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || (entry != 34003 && entry != 33113) {
		return nil, false
	}

	return characters.NewAdsGoWithBossCustomCharacter(
		characters.NewCommonCharacter(id, all),
		all,
		entry,
		33236, // Steelforged Defender
		34113, // Steelforged Defender
	), true
}
