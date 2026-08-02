package database_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestEncounterKillTimesIncludePartialKills(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	startedAt := time.Date(2026, time.August, 1, 20, 0, 0, 0, time.UTC)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "u-" + userID.String()[:8],
	})
	require.NoError(t, err)

	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(startedAt), UpdatedAt: database.Timestamptz(startedAt),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", HashedSlug: pgtype.Text{String: "partial-kill-raid", Valid: true},
		StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Hour)),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)

	insertEncounter := func(name string, killType database.KillType, offset time.Duration) {
		t.Helper()
		end := startedAt.Add(offset)
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: uuid.New(), InstanceID: instanceID, Name: name,
			KillType: killType, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(end.Add(-time.Minute)), EndTime: database.Timestamptz(end),
		})
		require.NoError(t, err)
	}
	insertEncounter("Clean Boss", database.KillTypeClean, 10*time.Minute)
	insertEncounter("Partial Boss", database.KillTypePartial, 20*time.Minute)
	insertEncounter("Wiped Boss", database.KillTypeWipe, 30*time.Minute)

	killTimes, err := store.GetInstanceEncounterKillTimes(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, killTimes, 2)
	require.Equal(t, []string{"Clean Boss", "Partial Boss"}, []string{
		killTimes[0].EncounterName,
		killTimes[1].EncounterName,
	})

	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: instanceID, InstanceName: "Molten Core", RealmID: realmID,
		StartTime: database.Timestamptz(startedAt), CompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		DurationMs: int64(time.Hour / time.Millisecond), Proof: []byte(`{"proof":[]}`),
	}))

	cohort, err := store.InstanceSpeedrunCohort(ctx, database.InstanceSpeedrunCohortParams{
		InstanceID: instanceID, LookbackDays: 60, Scope: "server", MetricsVersion: 1,
	})
	require.NoError(t, err)
	require.Len(t, cohort, 1)

	var cohortKillTimes []struct {
		EncounterName string `json:"encounter_name"`
	}
	require.NoError(t, json.Unmarshal([]byte(cohort[0].EncounterKillTimesJson), &cohortKillTimes))
	require.Equal(t, []string{"Clean Boss", "Partial Boss"}, []string{
		cohortKillTimes[0].EncounterName,
		cohortKillTimes[1].EncounterName,
	})
}
