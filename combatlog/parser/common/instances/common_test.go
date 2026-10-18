package instances

import (
	"testing"

	"github.com/stretchr/testify/require"

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
