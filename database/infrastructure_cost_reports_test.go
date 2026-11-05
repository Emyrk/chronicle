package database_test

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestInfrastructureCostUserActivityHalfOpenPeriod(t *testing.T) {
	t.Parallel()
	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "cost-user", Email: "cost@example.invalid", CreatedAt: database.Timestamptz(start.Add(-time.Hour)), UpdatedAt: database.Timestamptz(start)})
	require.NoError(t, err)
	add := func(created time.Time, eventBytes int) uuid.UUID {
		groupID := uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: groupID, Owner: userID, LogType: database.LogTypeV1, CreatedAt: database.Timestamptz(created), UpdatedAt: database.Timestamptz(created)})
		require.NoError(t, err)
		_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{ID: uuid.New(), Owner: userID, Hash: uuid.NewString(), WowLogID: groupID, SizeBytes: 100, MimeType: "text/plain", CompressedSizeBytes: pgtype.Int8{Int64: 50, Valid: true}, CreatedAt: database.Timestamptz(created), UpdatedAt: database.Timestamptz(created)})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, groupID))
		instanceID := uuid.New()
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{ID: instanceID, RealmID: realmID, LogGroupID: groupID, Name: "Cost Test", StartTime: database.Timestamptz(created), EndTime: database.Timestamptz(created.Add(time.Minute)), Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40})
		require.NoError(t, err)
		batch := store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{{InstanceID: instanceID, Type: database.LogInstanceEventTypeDamage, Events: make([]byte, eventBytes)}})
		batch.Exec(func(_ int, err error) { require.NoError(t, err) })
		return groupID
	}
	add(start.Add(-time.Nanosecond), 3)
	add(start, 5)
	add(end, 7)
	rows, err := store.InfrastructureCostUserActivity(ctx, database.InfrastructureCostUserActivityParams{PeriodStart: database.Timestamptz(start), PeriodEnd: database.Timestamptz(end)})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, int64(1), rows[0].UploadedFiles)
	require.Equal(t, int64(1), rows[0].UploadedLogGroups)
	require.Equal(t, int64(100), rows[0].UploadedRawBytes)
	require.Equal(t, int64(50), rows[0].UploadedStoredBytes)
	require.Equal(t, int64(1), rows[0].ParsedInstances)
	require.Equal(t, int64(5), rows[0].MonthlyParsedBytes)
	require.Equal(t, int64(15), rows[0].CurrentParsedBytes)
}
