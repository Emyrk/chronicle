package characters

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestWrapPhaseProvider(t *testing.T) {
	t.Parallel()

	all := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	definitions := &phases.EncounterPhases{EncounterName: "Test Boss"}
	original := &phaseAwareCharacter{
		Common:      NewCommonCharacter(guid.GUID(1), all),
		definitions: definitions,
	}
	ignored := NewIgnoreCastCharacter(original, 123)

	_, ignoreCastProvidesPhases := any(ignored).(phases.PhaseProvider)
	require.False(t, ignoreCastProvidesPhases)

	wrapped := WrapPhaseProvider(original, ignored)
	provider, ok := wrapped.(phases.PhaseProvider)
	require.True(t, ok)
	require.Same(t, definitions, provider.PhaseDefinitions())
}
