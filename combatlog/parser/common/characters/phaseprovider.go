package characters

import "github.com/Emyrk/chronicle/combatlog/parser/common/phases"

type phaseProviderCharacter struct {
	Character
	provider phases.PhaseProvider
}

// WrapPhaseProvider preserves the original character's phase definitions on a
// wrapped character without making every instance of that wrapper a provider.
func WrapPhaseProvider(original phases.PhaseProvider, wrapped Character) Character {
	return &phaseProviderCharacter{
		Character: wrapped,
		provider:  original,
	}
}

func (c *phaseProviderCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return c.provider.PhaseDefinitions()
}
