package ratingmath

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestProjectionManifestFrozenMembership(t *testing.T) {
	t.Parallel()
	realm, group, foreign := uuid.New(), uuid.New(), uuid.New()
	frozen := projectionManifest{
		Memberships: []database.RatingRealmGroupMembership{{RealmID: realm, GroupID: group}},
		Policies:    []database.RatingGroupPolicy{{GroupID: group, PeriodDays: 30}},
		Bosses:      []database.RatingGroupBossPolicy{{GroupID: group, InstanceName: "Raid", EncounterName: "Boss"}},
	}
	encoded, err := json.Marshal(frozen)
	require.NoError(t, err)
	var restored projectionManifest
	require.NoError(t, json.Unmarshal(encoded, &restored))
	policy, boss, ok := restored.forRealm(realm, "Raid", "Boss")
	require.True(t, ok)
	require.Equal(t, group, policy.GroupID)
	require.Equal(t, "Boss", boss.EncounterName)
	_, _, ok = restored.forRealm(foreign, "Raid", "Boss")
	require.False(t, ok)
	_, _, ok = restored.forRealm(realm, "Raid", "Other")
	require.False(t, ok)
}

func TestProjectionCursorRoundTrip(t *testing.T) {
	t.Parallel()
	cursor := projectionCursor{Realm: uuid.New(), Player: "player", Instance: "Raid", Boss: "Boss", Difficulty: "heroic", Size: 40, Class: "Warrior", Spec: "Arms", SubSpec: "", Metric: "dps"}
	encoded, err := json.Marshal(cursor)
	require.NoError(t, err)
	var actual projectionCursor
	require.NoError(t, json.Unmarshal(encoded, &actual))
	require.Equal(t, cursor, actual)
}
