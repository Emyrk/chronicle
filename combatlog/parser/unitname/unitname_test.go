package unitname

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestByGUIDResolvesKnownTrap(t *testing.T) {
	t.Parallel()

	id := guid.GUID(0xF1100283E7000001)
	require.Equal(t, "Explosive Trap", ByGUID(id))
}
