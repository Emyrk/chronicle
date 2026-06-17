package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

func NewSolnius(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(60748,
		60747, // Erennius goes friendly on Solnius death
	)(id, all)
}
