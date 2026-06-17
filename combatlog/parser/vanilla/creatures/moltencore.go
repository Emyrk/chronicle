package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewRagnarosCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if entry != 11502 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.SetRecentlySlainDuration(time.Second * 15)
	return c, true
}

const (
	sulfuronHarbinger = 12098
	sonOfFlame        = 12143
	lavaSpawn         = 12265
)

func NewSulfuronHarbingerCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(sulfuronHarbinger, sonOfFlame, lavaSpawn)(id, all)
}

const (
	sorcererThane        = 57642
	imageOfSorcererThane = 57643
)

func NewSorcererThaneCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(sorcererThane, imageOfSorcererThane)(id, all)
}

const (
	incindis          = 52145
	spawnOfIncindis   = 52148
	flameskinIncindis = 52149
	eggIncindis       = 52146
)

func NewIncindisCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(incindis, spawnOfIncindis, flameskinIncindis, eggIncindis)(id, all)
}

func NewGolemaggCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(11988,
		// The Core Rager does have a death log in most cases, however apparently not in
		// every case. Their life is tied to Golemagg, so this patch, althought not
		// necessary, is going to be added.
		11672, // Core Rager
	)(id, all)
}
