package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewMalGanis(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 26533 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	return characters.NewScriptedDefeatCharacter(id, c, characters.ScriptedDefeatConfig{
		PositiveOverkill: true,
		AuraCleanup: characters.AuraCleanupDefeatConfig{
			DistinctAuras: 5,
			BurstWindow:   100 * time.Millisecond,
			DamageWindow:  500 * time.Millisecond,
		},
	}), true
}
