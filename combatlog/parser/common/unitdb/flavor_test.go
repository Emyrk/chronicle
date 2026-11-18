package unitdb_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestUnitsFlavor(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}
	units := unitdb.New(flavor)
	require.Equal(t, flavor, units.Flavor())
	// Unit rules retain their parse's mechanics even if the caller reuses slices.
	flavor[0] = database.FlavorVanilla
	require.Equal(t, database.FlavorWrath, units.Flavor()[0])
	copy := units.Flavor()
	copy[0] = database.FlavorTBC
	require.Equal(t, database.FlavorWrath, units.Flavor()[0])
}
