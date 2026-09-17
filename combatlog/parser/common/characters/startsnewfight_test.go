package characters

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

type phaseAwareCharacter struct {
	*Common
	definitions *phases.EncounterPhases
}

func (c *phaseAwareCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return c.definitions
}

func TestStartsNewFightWrapsCharacterAndPreservesPhases(t *testing.T) {
	t.Parallel()

	all := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	definitions := &phases.EncounterPhases{EncounterName: "Test Boss"}
	base := &phaseAwareCharacter{
		Common:      NewCommonCharacter(guid.GUID(1), all),
		definitions: definitions,
	}

	wrapped := NewStartsNewFight(base)

	require.Same(t, base, wrapped.CharacterBase)
	require.Same(t, definitions, wrapped.PhaseDefinitions())
	require.Implements(t, (*FightStartSplitter)(nil), wrapped)
}
