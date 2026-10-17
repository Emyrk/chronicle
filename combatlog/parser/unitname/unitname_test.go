package unitname

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestCanonicalizeTotemNameRemovesRankSuffix(t *testing.T) {
	t.Parallel()

	id := guid.GUID(0xF130001D01000001)
	require.Equal(t, "Fire Resistance Totem", Canonicalize(id, "Fire Resistance Totem III"))
	require.Equal(t, "Fire Resistance Totem", Canonicalize(id, "Fire Resistance Totem"))
}

func TestByGUIDResolvesKnownTrap(t *testing.T) {
	t.Parallel()

	id := guid.GUID(0xF1100283E7000001)
	require.Equal(t, "Explosive Trap", ByGUID(id))
}
