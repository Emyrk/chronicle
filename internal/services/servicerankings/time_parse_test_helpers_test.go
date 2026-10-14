package servicerankings_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// setupTimeParseTest creates a realm with tenant bypass and returns pool, store, and realmID.
func setupTimeParseTest(t *testing.T) (*pgxpool.Pool, database.Store, uuid.UUID) {
	t.Helper()

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID := uuid.New()
	realmID := uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "test-server")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "test-realm")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)
	conn.Release()

	return pool, store, realmID
}

func insertTimeParseTenantRealm(t *testing.T, pool *pgxpool.Pool, name string) (uuid.UUID, uuid.UUID) {
	t.Helper()

	ctx := testutil.Context(t, testutil.WaitShort)
	tenantID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO tenants (id, slug, name, include_in_all) VALUES ($1, $2, $3, true)", tenantID, name, name)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", serverID, name+"-server", tenantID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, name+"-realm")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)

	return tenantID, realmID
}

// insertTimeParseInstance creates a log_instance, an instance_speedrun, and
// optional encounters. Returns the instance ID.
type timeParseInstanceOpts struct {
	instanceName   string
	difficultyName string
	maxPlayers     int32
	qualified      bool
	durationMs     int64
	startTime      time.Time
	encounters     []timeParseEncounterOpts
	// duplicateGroupID if set, links this instance to a duplicate group.
	duplicateGroupID uuid.NullUUID
}

type timeParseEncounterOpts struct {
	name      string
	killType  database.KillType
	boss      bool
	startTime time.Time
	endTime   time.Time
}

func insertTimeParseInstance(t *testing.T, pool *pgxpool.Pool, store database.Store, realmID uuid.UUID, opts timeParseInstanceOpts) uuid.UUID {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "u-" + userID.String()[:8],
	})
	require.NoError(t, err)

	logGroupID := uuid.New()
	now := time.Now()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	err = store.InsertParsedLogGroup(ctx, logGroupID)
	require.NoError(t, err)

	instanceID := uuid.New()
	completionTime := opts.startTime.Add(time.Duration(opts.durationMs) * time.Millisecond)
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID:             instanceID,
		RealmID:        realmID,
		LogGroupID:     logGroupID,
		Name:           opts.instanceName,
		Capabilities:   []string{},
		StartTime:      database.Timestamptz(opts.startTime),
		EndTime:        database.Timestamptz(completionTime),
		DifficultyName: opts.difficultyName,
		MaxPlayers:     opts.maxPlayers,
	})
	require.NoError(t, err)

	// Set duplicate_group_id if provided.
	if opts.duplicateGroupID.Valid {
		conn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = conn.Exec(ctx, "UPDATE log_instances SET duplicate_group_id = $1 WHERE id = $2",
			opts.duplicateGroupID.UUID, instanceID)
		require.NoError(t, err)
		conn.Release()
	}

	err = store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID:   instanceID,
		InstanceName: opts.instanceName,
		RealmID:      realmID,
		Qualified:    opts.qualified,
		StartTime:    database.Timestamptz(opts.startTime),
		CompletionTime: pgtype.Timestamptz{
			Time:  completionTime,
			Valid: opts.durationMs > 0,
		},
		DurationMs: opts.durationMs,
		RankedStartTime: pgtype.Timestamptz{
			Time:  opts.startTime,
			Valid: opts.durationMs > 0,
		},
		RankedCompletionTime: pgtype.Timestamptz{
			Time:  completionTime,
			Valid: opts.durationMs > 0,
		},
		RankedDurationMs: pgtype.Int8{Int64: opts.durationMs, Valid: opts.durationMs > 0},
		Proof:            []byte("{}"),
	})
	require.NoError(t, err)

	for _, enc := range opts.encounters {
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID:         uuid.New(),
			InstanceID: instanceID,
			Name:       enc.name,
			KillType:   enc.killType,
			Remaining:  guid.GUIDs{},
			Boss:       enc.boss,
			StartTime:  database.Timestamptz(enc.startTime),
			EndTime:    database.Timestamptz(enc.endTime),
		})
		require.NoError(t, err)
	}

	return instanceID
}

// runTimeParseWorker refreshes current-known memberships for every test log.
func runTimeParseWorker(t *testing.T, ctx context.Context, store database.Store, _ uuid.UUID, _ time.Time, _ int32) {
	t.Helper()
	groups, err := store.ListAllWoWLogGroupsWithOwner(ctx)
	require.NoError(t, err)
	for _, group := range groups {
		_, err = store.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
			LogGroupID: group.WoWLogGroup.ID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		})
		require.NoError(t, err)
		_, err = store.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
			LogGroupID: group.WoWLogGroup.ID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		})
		require.NoError(t, err)
	}
}
