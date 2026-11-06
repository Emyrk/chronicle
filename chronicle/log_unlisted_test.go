package chronicle

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestReconcileUnlistedLogGroupRemovesCohortMemberships(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	chron := &Chronicle{Zed: zed}

	ownerID, realmID := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	logGroupID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	instanceID := insertVisibilityTestInstance(t, ctx, store, logGroupID, realmID, "Blackwing Lair", time.Now().UTC())
	encounterID := uuid.New()
	startedAt := time.Now().UTC().Add(-time.Hour)
	_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
		ID: encounterID, InstanceID: instanceID, Name: "Razorgore", KillType: database.KillTypeClean,
		Remaining: guid.GUIDs{}, Boss: true, StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Minute)),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: instanceID, InstanceName: "Blackwing Lair", RealmID: realmID, Qualified: true,
		StartTime: database.Timestamptz(startedAt), CompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		DurationMs: int64(time.Hour / time.Millisecond), RankedStartTime: database.Timestamptz(startedAt),
		RankedCompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		RankedDurationMs:     pgtype.Int8{Int64: int64(time.Hour / time.Millisecond), Valid: true},
		Proof:                []byte(`{"proof":[]}`),
	}))
	require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true}, InstanceID: instanceID,
		EncounterName: "Razorgore", InstanceName: "Blackwing Lair", PlayerGuid: "1", PlayerName: "Mage",
		PlayerClass: "Mage", PlayerSpec: "Frost", PlayerRole: "dps", PlayerLevel: 60,
		DifficultyName: "Normal", MaxPlayers: 40, RealmID: realmID, RealmName: "Test Realm",
		DamageDone: 1000, DurationSecs: 60, Dps: 100, LogHashedSlug: "unlisted-log", KilledAt: database.Timestamptz(startedAt.Add(time.Minute)),
	}))

	refreshVisibilityMemberships(t, ctx, store, logGroupID)
	requireVisibilityMembershipCounts(t, ctx, store, 1, 1)

	_, err = zed.MarkWoWLogGroupUnlisted(ctx, logGroupID)
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileUnlistedLogGroup(ctx, logGroupID))
	requireVisibilityMembershipCounts(t, ctx, store, 0, 0)

	_, err = store.GetInstanceSpeedrun(ctx, instanceID)
	require.NoError(t, err)
	rankings, err := store.InstanceRankingRecords(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, rankings, 1)
}

func TestTimeParseLifecycleInvalidationRemovesScoresAndRestoresMemberships(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	chron := &Chronicle{Zed: zed}

	ownerID, realmID := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	logGroupID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	startedAt := time.Now().UTC().Add(-time.Hour)
	instanceID := insertVisibilityTestInstance(t, ctx, store, logGroupID, realmID, "Blackwing Lair", startedAt)
	insertVisibilityTimeFacts(t, ctx, store, instanceID, realmID, "Blackwing Lair", "Razorgore", startedAt)
	refreshVisibilityMemberships(t, ctx, store, logGroupID)
	requireVisibilityMembershipCounts(t, ctx, store, 1, 1)
	insertVisibilityTimeParseScore(t, ctx, store, instanceID, instanceID, logGroupID, realmID, startedAt)

	require.NoError(t, chron.InvalidateWoWLogGroup(ctx, logGroupID, "test invalidation"))
	requireVisibilityMembershipCounts(t, ctx, store, 0, 0)
	_, err := store.GetTimeParseScoreForContract(ctx, visibilityTimeParseContract(instanceID))
	require.True(t, errors.Is(err, pgx.ErrNoRows))

	insertVisibilitySpeedrun(t, ctx, store, instanceID, realmID, "Blackwing Lair", startedAt)
	require.NoError(t, chron.ClearWoWLogGroupInvalidation(ctx, logGroupID))
	requireVisibilityMembershipCounts(t, ctx, store, 1, 1)
}

func TestTimeParseLifecycleInstanceDeletionRefreshesReplacement(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	chron := &Chronicle{Zed: zed}

	ownerID, realmID := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	startedAt := time.Now().UTC().Add(-time.Hour)
	firstLogGroupID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	secondLogGroupID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	firstInstanceID := insertVisibilityTestInstance(t, ctx, store, firstLogGroupID, realmID, "Molten Core", startedAt)
	secondInstanceID := insertVisibilityTestInstance(t, ctx, store, secondLogGroupID, realmID, "Molten Core", startedAt.Add(time.Minute))
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: firstInstanceID, Valid: true},
		Ids:              []uuid.UUID{firstInstanceID, secondInstanceID},
	}))
	insertVisibilityTimeFacts(t, ctx, store, firstInstanceID, realmID, "Molten Core", "Ragnaros", startedAt)
	insertVisibilityTimeFacts(t, ctx, store, secondInstanceID, realmID, "Molten Core", "Ragnaros", startedAt.Add(time.Minute))
	refreshVisibilityMemberships(t, ctx, store, firstLogGroupID)
	refreshVisibilityMemberships(t, ctx, store, secondLogGroupID)
	requireVisibilityMembershipCounts(t, ctx, store, 1, 1)

	memberships, err := store.ListTimeParseClearTimeMemberships(ctx, database.ListTimeParseClearTimeMembershipsParams{
		TenantID: uuid.Nil, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	require.Len(t, memberships, 1)
	deletedInstanceID := memberships[0].InstanceID
	deletedLogGroupID := firstLogGroupID
	replacementLogGroupID := secondLogGroupID
	replacementInstanceID := secondInstanceID
	if deletedInstanceID == secondInstanceID {
		deletedLogGroupID = secondLogGroupID
		replacementLogGroupID = firstLogGroupID
		replacementInstanceID = firstInstanceID
	}
	insertVisibilityTimeParseScore(t, ctx, store, deletedInstanceID, firstInstanceID, deletedLogGroupID, realmID, startedAt)
	replacementLogGroups, err := store.ListTimeParseReplacementLogGroups(ctx, database.ListTimeParseReplacementLogGroupsParams{
		RunID: uuid.NullUUID{UUID: firstInstanceID, Valid: true}, InstanceID: deletedInstanceID,
	})
	require.NoError(t, err)
	require.Contains(t, replacementLogGroups, replacementLogGroupID)

	_, err = store.DeleteLogInstanceByIDAndGroup(ctx, database.DeleteLogInstanceByIDAndGroupParams{
		ID: deletedInstanceID, LogGroupID: deletedLogGroupID,
	})
	require.NoError(t, err)
	for _, replacementLogGroup := range replacementLogGroups {
		require.NoError(t, chron.refreshTimeParseMemberships(ctx, replacementLogGroup))
	}
	requireVisibilityMembershipCounts(t, ctx, store, 1, 1)
	memberships, err = store.ListTimeParseClearTimeMemberships(ctx, database.ListTimeParseClearTimeMembershipsParams{
		TenantID: uuid.Nil, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	require.Len(t, memberships, 1)
	require.Equal(t, replacementInstanceID, memberships[0].InstanceID)
	_, err = store.GetTimeParseScoreForContract(ctx, visibilityTimeParseContract(deletedInstanceID))
	require.True(t, errors.Is(err, pgx.ErrNoRows))
}

func TestReconcileUnlistedLogGroupUnlinksDuplicates(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	chron := &Chronicle{Zed: zed}

	ownerID, realmID := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	startedAt := time.Now().UTC().Add(-time.Hour)
	publicLogID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	unlistedLogID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	publicInstanceID := insertVisibilityTestInstance(t, ctx, store, publicLogID, realmID, "Molten Core", startedAt)
	unlistedInstanceID := insertVisibilityTestInstance(t, ctx, store, unlistedLogID, realmID, "Molten Core", startedAt.Add(time.Minute))

	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: publicInstanceID, Valid: true},
		Ids:              []uuid.UUID{publicInstanceID, unlistedInstanceID},
	}))
	_, err := zed.MarkWoWLogGroupUnlisted(ctx, unlistedLogID)
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileUnlistedLogGroup(ctx, unlistedLogID))

	unlistedInstance, err := store.Instance(ctx, unlistedInstanceID)
	require.NoError(t, err)
	require.False(t, unlistedInstance.DuplicateGroupID.Valid)
	publicInstance, err := store.Instance(ctx, publicInstanceID)
	require.NoError(t, err)
	require.True(t, publicInstance.DuplicateGroupID.Valid)
	require.Equal(t, publicInstanceID, publicInstance.DuplicateGroupID.UUID)
}

func insertVisibilityTestOwnerAndRealm(t *testing.T, ctx context.Context, store database.Store) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ownerID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "visibility-owner-" + ownerID.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "visibility-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "Test Realm"})
	require.NoError(t, err)
	return ownerID, realmID
}

func insertVisibilityTestLogGroup(t *testing.T, ctx context.Context, store database.Store, ownerID uuid.UUID) uuid.UUID {
	t.Helper()
	logGroupID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: ownerID, LogType: database.LogTypeV1, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	return logGroupID
}

func insertVisibilityTestInstance(t *testing.T, ctx context.Context, store database.Store, logGroupID, realmID uuid.UUID, name string, startedAt time.Time) uuid.UUID {
	t.Helper()
	instanceID := uuid.New()
	_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID, Name: name,
		StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Hour)),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)
	return instanceID
}

func insertVisibilityTimeFacts(t *testing.T, ctx context.Context, store database.Store, instanceID, realmID uuid.UUID, instanceName, encounterName string, startedAt time.Time) {
	t.Helper()
	_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
		ID: uuid.New(), InstanceID: instanceID, Name: encounterName, KillType: database.KillTypeClean,
		Remaining: guid.GUIDs{}, Boss: true, StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Minute)),
	})
	require.NoError(t, err)
	insertVisibilitySpeedrun(t, ctx, store, instanceID, realmID, instanceName, startedAt)
}

func insertVisibilitySpeedrun(t *testing.T, ctx context.Context, store database.Store, instanceID, realmID uuid.UUID, instanceName string, startedAt time.Time) {
	t.Helper()
	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: instanceID, InstanceName: instanceName, RealmID: realmID, Qualified: true,
		StartTime: database.Timestamptz(startedAt), CompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		DurationMs: int64(time.Hour / time.Millisecond), RankedStartTime: database.Timestamptz(startedAt),
		RankedCompletionTime: database.Timestamptz(startedAt.Add(time.Hour)),
		RankedDurationMs:     pgtype.Int8{Int64: int64(time.Hour / time.Millisecond), Valid: true},
		Proof:                []byte(`{"proof":[]}`),
	}))
}

func insertVisibilityTimeParseScore(t *testing.T, ctx context.Context, store database.Store, instanceID, runID, logGroupID, realmID uuid.UUID, cutoff time.Time) {
	t.Helper()
	_, err := store.InsertTimeParseScore(ctx, database.InsertTimeParseScoreParams{
		TenantID: uuid.Nil, InstanceID: instanceID, RunID: runID,
		LogGroupID: uuid.NullUUID{UUID: logGroupID, Valid: true}, RealmID: realmID,
		Cutoff: database.Timestamptz(cutoff), WindowStart: database.Timestamptz(cutoff.AddDate(0, 0, -60)),
		LookbackDays: 60, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
}

func visibilityTimeParseContract(instanceID uuid.UUID) database.GetTimeParseScoreForContractParams {
	return database.GetTimeParseScoreForContractParams{
		TenantID: uuid.Nil, InstanceID: instanceID, LookbackDays: 60,
		PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	}
}

func refreshVisibilityMemberships(t *testing.T, ctx context.Context, store database.Store, logGroupID uuid.UUID) {
	t.Helper()
	_, err := store.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
		LogGroupID: logGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	_, err = store.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
		LogGroupID: logGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
}

func requireVisibilityMembershipCounts(t *testing.T, ctx context.Context, store database.Store, clearCount, bossCount int) {
	t.Helper()
	clearMemberships, err := store.ListTimeParseClearTimeMemberships(ctx, database.ListTimeParseClearTimeMembershipsParams{
		TenantID: uuid.Nil, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	require.Len(t, clearMemberships, clearCount)
	bossMemberships, err := store.ListTimeParseBossKillMemberships(ctx, database.ListTimeParseBossKillMembershipsParams{
		TenantID: uuid.Nil, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	require.Len(t, bossMemberships, bossCount)
}
