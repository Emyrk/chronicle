package armory

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestRawMetadataObservations(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	level := int32(60)
	faction := types.HeroFactionAlliance
	known := combatant.Combatant{
		Guid: guid.GUID(10), Seen: at, Name: "Player", HeroClass: types.HeroClassesWARRIOR,
		Race: types.HeroRacesHuman, Gender: types.HeroGenderMale, Faction: &faction,
		Level: &level, Guild: &combatant.Guild{Name: "Guild"},
	}
	for _, empty := range []bool{false, true} {
		t.Run(map[bool]string{false: "sentinels", true: "empty"}[empty], func(t *testing.T) {
			t.Parallel()
			tracker := New(nil)
			tracker.Player(&messages.Combatant{Combatant: known})
			clocks := tracker.playerObservations(known)
			require.True(t, clocks.Name.Valid)
			require.Equal(t, clocks.Name, clocks.Class)
			require.Equal(t, clocks.Name, clocks.Race)
			require.Equal(t, clocks.Name, clocks.Gender)
			require.Equal(t, clocks.Name, clocks.Faction)
			require.Equal(t, clocks.Name, clocks.Level)
			require.Equal(t, clocks.Name, clocks.Guild)

			unknown := combatant.Combatant{Guid: known.Guid, Seen: at.Add(time.Hour)}
			if !empty {
				zero := int32(0)
				unknown.Name = "Unknown"
				unknown.HeroClass = types.HeroClassesUNKNOWN
				unknown.Race = types.HeroRacesUnknown
				unknown.Gender = types.HeroGenderUnknown
				unknown.Level = &zero
			}
			tracker.Player(&messages.Combatant{Combatant: unknown})
			require.Equal(t, clocks, tracker.playerObservations(known))
			want := known
			want.Seen = unknown.Seen
			require.Equal(t, want, tracker.Players[known.Guid])

			unchanged := known
			unchanged.Seen = at.Add(2 * time.Hour)
			tracker.Player(&messages.Combatant{Combatant: unchanged})
			updated := tracker.playerObservations(known)
			stamp := database.Timestamptz(unchanged.Seen)
			require.Equal(t, metadataObservations{Name: stamp, Class: stamp, Race: stamp, Gender: stamp, Faction: stamp, Level: stamp, Guild: stamp}, updated)

			older := known
			older.Seen = at.Add(-time.Hour)
			older.Name = "Old"
			older.HeroClass = types.HeroClassesMAGE
			older.Race = types.HeroRacesOrc
			older.Gender = types.HeroGenderFemale
			horde := types.HeroFactionHorde
			older.Faction = &horde
			low := int32(1)
			older.Level = &low
			older.Guild = &combatant.Guild{Name: "Old guild"}
			tracker.Player(&messages.Combatant{Combatant: older})
			require.Equal(t, updated, tracker.playerObservations(known))
			want.Seen = older.Seen // Seen still describes the snapshot, not each metadata field.
			require.Equal(t, want, tracker.Players[known.Guid])
		})
	}
}

func TestGuildObservationNilVersusGuildless(t *testing.T) {
	t.Parallel()
	tracker := New(nil)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	player := combatant.Combatant{Guid: guid.GUID(10), Seen: at}
	tracker.Player(&messages.Combatant{Combatant: player})
	require.False(t, tracker.playerObservations(player).Guild.Valid)
	player.Guild = &combatant.Guild{Name: ""}
	player.Seen = at.Add(time.Hour)
	tracker.Player(&messages.Combatant{Combatant: player})
	require.Equal(t, database.Timestamptz(player.Seen), tracker.playerObservations(player).Guild)
	player.Guild = nil
	player.Seen = at.Add(2 * time.Hour)
	tracker.Player(&messages.Combatant{Combatant: player})
	require.NotNil(t, tracker.Players[player.Guid].Guild)
	require.Empty(t, tracker.Players[player.Guid].Guild.Name)
	require.Equal(t, database.Timestamptz(at.Add(time.Hour)), tracker.playerObservations(player).Guild)
}

func TestUnitLevelObservation(t *testing.T) {
	t.Parallel()
	for _, unitFirst := range []bool{false, true} {
		t.Run(map[bool]string{false: "combatant first", true: "unit first"}[unitFirst], func(t *testing.T) {
			t.Parallel()
			tracker := New(nil)
			at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			level := int32(20)
			player := combatant.Combatant{Guid: guid.GUID(10), Seen: at, Level: &level}
			unit := &messages.Unit{MessageBase: messages.MessageBase{Timestamp: at.Add(time.Hour)}, Info: unitinfo.Info{Guid: player.Guid, Level: 30}}
			if unitFirst {
				tracker.Unit(unit)
				tracker.Player(&messages.Combatant{Combatant: player})
			} else {
				tracker.Player(&messages.Combatant{Combatant: player})
				tracker.Unit(unit)
			}
			require.EqualValues(t, 30, *tracker.Players[player.Guid].Level)
			require.Equal(t, database.Timestamptz(unit.Date()), tracker.playerObservations(player).Level)
			unit.Timestamp = at.Add(-time.Hour)
			unit.Level = 10
			tracker.Unit(unit)
			require.EqualValues(t, 30, *tracker.Players[player.Guid].Level)
			unit.Timestamp = at.Add(2 * time.Hour)
			unit.Level = 30
			tracker.Unit(unit)
			require.Equal(t, database.Timestamptz(unit.Date()), tracker.playerObservations(player).Level)
			unit.Timestamp = at.Add(3 * time.Hour)
			unit.Level = 0
			tracker.Unit(unit)
			require.Equal(t, database.Timestamptz(at.Add(2*time.Hour)), tracker.playerObservations(player).Level)
		})
	}
}

func TestMetadataLegacyFallback(t *testing.T) {
	t.Parallel()
	tracker := New(nil)
	player := combatant.Combatant{Guid: guid.GUID(10), Seen: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Name: "Player", Guild: &combatant.Guild{}}
	tracker.Players[player.Guid] = player
	clocks := tracker.playerObservations(player)
	require.Equal(t, database.Timestamptz(player.Seen), clocks.Name)
	require.Equal(t, clocks.Name, clocks.Guild)
	require.False(t, clocks.Level.Valid)
	require.False(t, clocks.Class.Valid)
}

func TestUnitLevelObservationProvenance(t *testing.T) {
	t.Parallel()
	tracker := New(nil)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	unit := &messages.Unit{MessageBase: messages.MessageBase{Timestamp: at.Add(time.Hour)}, Info: unitinfo.Info{Guid: guid.GUID(10), Level: 30, LevelObservedAt: &at}}
	tracker.Unit(unit)
	player := combatant.Combatant{Guid: unit.Guid, Seen: at.Add(2 * time.Hour)}
	tracker.Player(&messages.Combatant{Combatant: player})
	require.Nil(t, tracker.Players[player.Guid].Level)
	require.False(t, tracker.playerObservations(player).Level.Valid)

	// Raw combat levels remain eligible. Supplemental levels cannot overwrite
	// them, even if carried by a later UNIT_INFO message.
	level := int32(40)
	player.Seen = at.Add(30 * time.Minute)
	player.Level = &level
	tracker.Player(&messages.Combatant{Combatant: player})
	require.EqualValues(t, 40, *tracker.Players[player.Guid].Level)
	tracker.Unit(unit)
	require.EqualValues(t, 40, *tracker.Players[player.Guid].Level)
	require.Equal(t, database.Timestamptz(player.Seen), tracker.playerObservations(player).Level)
}
