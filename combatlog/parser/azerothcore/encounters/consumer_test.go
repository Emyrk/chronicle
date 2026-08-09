package encounters

import (
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

func TestServerSideKnownInstanceUsesRegistryRankings(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorNightmareOfUrsol,
		database.FlavorOctoWoW,
	}
	ctx := parsectx.With(context.Background(), parsectx.Context{
		Format: database.LogFormatAzerothcoreMod,
		Flavor: flavor,
	})
	logger := slog.Default()
	state := New(ctx, logger, registry.RegistryForFlavor(logger, flavor))

	state.Zone(messages.Zone{Zone: zone.Zone{
		Name:       "Molten Core",
		MapID:      409,
		InstanceID: 123,
	}})

	require.NotNil(t, state.CurrentInstance)
	require.Equal(t, "Molten Core", state.CurrentInstance.Name())

	finalized, err := state.CurrentInstance.Finalize(ctx)
	require.NoError(t, err)
	require.NotNil(t, finalized.RankingRules)
	require.NotNil(t, finalized.RankingRules.Speedrun)
	require.NotNil(t, finalized.Rankings)
	require.NotNil(t, finalized.Rankings.Speedrun)
	require.NotNil(t, finalized.Rankings.DPS)
}

func TestServerSideUnknownInstanceFallsBackToGeneric(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorOctoWoW}
	ctx := parsectx.With(context.Background(), parsectx.Context{
		Format: database.LogFormatAzerothcoreMod,
		Flavor: flavor,
	})
	logger := slog.Default()
	state := New(ctx, logger, registry.RegistryForFlavor(logger, flavor))

	state.Zone(messages.Zone{Zone: zone.Zone{
		Name:       "Unknown OctoWoW Instance",
		MapID:      999999,
		InstanceID: 456,
	}})

	require.NotNil(t, state.CurrentInstance)
	require.Equal(t, "Unknown OctoWoW Instance", state.CurrentInstance.Name())

	finalized, err := state.CurrentInstance.Finalize(ctx)
	require.NoError(t, err)
	require.Nil(t, finalized.RankingRules)
	require.Nil(t, finalized.Rankings)
}
