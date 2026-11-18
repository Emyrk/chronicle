package encounters

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/google/uuid"
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
	state := New(ctx, logger, registry.RegistryForFlavor(logger, flavor), flavor)

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
	state := New(ctx, logger, registry.RegistryForFlavor(logger, flavor), flavor)

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

func TestServerSideTemplateNamespaces(t *testing.T) {
	t.Parallel()
	boss := identifier.Identity{Boss: true, Name: "Boss", EncounterName: "Boss encounter", Affiliation: types.AffiliationHostile}
	idf := identifier.NewIdentifier(map[uint32]identifier.Identity{100: boss})
	idf.AddObjectEntryId(100, identifier.Identity{Category: unitdb.CategoryEnvironment})
	hook := AzerothCoreInstanceHook{ID: idf}
	object := guid.GUID(0xF110000000000001 | uint64(100)<<24)
	creature := guid.GUID(0xF130000000000001 | uint64(100)<<24)
	vehicle := guid.GUID(0xF150000000000001 | uint64(100)<<24)
	pet := guid.GUID(0xF140000000000001 | uint64(100)<<24)
	require.NoError(t, hook.ProcessMessage(false, uuid.Nil, &messages.Unit{Info: unitinfo.Info{Guid: object, Name: "Fissure"}}))
	require.Equal(t, identifier.Identity{Name: "Fissure", Category: unitdb.CategoryEnvironment}, idf.IdentifyUnit(object))
	require.Equal(t, boss, idf.IdentifyUnit(creature))
	require.NoError(t, hook.ProcessMessage(false, uuid.Nil, &messages.Unit{Info: unitinfo.Info{Guid: pet, Name: "Pet"}}))
	require.Equal(t, boss, idf.IdentifyUnit(creature))
	require.NoError(t, hook.ProcessMessage(false, uuid.Nil, &messages.Unit{Info: unitinfo.Info{Guid: vehicle, Name: "Vehicle", Affiliation: types.AffiliationHostile}}))
	boss.Name = "Vehicle"
	require.Equal(t, boss, idf.IdentifyUnit(creature))
	require.Equal(t, boss, idf.IdentifyUnit(vehicle))
	require.Equal(t, identifier.Identity{Name: "Fissure", Category: unitdb.CategoryEnvironment}, idf.IdentifyUnit(object))
}
