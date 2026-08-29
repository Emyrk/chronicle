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

func TestCleanEncounterKillTimesExcludePartialKills(t *testing.T) {
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
		Name: "Molten Core", HashedSlug: pgtype.Text{String: "clean-only-raid", Valid: true},
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

	// The clean-only query should return only the clean kill.
	cleanKillTimes, err := store.GetInstanceCleanEncounterKillTimes(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, cleanKillTimes, 1)
	require.Equal(t, "Clean Boss", cleanKillTimes[0].EncounterName)

	// The original query still returns both clean and partial.
	allKillTimes, err := store.GetInstanceEncounterKillTimes(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, allKillTimes, 2)
}

func TestSpeedrunLeaderboardTimingModes(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	startedAt := time.Date(2026, time.August, 1, 20, 0, 0, 0, time.UTC)

	rankedGuildID := uuid.New()
	fullGuildID := uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3), ($4, $2, $5)",
		rankedGuildID, realmID, "Ranked Raiders", fullGuildID, "Full Clear Raiders")
	require.NoError(t, err)

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
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

	insertRun := func(guildID uuid.UUID, clearDuration, rankedDuration time.Duration, offset time.Duration) uuid.UUID {
		t.Helper()
		id := uuid.New()
		clearStart := startedAt.Add(offset)
		clearEnd := clearStart.Add(clearDuration)
		rankedStart := clearStart.Add(10 * time.Minute)
		rankedEnd := rankedStart.Add(rankedDuration)
		_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: id, RealmID: realmID, LogGroupID: logGroupID,
			Name: "Molten Core", HashedSlug: pgtype.Text{String: "ranked-" + id.String()[:8], Valid: true},
			GuildID:   uuid.NullUUID{UUID: guildID, Valid: true},
			StartTime: database.Timestamptz(clearStart), EndTime: database.Timestamptz(clearEnd),
			Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
			InstanceID: id, InstanceName: "Molten Core", RealmID: realmID,
			GuildID: uuid.NullUUID{UUID: guildID, Valid: true}, Qualified: true,
			StartTime: database.Timestamptz(clearStart), CompletionTime: database.Timestamptz(clearEnd),
			DurationMs:      int64(clearDuration / time.Millisecond),
			RankedStartTime: database.Timestamptz(rankedStart), RankedCompletionTime: database.Timestamptz(rankedEnd),
			RankedDurationMs: pgtype.Int8{Int64: int64(rankedDuration / time.Millisecond), Valid: true},
			Proof:            []byte(`{"proof":[]}`),
		}))
		return id
	}

	rankedWinner := insertRun(rankedGuildID, 60*time.Minute, 30*time.Minute, 0)
	fullWinner := insertRun(fullGuildID, 50*time.Minute, 40*time.Minute, 2*time.Hour)

	rankedRows, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName: "Molten Core", RealmNames: []string{},
		FilterDifficulty: true, DifficultyName: "Normal", UseRankedTiming: true,
	})
	require.NoError(t, err)
	require.Len(t, rankedRows, 2)
	require.Equal(t, rankedWinner, rankedRows[0].InstanceID)
	require.EqualValues(t, 30*time.Minute/time.Millisecond, rankedRows[0].DurationMs)

	fullRows, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName: "Molten Core", RealmNames: []string{},
		FilterDifficulty: true, DifficultyName: "Normal", UseRankedTiming: false,
	})
	require.NoError(t, err)
	require.Len(t, fullRows, 2)
	require.Equal(t, fullWinner, fullRows[0].InstanceID)
	require.EqualValues(t, 50*time.Minute/time.Millisecond, fullRows[0].DurationMs)
}

func TestExternalAPILeaderboardDuplicateLogsFollowTimingMode(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	startedAt := time.Date(2026, time.August, 1, 20, 0, 0, 0, time.UTC)

	guildID := uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)",
		guildID, realmID, "Duplicate Raiders")
	require.NoError(t, err)

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
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

	insertRun := func(slug string, clearDuration, rankedDuration time.Duration) uuid.UUID {
		t.Helper()
		id := uuid.New()
		clearEnd := startedAt.Add(clearDuration)
		rankedStart := startedAt.Add(10 * time.Minute)
		rankedEnd := rankedStart.Add(rankedDuration)
		_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: id, RealmID: realmID, LogGroupID: logGroupID,
			Name: "Molten Core", HashedSlug: pgtype.Text{String: slug, Valid: true},
			GuildID:   uuid.NullUUID{UUID: guildID, Valid: true},
			StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(clearEnd),
			Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
			InstanceID: id, InstanceName: "Molten Core", RealmID: realmID,
			GuildID: uuid.NullUUID{UUID: guildID, Valid: true}, Qualified: true,
			StartTime: database.Timestamptz(startedAt), CompletionTime: database.Timestamptz(clearEnd),
			DurationMs:      int64(clearDuration / time.Millisecond),
			RankedStartTime: database.Timestamptz(rankedStart), RankedCompletionTime: database.Timestamptz(rankedEnd),
			RankedDurationMs: pgtype.Int8{Int64: int64(rankedDuration / time.Millisecond), Valid: true},
			Proof:            []byte(`{"proof":[]}`),
		}))
		return id
	}

	fullWinner := insertRun("full-winner", 50*time.Minute, 40*time.Minute)
	rankedWinner := insertRun("ranked-winner", 60*time.Minute, 30*time.Minute)
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: fullWinner, Valid: true},
		Ids:              []uuid.UUID{fullWinner, rankedWinner},
	}))
	insertVideo := func(instanceID uuid.UUID, slug, url string) {
		t.Helper()
		require.NoError(t, store.InsertStampedYoutubeVideo(ctx, database.InsertStampedYoutubeVideoParams{
			LogInstanceID: uuid.NullUUID{UUID: instanceID, Valid: true},
			InstanceSlug:  pgtype.Text{String: slug, Valid: true},
			CreatedAt:     database.Timestamptz(startedAt),
			ExportedAt:    database.Timestamptz(startedAt),
			VideoUrl:      url,
			Payload:       []database.VideoTimestamp{},
		}))
	}
	insertVideo(fullWinner, "full-winner", "https://youtube.com/watch?v=full")
	insertVideo(rankedWinner, "ranked-winner", "https://youtube.com/watch?v=ranked")

	assertMode := func(useRankedTiming bool, selectedID, duplicateID uuid.UUID, duplicateDuration time.Duration, selectedURL, duplicateURL string) {
		t.Helper()
		leaderboard, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
			InstanceName: "Molten Core", RealmNames: []string{},
			FilterDifficulty: true, DifficultyName: "Normal", UseRankedTiming: useRankedTiming,
		})
		require.NoError(t, err)
		require.Len(t, leaderboard, 1)
		require.Equal(t, selectedID, leaderboard[0].InstanceID)
		require.Equal(t, guildID, leaderboard[0].GuildID.UUID)
		require.True(t, leaderboard[0].HasYoutubeVideo)
		require.Equal(t, selectedURL, leaderboard[0].YoutubeUrl)

		duplicates, err := store.ListExternalAPILeaderboardDuplicateLogs(ctx, database.ListExternalAPILeaderboardDuplicateLogsParams{
			UseRankedTiming: useRankedTiming, SelectedInstanceIds: []uuid.UUID{selectedID},
		})
		require.NoError(t, err)
		require.Len(t, duplicates, 1)
		require.Equal(t, selectedID, duplicates[0].SelectedInstanceID)
		require.Equal(t, duplicateID, duplicates[0].ID)
		require.EqualValues(t, duplicateDuration/time.Millisecond, duplicates[0].DurationMs)
		require.True(t, duplicates[0].HasYoutubeVideo)
		require.Equal(t, duplicateURL, duplicates[0].YoutubeUrl)
	}

	assertMode(false, fullWinner, rankedWinner, 60*time.Minute,
		"https://youtube.com/watch?v=full", "https://youtube.com/watch?v=ranked")
	assertMode(true, rankedWinner, fullWinner, 40*time.Minute,
		"https://youtube.com/watch?v=ranked", "https://youtube.com/watch?v=full")
}
