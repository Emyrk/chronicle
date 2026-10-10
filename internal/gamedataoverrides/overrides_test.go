package gamedataoverrides

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/stretchr/testify/require"
)

func TestApplySpell(t *testing.T) {
	t.Parallel()

	berserk := &chrondbc.Spell{
		ID:       45708,
		Duration: dbcmem.SpellDuration{ID: 407, Duration: 100, MaxDuration: 100},
	}
	ApplySpell(database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorNightmareOfUrsol,
	}, berserk)
	require.Equal(t, int32(20_000), berserk.Duration.Duration)
	require.Equal(t, int32(20_000), berserk.Duration.MaxDuration)
	require.Equal(t, int32(407), berserk.Duration.ID)

	vanilla := &chrondbc.Spell{
		ID:       45708,
		Duration: dbcmem.SpellDuration{ID: 407, Duration: 100, MaxDuration: 100},
	}
	ApplySpell(database.WoWFlavor{database.FlavorVanilla}, vanilla)
	require.Equal(t, int32(100), vanilla.Duration.MaxDuration)

	otherSpell := &chrondbc.Spell{
		ID:       45709,
		Duration: dbcmem.SpellDuration{ID: 18, Duration: 20_000, MaxDuration: 20_000},
	}
	ApplySpell(database.WoWFlavor{database.FlavorNightmareOfUrsol}, otherSpell)
	require.Equal(t, int32(20_000), otherSpell.Duration.MaxDuration)
}
