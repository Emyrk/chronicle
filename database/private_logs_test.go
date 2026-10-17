package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestPrivateLogsExcludedFromPublicDiscoveryAndDerivedWrites(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	startedAt := time.Date(2026, time.October, 1, 20, 0, 0, 0, time.UTC)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "private-log-" + userID.String()[:8],
	})
	require.NoError(t, err)

	insertInstance := func(private bool, slug string) uuid.UUID {
		t.Helper()
		logGroupID := uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
			CreatedAt: database.Timestamptz(startedAt), UpdatedAt: database.Timestamptz(startedAt),
		})
		require.NoError(t, err)
		if private {
			_, err = pool.Exec(ctx, "UPDATE wow_log_groups SET private = true WHERE id = $1", logGroupID)
			require.NoError(t, err)
		}
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
	privateInstanceID := insertInstance(true, "private-discovery-log")

	recent, err := store.ListRecentInstances(ctx, database.ListRecentInstancesParams{LimitCount: 10})
	require.NoError(t, err)
	require.Len(t, recent, 1)
	require.Equal(t, publicInstanceID, recent[0].ID)

	duplicates, err := store.FindDuplicateInstanceCandidates(ctx, database.FindDuplicateInstanceCandidatesParams{
		RealmID: realmID, Name: "Molten Core", MaxPlayers: 40,
		WindowStart: database.Timestamptz(startedAt.Add(-time.Minute)),
		WindowEnd:   database.Timestamptz(startedAt.Add(time.Minute)),
		ExcludeID:   publicInstanceID,
	})
	require.NoError(t, err)
	require.Empty(t, duplicates)

	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: privateInstanceID, InstanceName: "Molten Core", RealmID: realmID,
		Qualified: true, StartTime: database.Timestamptz(startedAt),
		CompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		DurationMs:     int64(time.Hour / time.Millisecond), Proof: []byte(`{"proof":[]}`),
	}))
	var privateSpeedruns int
	require.NoError(t, pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM instance_speedruns WHERE instance_id = $1", privateInstanceID,
	).Scan(&privateSpeedruns))
	require.Zero(t, privateSpeedruns)
}
