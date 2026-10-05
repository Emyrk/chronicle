package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewSarthrion(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(
		28860,
		30643, // Lava Blaze
		30449, // Vesperon
		30451, // Shadron
		30452, // Tenebron
	)(id, all)
}
