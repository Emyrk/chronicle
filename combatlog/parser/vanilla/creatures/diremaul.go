package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

func NewImmolthar(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(11496,
		14399, // Arcane Torrent
		14396, // Eye of Immol'thar
	)(id, all)
}

func NewKingGordok(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(11501, // King Gordok
		14324, // Observer
	)(id, all)
}

// These eyes can just despawn
func EyeofImmolthar(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != 14396 {
		return nil, false
	}
	eyeOfImmolthar := characters.NewCommonCharacter(id, all)
	eyeOfImmolthar.WithTimeoutAsDeath()
	eyeOfImmolthar.WithTimeout(time.Second * 5)
	return eyeOfImmolthar, true
}
