package chronicle

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestReconcileLogGroupVisibilityPublishesStoredCohortFacts(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	chron := &Chronicle{Zed: zed}

	ownerID, realmID := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	logGroupID := insertVisibilityTestLogGroup(t, ctx, store, ownerID, true)
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
		DamageDone: 1000, DurationSecs: 60, Dps: 100, LogHashedSlug: "private-publication", KilledAt: database.Timestamptz(startedAt.Add(time.Minute)),
	}))

	require.NoError(t, chron.ReconcileLogGroupVisibility(ctx, logGroupID, false))
	requireVisibilityMembershipCounts(t, ctx, store, 0, 0, 0)

	_, err = zed.UpdateWoWLogGroupPrivacy(ctx, database.UpdateWoWLogGroupPrivacyParams{ID: logGroupID, Private: false})
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileLogGroupVisibility(ctx, logGroupID, true))
	requireVisibilityMembershipCounts(t, ctx, store, 1, 1, 1)

	_, err = zed.UpdateWoWLogGroupPrivacy(ctx, database.UpdateWoWLogGroupPrivacyParams{ID: logGroupID, Private: true})
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileLogGroupVisibility(ctx, logGroupID, false))
	requireVisibilityMembershipCounts(t, ctx, store, 0, 0, 0)
}

func TestReconcileLogGroupVisibilityLinksPublishedDuplicates(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	chron := &Chronicle{Zed: zed}

	ownerID, realmID := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	startedAt := time.Now().UTC().Add(-time.Hour)
	publicLogID := insertVisibilityTestLogGroup(t, ctx, store, ownerID, false)
	privateLogID := insertVisibilityTestLogGroup(t, ctx, store, ownerID, true)
	publicInstanceID := insertVisibilityTestInstance(t, ctx, store, publicLogID, realmID, "Molten Core", startedAt)
	privateInstanceID := insertVisibilityTestInstance(t, ctx, store, privateLogID, realmID, "Molten Core", startedAt.Add(time.Minute))

	for _, instanceID := range []uuid.UUID{publicInstanceID, privateInstanceID} {
		batch := store.InsertInstancePlayers(ctx, []database.InsertInstancePlayersParams{
			{InstanceID: instanceID, UnitGuid: guid.GUID(1), Name: "One", Level: 60, Class: database.WowPlayableClassMAGE, Race: database.WowPlayableRaceHuman},
			{InstanceID: instanceID, UnitGuid: guid.GUID(2), Name: "Two", Level: 60, Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceHuman},
		})
		require.NoError(t, batch.Close())
	}

	require.NoError(t, chron.ReconcileLogGroupVisibility(ctx, privateLogID, false))
	privateInstance, err := store.Instance(ctx, privateInstanceID)
	require.NoError(t, err)
	require.False(t, privateInstance.DuplicateGroupID.Valid)

	_, err = zed.UpdateWoWLogGroupPrivacy(ctx, database.UpdateWoWLogGroupPrivacyParams{ID: privateLogID, Private: false})
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileLogGroupVisibility(ctx, privateLogID, true))

	publicInstance, err := store.Instance(ctx, publicInstanceID)
	require.NoError(t, err)
	privateInstance, err = store.Instance(ctx, privateInstanceID)
	require.NoError(t, err)
	require.True(t, publicInstance.DuplicateGroupID.Valid)
	require.True(t, privateInstance.DuplicateGroupID.Valid)
	require.Equal(t, publicInstance.DuplicateGroupID.UUID, privateInstance.DuplicateGroupID.UUID)

	_, err = zed.UpdateWoWLogGroupPrivacy(ctx, database.UpdateWoWLogGroupPrivacyParams{ID: privateLogID, Private: true})
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileLogGroupVisibility(ctx, privateLogID, false))
	privateInstance, err = store.Instance(ctx, privateInstanceID)
	require.NoError(t, err)
	require.False(t, privateInstance.DuplicateGroupID.Valid)

	_, err = zed.UpdateWoWLogGroupPrivacy(ctx, database.UpdateWoWLogGroupPrivacyParams{ID: privateLogID, Private: false})
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileLogGroupVisibility(ctx, privateLogID, true))
	privateInstance, err = store.Instance(ctx, privateInstanceID)
	require.NoError(t, err)
	require.True(t, privateInstance.DuplicateGroupID.Valid)
	require.Equal(t, publicInstance.DuplicateGroupID.UUID, privateInstance.DuplicateGroupID.UUID)
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

func insertVisibilityTestLogGroup(t *testing.T, ctx context.Context, store database.Store, ownerID uuid.UUID, private bool) uuid.UUID {
	t.Helper()
	logGroupID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: ownerID, LogType: database.LogTypeV1, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	if private {
		_, err = store.UpdateWoWLogGroupPrivacy(ctx, database.UpdateWoWLogGroupPrivacyParams{ID: logGroupID, Private: true})
		require.NoError(t, err)
	}
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

func requireVisibilityMembershipCounts(t *testing.T, ctx context.Context, store database.Store, parseCount, clearCount, bossCount int) {
	t.Helper()
	parseMemberships, err := store.ListParseScoreMemberships(ctx, database.ListParseScoreMembershipsParams{
		TenantID: uuid.Nil, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	require.Len(t, parseMemberships, parseCount)
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
