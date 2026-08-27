package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

type Onyxia struct {
	*characters.Common
}

func NewOnyxiaCharacter(flavor database.WoWFlavor) func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
		entry, ok := id.GetEntry()
		if !ok {
			return nil, false
		}

		if entry != 10184 {
			return nil, false
		}

		c := &Onyxia{
			Common: characters.NewCommonCharacter(id, all),
		}

		if flavor.Has(database.FlavorNightmareOfUrsol) {
			return characters.NewAdsGoWithBossCustomCharacter(c, all, 10184,
				11262, // Whelp
			), true
		}

		return c, true
	}
}

func NewBroodcommanderAxelusCharacter(flavor database.WoWFlavor) func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !flavor.Has(database.FlavorNightmareOfUrsol) {
		return func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
			return nil, false
		}
	}

	return func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
		return characters.NewAdsGoWithBoss(49018,
			40068, // Warder
			12129, // Warder
		)(id, all)
	}
}
