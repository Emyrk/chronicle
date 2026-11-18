package encounters_test

import (
	"context"
	"log/slog"
	"testing"

	azencounters "github.com/Emyrk/chronicle/combatlog/parser/azerothcore/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestConsumersRetainFlavor(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{
		{database.FlavorVanilla, database.FlavorTurtle},
		{database.FlavorWrath, database.FlavorAzerothcore},
		{database.FlavorTBC, database.FlavorTBCAnniversary},
	} {
		ctx, logger := context.Background(), slog.Default()
		reg := registry.RegistryForFlavor(logger, flavor)
		require.Equal(t, flavor, encounters.New(ctx, logger, reg).Units.Flavor())
		require.Equal(t, flavor, encounters.NewWithInstanceResolver(ctx, logger, flavor, nil).Units.Flavor())
		require.Equal(t, flavor, azencounters.New(ctx, logger, reg, flavor).Units.Flavor())
		require.Equal(t, flavor, azencounters.New(ctx, logger, nil, flavor).Units.Flavor())
		require.Equal(t, flavor, creatures.New(logger, flavor).Units.Flavor())
	}
}
