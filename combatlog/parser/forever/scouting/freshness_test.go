package scouting

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/stretchr/testify/require"
)

func TestFreshKnownAt(t *testing.T) {
	t.Parallel()
	lastSeen := time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name      string
		reference time.Time
		fresh     bool
	}{
		{"historical reference", lastSeen.Add(-time.Hour), true},
		{"at last seen", lastSeen, true},
		{"exactly 24 hours", lastSeen.Add(24 * time.Hour), true},
		{"one second older", lastSeen.Add(24*time.Hour + time.Second), false},
		{"subsecond older", lastSeen.Add(24*time.Hour + time.Millisecond), false},
		{"before observation", lastSeen.Add(-8 * 24 * time.Hour), false},
		{"missing reference", time.Time{}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			observed := lastSeen.Add(-7 * 24 * time.Hour).Unix()
			index, err := New([]Source{{Players: map[string]Player{"Player-1-00000001": {Name: "Scout", Race: "Human", Gender: ptr.Ref(3), LastSeen: lastSeen.Unix(), Observations: []Observation{{At: observed, Name: "Scout", Level: ptr.Ref(60), Guild: ptr.Ref("Guild"), Party: ptr.Ref(true)}}}}}})
			require.NoError(t, err)
			id := index.PlayerIDs()[0]
			known := index.FreshKnownAt(id, tc.reference)
			require.Equal(t, tc.fresh, known.Name != nil)
			require.Equal(t, tc.fresh, known.Level != nil)
			require.Equal(t, tc.fresh, known.Guild != nil)
			require.Equal(t, tc.fresh, known.Party != nil)
			if tc.fresh {
				require.Equal(t, observed, known.Level.At)
			}
			race, gender := index.StaticAttributes(id)
			require.Equal(t, types.HeroRacesHuman, race)
			require.Equal(t, types.HeroGenderFemale, gender)
		})
	}
}

func TestFreshKnownAtIndependentSources(t *testing.T) {
	t.Parallel()
	reference := time.Unix(1000000, 0)
	index, err := New([]Source{
		{Players: map[string]Player{"Player-1-00000001": {Name: "Scout", LastSeen: reference.Add(-25 * time.Hour).Unix(), Observations: []Observation{
			{At: reference.Add(-26 * time.Hour).Unix(), Name: "Old", Level: ptr.Ref(10), Guild: ptr.Ref("OldGuild")},
		}}}},
		{Players: map[string]Player{"Player-1-00000001": {Name: "Scout", LastSeen: reference.Add(time.Hour).Unix(), Observations: []Observation{
			{At: reference.Add(-7 * 24 * time.Hour).Unix(), Level: ptr.Ref(20)},
			{At: reference.Unix(), Guild: ptr.Ref("")},
			{At: reference.Add(time.Hour).Unix(), Name: "Future", Level: ptr.Ref(30), Guild: ptr.Ref("FutureGuild")},
		}}}},
	})
	require.NoError(t, err)
	known := index.FreshKnownAt(index.PlayerIDs()[0], reference)
	require.Nil(t, known.Name, "another source cannot refresh the stale name; future name cannot backfill")
	require.Equal(t, 20, *known.Level.Level, "old observation stays valid through its own source LastSeen")
	require.Equal(t, reference.Add(-7*24*time.Hour).Unix(), known.Level.At)
	require.Equal(t, "", *known.Guild.Guild)
	require.Nil(t, known.Party)
}
