package chrondbc

import (
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/stretchr/testify/require"
)

func TestAzerothCoreFallbackRegistered(t *testing.T) {
	t.Parallel()

	require.NotEmpty(t, dbcmem.SpellIcons)
	require.NotEmpty(t, dbcmem.SpellDurations)
	require.NotEmpty(t, dbcmem.PeriodicSpells)
}
