package creatures

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestNewVortexNeverBecomesActive(t *testing.T) {
	t.Parallel()

	vortexGUID := guid.GUID(0xF150000000000001 | uint64(30090)<<24)
	vortex, ok := NewVortex(vortexGUID, nil)
	require.True(t, ok)
	require.Equal(t, vortexGUID, vortex.ID())
	require.False(t, vortex.IsActive())
	require.Empty(t, vortex.Periods())
}

func TestNewVortexRejectsInvalidGUIDs(t *testing.T) {
	t.Parallel()

	for _, id := range []guid.GUID{
		guid.GUID(0xF130000000000001 | uint64(28859)<<24), // Other entry.
		guid.GUID(0xF130000000000001 | uint64(30090)<<24), // Vortex entry with creature type.
	} {
		vortex, ok := NewVortex(id, nil)
		require.False(t, ok)
		require.Nil(t, vortex)
	}
}
