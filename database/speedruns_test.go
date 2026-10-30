package database_test

import (
	"encoding/json"
	"fmt"
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
		DurationMs:      int64(time.Hour / time.Millisecond),
		RankedStartTime: database.Timestamptz(startedAt), RankedCompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		RankedDurationMs: pgtype.Int8{Int64: int64(time.Hour / time.Millisecond), Valid: true}, Proof: []byte(`{"proof":[]}`),
	}))

	legacyInstanceID := uuid.New()
	legacyStartedAt := startedAt.Add(-time.Hour)
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: legacyInstanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", HashedSlug: pgtype.Text{String: "legacy-unranked-raid", Valid: true},
		StartTime: database.Timestamptz(legacyStartedAt), EndTime: database.Timestamptz(legacyStartedAt.Add(time.Hour)),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: legacyInstanceID, InstanceName: "Molten Core", RealmID: realmID,
		StartTime: database.Timestamptz(legacyStartedAt), CompletionTime: database.Timestamptz(legacyStartedAt.Add(time.Hour)),
		DurationMs: int64(time.Hour / time.Millisecond), Proof: []byte(`{"proof":[]}`),
	}))

	cohort, err := store.InstanceSpeedrunCohort(ctx, database.InstanceSpeedrunCohortParams{
		InstanceID: instanceID, LookbackDays: 60, Scope: "server", MetricsVersion: 1,
	})
	require.NoError(t, err)
	require.Len(t, cohort, 2)

	require.False(t, cohort[1].DurationMs.Valid)

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
	legacyGuildID := uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3), ($4, $2, $5), ($6, $2, $7)",
		rankedGuildID, realmID, "Ranked Raiders", fullGuildID, "Full Clear Raiders", legacyGuildID, "Legacy Raiders")
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

	insertRun := func(guildID uuid.UUID, rawDuration, rankedDuration, bossToBossDuration time.Duration, offset time.Duration) uuid.UUID {
		t.Helper()
		id := uuid.New()
		clearStart := startedAt.Add(offset)
		clearEnd := clearStart.Add(rawDuration)
		rankedStart := clearStart.Add(5 * time.Minute)
		rankedEnd := rankedStart.Add(rankedDuration)
		bossToBossStart := clearStart.Add(10 * time.Minute)
		bossToBossEnd := bossToBossStart.Add(bossToBossDuration)
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
			DurationMs:      int64(rawDuration / time.Millisecond),
			RankedStartTime: database.Timestamptz(rankedStart), RankedCompletionTime: database.Timestamptz(rankedEnd),
			RankedDurationMs:    pgtype.Int8{Int64: int64(rankedDuration / time.Millisecond), Valid: true},
			BossToBossStartTime: database.Timestamptz(bossToBossStart), BossToBossCompletionTime: database.Timestamptz(bossToBossEnd),
			BossToBossDurationMs: pgtype.Int8{Int64: int64(bossToBossDuration / time.Millisecond), Valid: true},
			Proof:                []byte(`{"proof":[]}`),
		}))
		return id
	}

	bossWinner := insertRun(rankedGuildID, 60*time.Minute, 55*time.Minute, 30*time.Minute, 0)
	fullWinner := insertRun(fullGuildID, 50*time.Minute, 40*time.Minute, 35*time.Minute, 2*time.Hour)

	legacyID := uuid.New()
	legacyStart := startedAt.Add(4 * time.Hour)
	legacyDuration := 45 * time.Minute
	legacyEnd := legacyStart.Add(legacyDuration)
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: legacyID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", HashedSlug: pgtype.Text{String: "legacy-" + legacyID.String()[:8], Valid: true},
		GuildID:   uuid.NullUUID{UUID: legacyGuildID, Valid: true},
		StartTime: database.Timestamptz(legacyStart), EndTime: database.Timestamptz(legacyEnd),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: legacyID, InstanceName: "Molten Core", RealmID: realmID,
		GuildID: uuid.NullUUID{UUID: legacyGuildID, Valid: true}, Qualified: true,
		StartTime: database.Timestamptz(legacyStart), CompletionTime: database.Timestamptz(legacyEnd),
		DurationMs: int64(legacyDuration / time.Millisecond), Proof: []byte(`{"proof":[]}`),
	}))

	rankedRows, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName: "Molten Core", RealmNames: []string{},
		FilterDifficulty: true, DifficultyName: "Normal", UseRankedTiming: true,
	})
	require.NoError(t, err)
	require.Len(t, rankedRows, 2)
	require.Equal(t, bossWinner, rankedRows[0].InstanceID)
	require.EqualValues(t, 30*time.Minute/time.Millisecond, rankedRows[0].DurationMs)

	fullRows, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName: "Molten Core", RealmNames: []string{},
		FilterDifficulty: true, DifficultyName: "Normal", UseRankedTiming: false,
	})
	require.NoError(t, err)
	require.Len(t, fullRows, 3)
	require.Equal(t, fullWinner, fullRows[0].InstanceID)
	require.EqualValues(t, 40*time.Minute/time.Millisecond, fullRows[0].DurationMs)
	require.Equal(t, legacyID, fullRows[1].InstanceID)
	require.EqualValues(t, legacyDuration/time.Millisecond, fullRows[1].DurationMs)
	require.True(t, legacyStart.Equal(fullRows[1].StartTime.Time))
	require.True(t, legacyEnd.Equal(fullRows[1].CompletionTime.Time))

	firstPage, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName: "Molten Core", RealmNames: []string{}, ResultLimit: 1,
		FilterDifficulty: true, DifficultyName: "Normal", UseRankedTiming: false,
	})
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	require.Equal(t, fullWinner, firstPage[0].InstanceID)

	secondPage, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName: "Molten Core", RealmNames: []string{}, ResultLimit: 1, ResultOffset: 1,
		FilterDifficulty: true, DifficultyName: "Normal", UseRankedTiming: false,
	})
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	require.Equal(t, legacyID, secondPage[0].InstanceID)
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

	insertRun := func(slug string, rawDuration, rankedDuration, bossToBossDuration time.Duration) uuid.UUID {
		t.Helper()
		id := uuid.New()
		clearEnd := startedAt.Add(rawDuration)
		rankedStart := startedAt.Add(5 * time.Minute)
		rankedEnd := rankedStart.Add(rankedDuration)
		bossToBossStart := startedAt.Add(10 * time.Minute)
		bossToBossEnd := bossToBossStart.Add(bossToBossDuration)
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
			DurationMs:      int64(rawDuration / time.Millisecond),
			RankedStartTime: database.Timestamptz(rankedStart), RankedCompletionTime: database.Timestamptz(rankedEnd),
			RankedDurationMs:    pgtype.Int8{Int64: int64(rankedDuration / time.Millisecond), Valid: true},
			BossToBossStartTime: database.Timestamptz(bossToBossStart), BossToBossCompletionTime: database.Timestamptz(bossToBossEnd),
			BossToBossDurationMs: pgtype.Int8{Int64: int64(bossToBossDuration / time.Millisecond), Valid: true},
			Proof:                []byte(`{"proof":[]}`),
		}))
		return id
	}

	fullWinner := insertRun("full-winner", 50*time.Minute, 40*time.Minute, 35*time.Minute)
	bossWinner := insertRun("ranked-winner", 60*time.Minute, 45*time.Minute, 30*time.Minute)
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: fullWinner, Valid: true},
		Ids:              []uuid.UUID{fullWinner, bossWinner},
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
	insertVideo(bossWinner, "ranked-winner", "https://youtube.com/watch?v=ranked")

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

	assertMode(false, fullWinner, bossWinner, 45*time.Minute,
		"https://youtube.com/watch?v=full", "https://youtube.com/watch?v=ranked")
	assertMode(true, bossWinner, fullWinner, 35*time.Minute,
		"https://youtube.com/watch?v=ranked", "https://youtube.com/watch?v=full")
}

func TestGuildSpeedrunHistory(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	startedAt := time.Now().UTC().Truncate(time.Second).Add(-48 * time.Hour)

	guildID := uuid.New()
	otherGuildID := uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3), ($4, $2, $5)",
		guildID, realmID, "History Raiders", otherGuildID, "Other Raiders")
	require.NoError(t, err)

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "u-" + userID.String()[:8]})
	require.NoError(t, err)
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(startedAt), UpdatedAt: database.Timestamptz(startedAt),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	insertClear := func(guild uuid.UUID, instanceName, difficultyName string, maxPlayers, dynamicDifficulty int32, start time.Time, duration time.Duration, qualified bool) uuid.UUID {
		t.Helper()
		id := uuid.New()
		end := start.Add(duration)
		_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: id, RealmID: realmID, LogGroupID: logGroupID,
			Name: instanceName, HashedSlug: pgtype.Text{String: "history-" + id.String()[:8], Valid: true},
			GuildID:   uuid.NullUUID{UUID: guild, Valid: true},
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(end),
			Capabilities: []string{}, DifficultyName: difficultyName, MaxPlayers: maxPlayers, DynamicDifficulty: dynamicDifficulty,
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
			InstanceID: id, InstanceName: instanceName, RealmID: realmID,
			GuildID: uuid.NullUUID{UUID: guild, Valid: true}, Qualified: qualified,
			StartTime: database.Timestamptz(start), CompletionTime: database.Timestamptz(end),
			DurationMs:      int64(duration / time.Millisecond),
			RankedStartTime: database.Timestamptz(start), RankedCompletionTime: database.Timestamptz(end),
			RankedDurationMs: pgtype.Int8{Int64: int64(duration / time.Millisecond), Valid: true},
			Proof:            []byte(`{"proof":[]}`),
		}))
		return id
	}
	insertFight := func(instanceID uuid.UUID, name string, boss bool, start time.Time, length time.Duration) uuid.UUID {
		t.Helper()
		id := uuid.New()
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: id, InstanceID: instanceID, Name: name,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: boss,
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(length)),
		})
		require.NoError(t, err)
		return id
	}

	// The first clear has two overlapping trash pulls (0:10-0:15 and 0:12-0:18, so 8 minutes once
	// merged), a pull that runs into a boss (0:28-0:32, of which 0:30-0:32 is the boss), and trash
	// after the clear ends, which must not count.
	first := insertClear(guildID, "Molten Core", "Normal", 40, 0, startedAt.Add(-24*time.Hour), time.Hour, true)
	firstStart := startedAt.Add(-24 * time.Hour)
	insertFight(first, "Trash A", false, firstStart.Add(10*time.Minute), 5*time.Minute)
	insertFight(first, "Trash B", false, firstStart.Add(12*time.Minute), 6*time.Minute)
	insertFight(first, "Trash C", false, firstStart.Add(28*time.Minute), 4*time.Minute)
	lucifron := insertFight(first, "Lucifron", true, firstStart.Add(30*time.Minute), 2*time.Minute)
	ragnaros := insertFight(first, "Ragnaros", true, firstStart.Add(55*time.Minute), 5*time.Minute)
	insertFight(first, "Late Trash", false, firstStart.Add(70*time.Minute), 5*time.Minute)

	// A re-upload of the first clear: unqualified and slower, so the qualified copy wins.
	reupload := insertClear(guildID, "Molten Core", "Normal", 40, 0, firstStart, 70*time.Minute, false)
	_, err = pool.Exec(ctx, "UPDATE log_instances SET duplicate_group_id = $1 WHERE id IN ($1, $2)", first, reupload)
	require.NoError(t, err)

	second := insertClear(guildID, "Molten Core", "Normal", 40, 0, startedAt, 50*time.Minute, false)
	third := insertClear(guildID, "Molten Core", "Normal", 40, 0, startedAt.Add(3*time.Hour), 60*time.Minute, false)
	_, err = pool.Exec(ctx, `UPDATE instance_speedruns SET proof = '{"proof":[{"satisfied":true}]}' WHERE instance_id = $1`, second)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE instance_speedruns SET proof = '{"proof":[{"satisfied":false}]}' WHERE instance_id = $1`, third)
	require.NoError(t, err)
	insertClear(guildID, "Molten Core", "Heroic", 40, 1, startedAt.Add(time.Hour), 55*time.Minute, true)
	insertClear(guildID, "Molten Core", "Normal", 20, 0, startedAt.Add(2*time.Hour), 45*time.Minute, true)
	// Other raids, other guilds and clears outside the window are left out.
	insertClear(guildID, "Blackwing Lair", "Normal", 40, 0, startedAt, 50*time.Minute, true)
	insertClear(otherGuildID, "Molten Core", "Normal", 40, 0, startedAt, 40*time.Minute, true)
	insertClear(guildID, "Molten Core", "Normal", 40, 0, startedAt.Add(-400*24*time.Hour), 45*time.Minute, true)

	clears, err := store.GuildRaidClears(ctx, database.GuildRaidClearsParams{GuildID: guildID, SinceDays: 180})
	require.NoError(t, err)
	clearCounts := make(map[string]int64, len(clears))
	for _, clear := range clears {
		key := fmt.Sprintf("%s\x00%s\x00%d\x00%d", clear.InstanceName, clear.DifficultyName, clear.MaxPlayers, clear.DynamicDifficulty)
		clearCounts[key] = clear.ClearCount
	}
	require.Equal(t, int64(3), clearCounts["Molten Core\x00Normal\x0040\x000"])
	require.Equal(t, int64(1), clearCounts["Molten Core\x00Heroic\x0040\x001"])
	require.Equal(t, int64(1), clearCounts["Molten Core\x00Normal\x0020\x000"])

	// Stored time parses for the first clear: a clear parse, a scored Lucifron kill, and a
	// Ragnaros kill whose sample was too small, which reads as no parse.
	const lookbackDays, policyVersion, queryVersion = 60, 1, 1
	scoreID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO time_parse_scores (
		id, tenant_id, instance_id, run_id, realm_id, clear_duration_ms,
		clear_server_precise_score, clear_server_display_score, clear_server_rank, clear_server_sample_size, clear_server_status,
		clear_realm_precise_score, clear_realm_display_score, clear_realm_rank, clear_realm_sample_size, clear_realm_status,
		cutoff, window_start, lookback_days, policy_version, query_version
	) VALUES ($1, $2, $3, $3, $4, 3600000, 87.5, 87, 3, 20, 'ok', 90, 90, 2, 20, 'ok', now(), now(), $5, $6, $7)`,
		scoreID, uuid.Nil, first, realmID, lookbackDays, policyVersion, queryVersion)
	require.NoError(t, err)
	insertBossScore := func(encounterID uuid.UUID, name string, score float64, status string) {
		t.Helper()
		_, err := pool.Exec(ctx, `INSERT INTO time_parse_boss_scores (
			time_parse_score_id, encounter_id, encounter_name, duration_ms,
			server_precise_score, server_display_score, server_rank, server_sample_size, server_status,
			realm_precise_score, realm_display_score, realm_rank, realm_sample_size, realm_status
		) VALUES ($1, $2, $3, 1, $4, 0, 1, 1, $5, 0, 0, 1, 1, $5)`, scoreID, encounterID, name, score, status)
		require.NoError(t, err)
	}
	insertBossScore(lucifron, "Lucifron", 64.25, "ok")
	insertBossScore(ragnaros, "Ragnaros", 12, "sample_too_small")

	rows, err := store.GuildSpeedrunHistory(ctx, database.GuildSpeedrunHistoryParams{
		TenantID: uuid.Nil, LookbackDays: lookbackDays, PolicyVersion: policyVersion, QueryVersion: queryVersion,
		GuildID: guildID, InstanceName: "Molten Core",
		FilterDifficulty: true, DifficultyName: "Normal",
		FilterMaxPlayers: true, MaxPlayers: 40,
		FilterDynamicDifficulty: true, DynamicDifficulty: 0,
		SinceDays: 180,
	})
	require.NoError(t, err)
	require.Len(t, rows, 3)

	require.Equal(t, first, rows[0].InstanceID)
	require.True(t, rows[0].Qualified)
	require.EqualValues(t, time.Hour/time.Millisecond, rows[0].DurationMs)
	require.EqualValues(t, 10*time.Minute/time.Millisecond, rows[0].TrashDurationMs)
	require.InDelta(t, 87.5, rows[0].ClearParse, 0.001)

	require.Equal(t, second, rows[1].InstanceID)
	require.False(t, rows[1].Qualified)
	require.Zero(t, rows[1].TrashDurationMs)
	require.EqualValues(t, -1, rows[1].ClearParse)

	require.True(t, rows[1].Complete)
	require.Equal(t, third, rows[2].InstanceID)
	require.False(t, rows[2].Qualified)
	require.False(t, rows[2].Complete)

	kills, err := store.GuildSpeedrunBossKills(ctx, database.GuildSpeedrunBossKillsParams{
		TenantID: uuid.Nil, LookbackDays: lookbackDays, PolicyVersion: policyVersion, QueryVersion: queryVersion,
		InstanceIds: []uuid.UUID{first, second},
	})
	require.NoError(t, err)
	require.Len(t, kills, 2)
	require.Equal(t, "Lucifron", kills[0].EncounterName)
	require.EqualValues(t, 2*time.Minute/time.Millisecond, kills[0].DurationMs)
	require.InDelta(t, 64.25, kills[0].Parse, 0.001)
	require.Equal(t, "Ragnaros", kills[1].EncounterName)
	require.EqualValues(t, -1, kills[1].Parse)
}
