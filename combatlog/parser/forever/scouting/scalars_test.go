package scouting

import (
	"github.com/Emyrk/chronicle/internal/luadata"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestScoutingOptionalScalarsAreNotHistoricalObservations(t *testing.T) {
	t.Parallel()
	collection, err := luadata.ParseTable(t.Context(), `{Version=1,Players={["Player-0-00000001"]={Name="Name",Realm="CAMWOWUS2Realm5PvE",Race="Scourge",Gender=2,LastSeen=20,At={10},Levels={60},Guilds={false},Party={false}}}}`)
	require.NoError(t, err)
	players, err := DecodeCollection(collection)
	require.NoError(t, err)
	player := players["Player-0-00000001"]
	require.Equal(t, "CAMWOWUS2Realm5PvE", player.Realm)
	require.Equal(t, "Scourge", player.Race)
	require.Equal(t, 2, *player.Gender)
	require.Nil(t, player.Observations[0].Race)
	require.Nil(t, player.Observations[0].Gender)
	index, err := New([]Source{{Players: players}})
	require.NoError(t, err)
	snapshot, ok := index.Latest(1)
	require.True(t, ok)
	require.Equal(t, []string{"CAMWOWUS2Realm5PvE"}, snapshot.RealmCandidates)
	snapshot.RealmCandidates[0] = "mutated"
	snapshot, _ = index.Latest(1)
	require.Equal(t, []string{"CAMWOWUS2Realm5PvE"}, snapshot.RealmCandidates)
	require.Nil(t, index.KnownAt(1, 10).Level.Race)
	require.Nil(t, index.KnownAt(1, 10).Level.Gender)
}

func TestScoutingPreservesUnrecognizedRaceWithoutInventingRealm(t *testing.T) {
	t.Parallel()
	collection, err := luadata.ParseTable(t.Context(), `{Version=1,Players={["Player-0-00000001"]={Name="Synthetic",Race="Skyborne",Gender=3,LastSeen=20,At={10},Levels={60},Guilds={false},Party={false}}}}`)
	require.NoError(t, err)
	players, err := DecodeCollection(collection)
	require.NoError(t, err)
	player := players["Player-0-00000001"]
	require.Equal(t, "Skyborne", player.Race)
	require.Equal(t, 3, *player.Gender)
	require.Empty(t, player.Realm)
	require.Nil(t, player.Observations[0].Race)
	require.Nil(t, player.Observations[0].Gender)
}

func TestScoutingRepeatedSightingsAndGroupDeparture(t *testing.T) {
	t.Parallel()
	collection, err := luadata.ParseTable(t.Context(), `{Version=1,Players={
 ["Player-0-00000001"]={Name="Synthetic",Realm="CAMWOWUS2Realm5PvE",LastSeen=140,LastGrouped=130,At={100,100,120,140},Guilds={false,"Guild","_","_"},Levels={19,"_","_","_"},Party={true,"_","_",false}},
 ["Player-0-00000002"]={Name="UnknownGuild",Realm="CAMWOWUS2Realm5PvE",LastSeen=140,At={100,120,140},Guilds={false,"_","_"},Levels={19,"_","_"},Party={true,"_",false}}
 }}`)
	require.NoError(t, err)
	players, err := DecodeCollection(collection)
	require.NoError(t, err)
	index, err := New([]Source{{Players: players}})
	require.NoError(t, err)
	sameTime := index.KnownAt(1, 100)
	require.Equal(t, "Guild", *sameTime.Guild.Guild)
	require.Equal(t, int64(100), sameTime.Guild.At)
	latest, ok := index.Latest(1)
	require.True(t, ok)
	require.Equal(t, int64(140), latest.Known.Guild.At)
	require.Equal(t, int64(140), latest.Known.Level.At)
	require.Equal(t, 19, *latest.Known.Level.Level)
	require.Equal(t, "Guild", *latest.Known.Guild.Guild)
	require.False(t, *latest.Known.Party.Party)
	require.Equal(t, int64(140), latest.LastSeen)
	for _, at := range []int64{100, 120, 140} {
		require.Nil(t, index.KnownAt(2, at).Guild)
	}
	unknown, ok := index.Latest(2)
	require.True(t, ok)
	require.Nil(t, unknown.Known.Guild)
}
