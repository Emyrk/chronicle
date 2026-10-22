package retention

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/retentionpolicy"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestDeletionWorkerPreservesRawLogRecords(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Now().UTC()
	fixture := insertRetentionFixture(t, store, now.AddDate(-2, 0, 0), now.Add(-time.Hour), "raid")

	worker := &DeletionWorker{Store: store, Logger: discardLogger(), Now: func() time.Time { return now }}
	require.NoError(t, worker.Work(ctx, &river.Job[ArgsRetentionDeletion]{Args: ArgsRetentionDeletion{PageSize: 10}}))

	_, err := store.GetAuthoritativeRetentionCandidate(ctx, fixture.instanceID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	group, err := store.GetWoWLogGroupByID(ctx, fixture.logGroupID)
	require.NoError(t, err)
	require.Equal(t, fixture.logGroupID, group.WoWLogGroup.ID)
	files, err := store.GetWoWLogFilesByGroupID(ctx, fixture.logGroupID)
	require.NoError(t, err)
	require.Len(t, files, 1)
	require.False(t, files[0].StorageDeletedAt.Valid)
}

func TestDeletionWorkerAuthoritativeRecheckPreventsStaleDeletion(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Now().UTC()
	endTime := now.AddDate(-1, 0, 0)
	fixture := insertRetentionFixture(t, store, endTime, now.Add(-time.Hour), "dungeon")
	_, err := store.UpsertBillingEntitlement(ctx, database.UpsertBillingEntitlementParams{
		UserID: fixture.ownerID, Provider: "test", ProviderCustomerID: uuid.NewString(),
		ProviderEntitlementID: uuid.NewString(), EntitlementKey: retentionpolicy.EntitlementChronicleExalted,
	})
	require.NoError(t, err)

	worker := &DeletionWorker{Store: store, Logger: discardLogger(), Now: func() time.Time { return now }}
	require.NoError(t, worker.Work(ctx, &river.Job[ArgsRetentionDeletion]{Args: ArgsRetentionDeletion{PageSize: 10}}))

	instance, err := store.GetAuthoritativeRetentionCandidate(ctx, fixture.instanceID)
	require.NoError(t, err)
	require.WithinDuration(t, endTime.AddDate(3, 0, 0), instance.RetentionExpiresAt.Time, time.Microsecond)
}

func TestDeletionWorkerKeepsFastestSpeedrunAndDeletesSlowerRun(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Now().UTC()
	endTime := now.AddDate(-2, 0, 0)
	fixture := insertRetentionFixture(t, store, endTime, now.Add(-time.Hour), "raid")

	insertSpeedrun := func(instanceID uuid.UUID, duration time.Duration) {
		t.Helper()
		require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
			InstanceID: instanceID, InstanceName: "Retention Test", RealmID: fixture.realmID,
			GuildID: uuid.NullUUID{UUID: fixture.guildID, Valid: true}, Qualified: true,
			StartTime: database.Timestamptz(endTime.Add(-duration)), CompletionTime: database.Timestamptz(endTime),
			DurationMs:      int64(duration / time.Millisecond),
			RankedStartTime: database.Timestamptz(endTime.Add(-duration)), RankedCompletionTime: database.Timestamptz(endTime),
			RankedDurationMs: pgtype.Int8{Int64: int64(duration / time.Millisecond), Valid: true},
			Proof:            []byte(`{"proof":[]}`),
		}))
	}
	insertSpeedrun(fixture.instanceID, 30*time.Minute)

	fastestID := uuid.New()
	_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: fastestID, RealmID: fixture.realmID, LogGroupID: fixture.logGroupID, Name: "Retention Test",
		GuildID:   uuid.NullUUID{UUID: fixture.guildID, Valid: true},
		StartTime: database.Timestamptz(endTime.Add(-20 * time.Minute)), EndTime: database.Timestamptz(endTime),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		Category: pgtype.Text{String: "raid", Valid: true}, RetentionExpiresAt: database.Timestamptz(now.Add(-time.Hour)),
		RetentionPolicyKey: string(retentionpolicy.PolicyKeyDefault),
	})
	require.NoError(t, err)
	insertSpeedrun(fastestID, 20*time.Minute)

	worker := &DeletionWorker{Store: store, Logger: discardLogger(), Now: func() time.Time { return now }}
	require.NoError(t, worker.Work(ctx, &river.Job[ArgsRetentionDeletion]{Args: ArgsRetentionDeletion{PageSize: 10}}))

	_, err = store.GetAuthoritativeRetentionCandidate(ctx, fixture.instanceID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.GetAuthoritativeRetentionCandidate(ctx, fastestID)
	require.NoError(t, err)
}

type retentionFixture struct {
	ownerID, logGroupID, instanceID uuid.UUID
	realmID, guildID                uuid.UUID
}

func insertRetentionFixture(t *testing.T, store database.Store, endTime, storedExpiry time.Time, category string) retentionFixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitLong)
	now := time.Now().UTC()
	ownerID, serverID, realmID := uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "retention-" + ownerID.String(), Email: ownerID.String() + "@example.com"})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "retention-" + serverID.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "Retention Realm"})
	require.NoError(t, err)

	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID: realmID, Name: "Retention Guild", CreatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)

	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: ownerID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: uuid.New(), Owner: ownerID, WowLogID: logGroupID, Hash: uuid.NewString(), SizeBytes: 1,
		MimeType: "text/plain", CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)

	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID, Name: "Retention Test",
		GuildID:   uuid.NullUUID{UUID: guild.ID, Valid: true},
		StartTime: database.Timestamptz(endTime.Add(-time.Hour)), EndTime: database.Timestamptz(endTime),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		Category: pgtype.Text{String: category, Valid: true}, RetentionExpiresAt: database.Timestamptz(storedExpiry),
		RetentionPolicyKey: string(retentionpolicy.PolicyKeyDefault),
	})
	require.NoError(t, err)
	return retentionFixture{
		ownerID: ownerID, logGroupID: logGroupID, instanceID: instanceID,
		realmID: realmID, guildID: guild.ID,
	}
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
