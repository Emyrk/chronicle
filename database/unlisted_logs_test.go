package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestUnlistedLogsExcludedFromPublicDiscoveryAndDerivedWrites(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	startedAt := time.Date(2026, time.October, 1, 20, 0, 0, 0, time.UTC)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "unlisted-log-" + userID.String()[:8],
	})
	require.NoError(t, err)

	insertInstance := func(unlisted bool, slug string) uuid.UUID {
		t.Helper()
		logGroupID := uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logGroupID, Owner: userID, LogType: database.LogTypeV1, Unlisted: unlisted,
			CreatedAt: database.Timestamptz(startedAt), UpdatedAt: database.Timestamptz(startedAt),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

		instanceID := uuid.New()
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
			Name: "Molten Core", HashedSlug: pgtype.Text{String: slug, Valid: true},
			StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Hour)),
			Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		return instanceID
	}

	publicInstanceID := insertInstance(false, "public-discovery-log")
	unlistedInstanceID := insertInstance(true, "unlisted-discovery-log")

	unlistedByID, err := store.InstanceWithUnlisted(ctx, unlistedInstanceID)
	require.NoError(t, err)
	require.True(t, unlistedByID.Unlisted)
	require.Equal(t, unlistedInstanceID, unlistedByID.LogInstancesGuild.ID)
	unlistedBySlug, err := store.InstanceBySlugWithUnlisted(ctx, pgtype.Text{String: "unlisted-discovery-log", Valid: true})
	require.NoError(t, err)
	require.True(t, unlistedBySlug.Unlisted)
	require.Equal(t, unlistedInstanceID, unlistedBySlug.LogInstancesGuild.ID)

	_, err = store.PublicInstance(ctx, unlistedInstanceID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.PublicInstanceBySlug(ctx, pgtype.Text{String: "unlisted-discovery-log", Valid: true})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	publicInstance, err := store.PublicInstance(ctx, publicInstanceID)
	require.NoError(t, err)
	require.Equal(t, publicInstanceID, publicInstance.ID)

	recent, err := store.ListRecentInstances(ctx, database.ListRecentInstancesParams{LimitCount: 10})
	require.NoError(t, err)
	require.Len(t, recent, 1)
	require.Equal(t, publicInstanceID, recent[0].ID)

	externalRecent, err := store.ListExternalAPIRecentInstances(ctx, database.ListExternalAPIRecentInstancesParams{
		RealmID: uuid.Nil, GuildID: uuid.Nil, ResultLimit: 10,
	})
	require.NoError(t, err)
	require.Len(t, externalRecent, 1)
	require.Equal(t, publicInstanceID, externalRecent[0].ID)

	duplicates, err := store.FindDuplicateInstanceCandidates(ctx, database.FindDuplicateInstanceCandidatesParams{
		RealmID: realmID, Name: "Molten Core", MaxPlayers: 40,
		WindowStart: database.Timestamptz(startedAt.Add(-time.Minute)),
		WindowEnd:   database.Timestamptz(startedAt.Add(time.Minute)),
		ExcludeID:   publicInstanceID,
	})
	require.NoError(t, err)
	require.Empty(t, duplicates)

	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: unlistedInstanceID, InstanceName: "Molten Core", RealmID: realmID,
		Qualified: true, StartTime: database.Timestamptz(startedAt),
		CompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		DurationMs:     int64(time.Hour / time.Millisecond), Proof: []byte(`{"proof":[]}`),
	}))
	unlistedSpeedrun, err := store.GetInstanceSpeedrun(ctx, unlistedInstanceID)
	require.NoError(t, err)
	require.Equal(t, unlistedInstanceID, unlistedSpeedrun.InstanceID)

	leaderboard, err := store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		MinPlayers: 0, MaxPlayers: 40, ResultLimit: 10,
		InstanceName: "Molten Core", RealmNames: []string{},
	})
	require.NoError(t, err)
	require.Empty(t, leaderboard)

	require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		InstanceID: unlistedInstanceID, EncounterName: "Trash", InstanceName: "Molten Core",
		PlayerGuid: "player-guid", PlayerName: "Unlisted Player", PlayerClass: "Mage",
		PlayerSpec: "Frost", PlayerSubSpec: "", PlayerRole: "dps", PlayerLevel: 60,
		DifficultyName: "Normal", MaxPlayers: 40, RealmID: realmID, RealmName: "Test Realm",
		DamageDone: 1000, DurationSecs: 10, Dps: 100,
		LogHashedSlug: "unlisted-discovery-log", KilledAt: database.Timestamptz(startedAt),
	}))
	rankingRecords, err := store.InstanceRankingRecords(ctx, unlistedInstanceID)
	require.NoError(t, err)
	require.Len(t, rankingRecords, 1)
}
