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

func TestClassicDungeonFactoriesMatchLocalizedZonesByMapID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		factory *CommonFactory
		mapID   uint32
	}{
		{name: "Stormwind Stockade", factory: StockadesFactory, mapID: 34},
		{name: "Deadmines", factory: DeadminesFactory, mapID: 36},
		{name: "Razorfen Kraul", factory: RazorfenKraulFactory, mapID: 47},
		{name: "Sunken Temple", factory: SunkenTempleFactory, mapID: 109},
		{name: "Blackrock Spire", factory: BlackrockSpireFactory, mapID: 229},
		{name: "Scholomance", factory: ScholomanceFactory, mapID: 289},
		{name: "Stratholme", factory: StratholmeFactory, mapID: 329},
		{name: "Ragefire Chasm", factory: RagefireChasmFactory, mapID: 389},
		{name: "Dire Maul", factory: DireMaulFactory, mapID: 429},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.True(t, tt.factory.MatchZone(zone.Zone{Name: "unexpected localized name", MapID: tt.mapID}))
		})
	}
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

func TestExcavationSiteWetlandsFactoryMatchesLocalizedZone(t *testing.T) {
	t.Parallel()

	require.True(t, ExcavationSiteWetlandsFactory.MatchZone(zone.Zone{Name: "挖掘场：湿地", MapID: 2998}))
	// Preserve name-only matching for logs that do not include a map ID.
	require.True(t, ExcavationSiteWetlandsFactory.MatchZone(zone.Zone{Name: "挖掘场：湿地"}))
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

func TestTowerOfKarazhanFactoryMatchZoneAliases(t *testing.T) {
	t.Parallel()

	require.True(t, TowerOfKarazhanFactory.MatchZone(zone.Zone{Name: "tower of karazhan"}))
	require.True(t, TowerOfKarazhanFactory.MatchZone(zone.Zone{Name: "荒芜巨岩"}))
}

func TestTimbermawHoldFactoryMatchZoneAliases(t *testing.T) {
	t.Parallel()

	require.True(t, TimbermawHoldFactory.MatchZone(zone.Zone{Name: "timbermaw hold"}))
	// Older log formats only reported the zone name, so keep name-only matching.
	require.True(t, TimbermawHoldFactory.MatchZone(zone.Zone{Name: "木喉要塞"}))
	require.True(t, TimbermawHoldFactory.MatchZone(zone.Zone{
		Name:         "木喉要塞",
		IsInstance:   true,
		InstanceType: "raid",
	}))
	require.False(t, TimbermawHoldFactory.MatchZone(zone.Zone{
		Name:         "木喉要塞",
		IsInstance:   false,
		InstanceType: "none",
	}))
	require.False(t, TimbermawHoldFactory.MatchZone(zone.Zone{
		Name:         "木喉要塞",
		IsInstance:   true,
		InstanceType: "party",
	}))
	require.False(t, TimbermawHoldFactory.MatchZone(zone.Zone{Name: "荒芜巨岩"}))
}

func TestCathedralMograineAndWhitemaneAreOneEncounter(t *testing.T) {
	t.Parallel()

	hostiles := CathedralHostiles()
	mograine := hostiles[3976]
	whitemane := hostiles[3977]

	require.Equal(t, "Mograine & Whitemane", mograine.EncounterName)
	require.Equal(t, mograine.EncounterName, whitemane.EncounterName)
	require.True(t, mograine.BossDeathDoesNotEndEncounter)
	require.True(t, whitemane.BossDeathDoesNotEndEncounter)
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
