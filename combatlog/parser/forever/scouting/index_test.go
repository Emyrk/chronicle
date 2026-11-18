package scouting

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/stretchr/testify/require"
)

func TestScoutingIndexSnapshotsAndTies(t *testing.T) {
	t.Parallel()
	sources := []Source{
		{Players: map[string]Player{
			"Player-0-00000001": {Name: "Fallback", LastSeen: 30, Observations: []Observation{
				{At: 10, Name: "Old", Level: ptr.Ref(10), Guild: ptr.Ref("Guild"), Party: ptr.Ref(false)},
				{At: 20, Name: "First", Level: ptr.Ref(11), Guild: ptr.Ref("")},
				{At: 20, Name: "First", Level: ptr.Ref(12)},
			}},
			"0x0000000000000002": {Name: "Unknown", LastSeen: 40},
		}},
		{Players: map[string]Player{"0x0000000000000001": {Name: "Other", LastSeen: 25, Observations: []Observation{{At: 20, Name: "Tie", Level: ptr.Ref(99), Guild: ptr.Ref("Tie")}, {At: 25, Name: "Later"}}}}},
	}
	index, err := New(sources)
	require.NoError(t, err)
	require.Equal(t, 2, index.Len())
	require.Equal(t, []guid.GUID{1, 2}, index.PlayerIDs())
	require.Empty(t, index.KnownAt(1, 9))
	before := index.KnownAt(1, 10)
	require.Equal(t, 10, *before.Level.Level)
	require.False(t, *before.Party.Party)
	tied := index.KnownAt(1, 20)
	require.Equal(t, 12, *tied.Level.Level)
	require.Equal(t, "", *tied.Guild.Guild)
	require.Equal(t, "First", tied.Name.Name)
	latest, ok := index.Latest(1)
	require.True(t, ok)
	require.Equal(t, int64(30), latest.LastSeen)
	require.Equal(t, "Later", latest.Name)
	require.Equal(t, int64(20), latest.Known.Level.At)
	require.Equal(t, int64(25), latest.Known.Name.At)
	require.Nil(t, latest.Known.Level.Race)
	require.Nil(t, latest.Known.Level.Gender)
	fallback, ok := index.Latest(2)
	require.True(t, ok)
	require.Equal(t, "Unknown", fallback.Name)
	require.Nil(t, fallback.Known.Name)
	_, ok = index.Latest(3)
	require.False(t, ok)
}

func TestScoutingIndexOwnsInputsAndResults(t *testing.T) {
	t.Parallel()
	row := Observation{At: 10, Name: "Name", Level: ptr.Ref(7), Guild: ptr.Ref(""), Party: ptr.Ref(false), Race: ptr.Ref(2), Gender: ptr.Ref(1)}
	source := Source{Players: map[string]Player{"0x0000000000000001": {Name: "Name", LastSeen: 5, Observations: []Observation{row}}}}
	index, err := New([]Source{source})
	require.NoError(t, err)
	*row.Level = 99
	*row.Guild = "Changed"
	*row.Party = true
	*row.Race = 9
	*row.Gender = 9
	source.Players["0x0000000000000001"].Observations[0].Name = "Changed"
	delete(source.Players, "0x0000000000000001")
	latest, ok := index.Latest(1)
	require.True(t, ok)
	require.Equal(t, int64(10), latest.LastSeen)
	require.Equal(t, 7, *latest.Known.Level.Level)
	require.Equal(t, "Name", latest.Name)
	*latest.Known.Level.Level = 100
	*latest.Known.Guild.Guild = "Mutated"
	*latest.Known.Party.Party = true
	*latest.Known.Level.Race = 100
	*latest.Known.Level.Gender = 100
	latest.Known.Name.Name = "Mutated"
	ids := index.PlayerIDs()
	ids[0] = 99
	again := index.KnownAt(1, 10)
	require.Equal(t, 7, *again.Level.Level)
	require.Equal(t, "", *again.Guild.Guild)
	require.False(t, *again.Party.Party)
	require.Equal(t, 2, *again.Level.Race)
	require.Equal(t, 1, *again.Level.Gender)
	require.Equal(t, "Name", again.Name.Name)
	require.Equal(t, []guid.GUID{1}, index.PlayerIDs())
}

func TestScoutingIndexEmptyAndInvalidIdentity(t *testing.T) {
	t.Parallel()
	empty, err := New(nil)
	require.NoError(t, err)
	for _, index := range []*Scouting{nil, {}, empty} {
		require.Zero(t, index.Len())
		require.Empty(t, index.PlayerIDs())
		require.Empty(t, index.KnownAt(1, 10))
		_, ok := index.Latest(1)
		require.False(t, ok)
	}
	_, err = New([]Source{{Players: map[string]Player{"invalid": {}}}})
	require.Error(t, err)
}

func TestScoutingIndexAliasOrdering(t *testing.T) {
	t.Parallel()
	index, err := New([]Source{{Players: map[string]Player{
		"Player-0-00000001":  {Name: "Modern", Observations: []Observation{{At: 1, Name: "Modern"}}},
		"0x0000000000000001": {Name: "Legacy", Observations: []Observation{{At: 1, Name: "Legacy"}}},
	}}})
	require.NoError(t, err)
	require.Equal(t, 1, index.Len())
	require.Equal(t, "Legacy", index.KnownAt(1, 1).Name.Name)
}
