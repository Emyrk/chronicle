package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const flameLeviathanPostDeathCast = 62400

func NewFlameLeviathan(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || (entry != 34003 && entry != 33113) {
		return nil, false
	}

	return characters.NewAdsGoWithBossCustomCharacter(
		characters.NewIgnoreCastCharacter(
			characters.NewCommonCharacter(id, all),
			flameLeviathanPostDeathCast,
		),
		all,
		entry,
		33236, // Steelforged Defender
		34113, // Steelforged Defender
	), true
}

func NewGeneralVezax(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || (entry != 33449 && entry != 33271) {
		return nil, false
	}

	return characters.NewAdsGoWithBoss(entry,
		33488, // Vapor
		33524, // Animus
	)(id, all)
}
