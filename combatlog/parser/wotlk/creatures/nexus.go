package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewNexusFriendlyFire(entry uint32, id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewCommonIgnoreFriendlyFire(entry, 26734, 26727, 26746)(id, all)
}

func NewAzureEnforcer(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return NewNexusFriendlyFire(26734, id, all)
}

func NewCrazedManaWraith(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return NewNexusFriendlyFire(26746, id, all)
}

func NewMageHunterAscendant(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return NewNexusFriendlyFire(26727, id, all)
}

func NewCrystallineFrayer(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != 26793 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.WithTimeoutAsDeath()
	c.WithTimeout(time.Second * 5)
	return c, true
}
