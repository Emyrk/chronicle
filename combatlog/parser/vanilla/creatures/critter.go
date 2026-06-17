package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/critters"
)

var _ characters.Character = (*Critter)(nil)

// Critter should not have any meaningful activity, so this is a no-op implementation.
type Critter struct {
	characters.NeverActive
}

func NewCritterCharacter(id guid.GUID, _ *characters.Characters) (characters.Character, bool) {
	ok := critters.IsCritter(id)
	if !ok {
		return nil, false
	}

	return &Critter{
		characters.NewNeverActive(id),
	}, true
}

func (c Critter) String() string {
	return "critter"
}

func (c Critter) SetPeriodHook(hook period.Hook) {
}
