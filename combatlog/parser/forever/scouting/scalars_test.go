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
