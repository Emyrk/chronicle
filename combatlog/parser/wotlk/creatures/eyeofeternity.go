package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewMalygos(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 28859 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.SetRecentlySlainDuration(time.Second * 45)
	return c, true
}

func NewPowerSpark(id guid.GUID, _ *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 30084 {
		return nil, false
	}

	// We should track this activity.
	// These sparks commit suicided to place a debuff on casters.
	return characters.NewNeverActive(id), true
}

func NewVortex(id guid.GUID, _ *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 30090 || !id.IsVehicle() {
		return nil, false
	}

	// Vortex is an encounter vehicle used during Malygos phase one. It cannot be
	// killed, so treating its combat-log activity as a hostile leaves completed
	// encounters marked partial with the Vortex remaining.
	return characters.NewNeverActive(id), true
}
