package instances

import (
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

func TestCommonFactoryMatchZoneFallsBackToMapID(t *testing.T) {
	t.Parallel()

	factory := &CommonFactory{
		Name:      "Temple of Ahn'Qiraj",
		ZoneNames: []string{"ahn'qiraj"},
		MapIDs:    []uint32{531},
	}

	require.True(t, factory.MatchZone(zone.Zone{Name: "ahn'qiraj temple", MapID: 531}))
	require.False(t, factory.MatchZone(zone.Zone{Name: "ahn'qiraj temple", MapID: 509}))
	require.True(t, factory.MatchZone(zone.Zone{Name: "ahn'qiraj", MapID: 0}))
}

func TestCommonFactoryInjectsSingleKnownMapID(t *testing.T) {
	t.Parallel()

	factory := &CommonFactory{
		Name:   "Emerald Sanctum",
		MapIDs: []uint32{807},
		Hostiles: func(database.WoWFlavor) *identifier.Identifier {
			return identifier.NewIdentifier(map[uint32]identifier.Identity{})
		},
	}

	instance := factory.New(context.Background(), slog.Default(), unitdb.New(), zone.Zone{Name: "emerald sanctum"}, database.WoWFlavor{})
	require.Equal(t, uint32(807), instance.CurrentZone.MapID)
	require.Equal(t, uint32(807), instance.activeMapID)
}

func TestCommonFactoryDoesNotInjectAmbiguousMapID(t *testing.T) {
	t.Parallel()

	factory := &CommonFactory{
		Name:   "Multi-map Raid",
		MapIDs: []uint32{100, 101},
		Hostiles: func(database.WoWFlavor) *identifier.Identifier {
			return identifier.NewIdentifier(map[uint32]identifier.Identity{})
		},
	}

	instance := factory.New(context.Background(), slog.Default(), unitdb.New(), zone.Zone{Name: "multi-map raid"}, database.WoWFlavor{})
	require.Zero(t, instance.CurrentZone.MapID)
	require.Zero(t, instance.activeMapID)
}

func TestEmeraldSanctumFactoryMapID(t *testing.T) {
	t.Parallel()

	require.Equal(t, []uint32{807}, EmeraldSanctumFactory.MapIDs)
}

func TestWailingCavernsFactoryMatchesMapID(t *testing.T) {
	t.Parallel()

	require.True(t, WailingCavernsFactory.MatchZone(zone.Zone{Name: "unexpected localized name", MapID: 43}))
}

func TestRuinsOfLordaeronFactoryMatchesMapID(t *testing.T) {
	t.Parallel()

	require.True(t, RuinsOfLordaeronFactory.MatchZone(zone.Zone{Name: "unexpected localized name", MapID: 2999}))
}

func TestTempleOfAhnQirajFactoryMatchZoneAliases(t *testing.T) {
	t.Parallel()

	require.True(t, TempleOfAhnQirajFactory.MatchZone(zone.Zone{Name: "temple of ahn'qiraj"}))
	require.True(t, TempleOfAhnQirajFactory.MatchZone(zone.Zone{Name: "ahn'qiraj temple"}))
	require.False(t, TempleOfAhnQirajFactory.MatchZone(zone.Zone{Name: "ruins of ahn'qiraj"}))
}

func TestHeadlessHorsemanIsWrathOnly(t *testing.T) {
	t.Parallel()

	const (
		headlessHorsemanEntry = 23682
		detachedHeadEntry     = 23775
	)

	wrathHostiles := SMGraveyardHostiles(database.WoWFlavor{database.FlavorWrath})
	horseman, ok := wrathHostiles[headlessHorsemanEntry]
	require.True(t, ok)
	require.True(t, horseman.Boss)
	require.Equal(t, "Headless Horseman", horseman.Name)
	require.Equal(t, "Headless Horseman", horseman.EncounterName)
	// The head can disappear repeatedly during one summon. It must not be a
	// hostile character whose inactivity can split the summon into encounters.
	require.NotContains(t, wrathHostiles, detachedHeadEntry)

	vanillaHostiles := SMGraveyardHostiles(database.WoWFlavor{database.FlavorVanilla})
	require.NotContains(t, vanillaHostiles, headlessHorsemanEntry)
}

func TestHeadlessHorsemanDerivedInstanceIsWrathOnly(t *testing.T) {
	t.Parallel()

	wrath := ScarletMonasteryGraveyardFactory.DerivedName(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, []string{"Headless Horseman"}, wrath.Names())

	vanilla := ScarletMonasteryGraveyardFactory.DerivedName(database.WoWFlavor{database.FlavorVanilla})
	require.Nil(t, vanilla)
}
