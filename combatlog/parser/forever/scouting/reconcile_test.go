package scouting

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/stretchr/testify/require"
)

func TestFilterSourcesPreservesIndependentArtifacts(t *testing.T) {
	t.Parallel()
	original, err := New([]Source{{Players: map[string]Player{"0x0000000000000001": {Name: "Alice", Realm: "Normal-US", Observations: []Observation{{At: 10, Name: "Alice", Level: ptr.Ref(20)}}}}}, {Players: map[string]Player{"0x0000000000000001": {Name: "Bob", Realm: "Normal-US", Observations: []Observation{{At: 20, Name: "Bob", Level: ptr.Ref(60)}}}}}})
	require.NoError(t, err)
	filtered := original.FilterSources(func(_ guid.GUID, player Player) (Player, bool) {
		if player.Name != "Alice" {
			return player, false
		}
		*player.Observations[0].Level = 30
		return player, true
	})
	known := filtered.KnownAt(1, 100)
	require.Equal(t, 30, *known.Level.Level)
	originalAlice := original.FilterSources(func(_ guid.GUID, player Player) (Player, bool) { return player, player.Name == "Alice" })
	require.Equal(t, 20, *originalAlice.KnownAt(1, 100).Level.Level)
	require.Equal(t, 60, *original.KnownAt(1, 100).Level.Level)
	name, ok := filtered.IdentityName(1)
	require.True(t, ok)
	require.Equal(t, "Alice", name)
	_, ok = original.IdentityName(1)
	require.False(t, ok)
}
