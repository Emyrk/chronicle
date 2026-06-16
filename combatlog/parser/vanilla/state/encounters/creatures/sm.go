package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/services"
)

func NewVanillaPlusSMSoul(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if services.ServerName != services.ServerIdentityVanillaPlus {
		return nil, false
	}
	if entry, ok := id.GetEntry(); !ok || entry != 25246 {
		return nil, false
	}

	return characters.NewNeverActive(id), true
}

func NewVanillaPlusSMSoulHunter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if services.ServerName != services.ServerIdentityVanillaPlus {
		return nil, false
	}
	if entry, ok := id.GetEntry(); !ok || entry != 25245 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.WithTimeoutAsDeath()
	c.WithTimeout(time.Second * 30)
	return c, true
}

func NewVanillaPlusBrotherMicheal(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if services.ServerName != services.ServerIdentityVanillaPlus {
		return nil, false
	}
	return characters.NewAdsGoWithBoss(25221, 25245)(id, all)
}
