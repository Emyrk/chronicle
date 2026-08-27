package instances

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestKarazhanAttumenIdentities(t *testing.T) {
	t.Parallel()

	hostiles := KarazhanHostiles()
	for _, entry := range []uint32{15550, 16151, 16152} {
		identity, ok := hostiles[entry]
		require.True(t, ok)
		require.True(t, identity.Boss)
		require.Equal(t, "Attumen the Huntsman", identity.EncounterName)
	}
}
