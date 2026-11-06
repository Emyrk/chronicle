package leaderboardread

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestSelectionAndCursor(t *testing.T) {
	t.Parallel()
	rows := []database.ResolveLeaderboardConfigurationRow{
		{Kind: "instance", InstanceName: "Raid"}, {Kind: "boss", InstanceName: "Raid", EncounterName: "A", HasPoints: true, Points: 10}, {Kind: "boss", InstanceName: "Raid", EncounterName: "B", HasPoints: true, Points: 20},
		{Kind: "set", InstanceName: "Raid", SetKey: "default"}, {Kind: "member", InstanceName: "Raid", SetKey: "default", EncounterName: "A"}, {Kind: "set", InstanceName: "Raid", SetKey: "empty"},
	}
	r := Request{Instance: "Raid", Subject: "player", Kind: "boss", Score: "peak", Class: "MAGE", Spec: "Frost", Metric: "dps", Set: "default"}
	s, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"A"}, s.Bosses)
	r.Set = "empty"
	s, err = Select(rows, r)
	require.NoError(t, err)
	require.Zero(t, s.Denominator)
	r.Kind = "renown"
	r.Score = "renown"
	r.Set = ""
	r.Class = ""
	r.Spec = ""
	r.Metric = ""
	s, err = Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"A", "B"}, s.Bosses)
	r.MaxPlayers = 25
	_, err = Select(rows, r)
	require.Error(t, err)
	rows = append(rows, database.ResolveLeaderboardConfigurationRow{Kind: "variant", InstanceName: "Raid", DifficultyName: "Heroic", MaxPlayers: 25}, database.ResolveLeaderboardConfigurationRow{Kind: "boss_variant", InstanceName: "Raid", EncounterName: "A", DifficultyName: "Heroic", MaxPlayers: 25, HasPoints: true, Points: 0})
	r.Difficulty = "Heroic"
	s, err = Select(rows, r)
	require.NoError(t, err)
	require.Zero(t, s.Awards[0])
	r.Set = "default"
	_, err = Select(rows, r)
	require.Error(t, err)
	r.Set = ""
	tenant := uuid.New()
	fp := Fingerprint(tenant, r, s)
	encoded := EncodeCursor(Cursor{Fingerprint: fp, Score: 12.123456, Realm: uuid.New(), Subject: "A"})
	c, err := DecodeCursor(encoded, fp)
	require.NoError(t, err)
	require.Equal(t, 12.123456, c.Score)
	_, err = DecodeCursor(encoded, Fingerprint(uuid.New(), r, s))
	require.Error(t, err)
	r.Search = "changed"
	_, err = DecodeCursor(encoded, Fingerprint(tenant, r, s))
	require.Error(t, err)
	rows = append(rows, database.ResolveLeaderboardConfigurationRow{Kind: "conflict"})
	_, err = Select(rows, r)
	require.Error(t, err)
}
