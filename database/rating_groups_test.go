package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRatingRealmGroupsMoveCurrentScoresAndRenownEvidence(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_bypass") }()
	store := database.NewQueries(conn)

	tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "Group Tenant", Slug: pgtype.Text{String: "groups-" + uuid.NewString()[:8], Valid: true},
		AvailableFormats: []string{},
	})
	require.NoError(t, err)
	otherTenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "Other Tenant", Slug: pgtype.Text{String: "groups-" + uuid.NewString()[:8], Valid: true},
		AvailableFormats: []string{},
	})
	require.NoError(t, err)
	tenantArg := uuid.NullUUID{UUID: tenant.ID, Valid: true}
	otherArg := uuid.NullUUID{UUID: otherTenant.ID, Valid: true}
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Group Server"})
	require.NoError(t, err)
	otherServer, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Other Group Server"})
	require.NoError(t, err)
	require.NoError(t, store.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: tenantArg}))
	require.NoError(t, store.SetServerTenant(ctx, database.SetServerTenantParams{ID: otherServer.ID, TenantID: otherArg}))
	sameTenantServer, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Same Tenant Other Server"})
	require.NoError(t, err)
	require.NoError(t, store.SetServerTenant(ctx, database.SetServerTenantParams{ID: sameTenantServer.ID, TenantID: tenantArg}))
	sameTenantRealm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID: uuid.New(), ServerID: sameTenantServer.ID, Name: "Same Tenant Other Realm",
	})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID: uuid.New(), ServerID: server.ID, Name: "Moving Realm",
	})
	require.NoError(t, err)
	otherRealm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID: uuid.New(), ServerID: otherServer.ID, Name: "Other Realm",
	})
	require.NoError(t, err)
	create := func(name string) database.RatingRealmGroup {
		t.Helper()
		group, err := store.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{
			ServerID: server.ID, TenantID: tenantArg, Name: name,
		})
		require.NoError(t, err)
		return group
	}
	early := create("Phase One")
	late := create("Phase Two")
	_, err = store.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{
		ServerID: otherServer.ID, TenantID: tenantArg, Name: "Wrong Tenant",
	})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	groups, err := store.ListRatingRealmGroups(ctx, tenantArg)
	require.NoError(t, err)
	require.Len(t, groups, 2)
	require.Equal(t, int64(0), mustAssignGroup(t, ctx, store, tenantArg, sameTenantRealm.ID, early.ID), "a group cannot cross servers")
	require.Equal(t, int64(0), mustAssignGroup(t, ctx, store, tenantArg, otherRealm.ID, early.ID))
	require.Equal(t, int64(0), mustAssignGroup(t, ctx, store, otherArg, realm.ID, early.ID))
	require.Equal(t, int64(1), mustAssignGroup(t, ctx, store, tenantArg, realm.ID, early.ID))

	killedAt := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	for _, ts := range []time.Time{killedAt.Add(-24 * time.Hour), killedAt} {
		_, err = store.InsertRenownKillFact(ctx, database.InsertRenownKillFactParams{
			RealmID: realm.ID, PlayerGuid: "player-a", RunID: uuid.New(),
			InstanceName: "Molten Core", EncounterName: "Ragnaros", KilledAt: database.Timestamptz(ts),
		})
		require.NoError(t, err)
	}
	gen, err := store.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{
		TenantID: tenant.ID, PolicyVersion: 1, AsOf: database.Timestamptz(killedAt),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertRatingBossScore(ctx, database.InsertRatingBossScoreParams{
		GenerationID: gen.ID, TenantID: tenant.ID, RealmID: realm.ID, GroupID: uuid.NullUUID{UUID: early.ID, Valid: true}, PlayerGuid: "player-a",
		InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Normal",
		MaxPlayers: 40, PlayerClass: "Warrior", PlayerSpec: "Fury", PlayerSubSpec: "",
		PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "all_time", Score: 91,
	}))
	activated, err := store.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{
		GenerationID: gen.ID, TenantID: tenant.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), activated)

	facts := func(group uuid.UUID, period bool) []database.ListGroupRenownFactsRow {
		t.Helper()
		args := database.ListGroupRenownFactsParams{
			TenantID: tenantArg, GroupID: group, AfterKilledAt: database.Timestamptz(time.Date(1, 1, 1, 0, 0, 0, 0, time.UTC)),
			AfterID: uuid.Nil, BatchSize: 10,
		}
		if period {
			args.WindowStart = database.Timestamptz(killedAt)
			args.WindowEnd = database.Timestamptz(killedAt.Add(24 * time.Hour))
		}
		rows, err := store.ListGroupRenownFacts(ctx, args)
		require.NoError(t, err)
		return rows
	}
	scores := func(group uuid.UUID) []database.RatingBossScore {
		t.Helper()
		rows, err := store.ListActiveGroupBossRatingScores(ctx, database.ListActiveGroupBossRatingScoresParams{
			TenantID: tenantArg, GroupID: group, InstanceName: "Molten Core", EncounterName: "Ragnaros",
			DifficultyName: "Normal", MaxPlayers: 40, PlayerClass: "Warrior", PlayerSpec: "Fury",
			PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "all_time", LimitCount: 10,
		})
		require.NoError(t, err)
		return rows
	}
	require.Len(t, facts(early.ID, false), 2)
	require.Len(t, facts(early.ID, true), 1)
	require.Len(t, scores(early.ID), 1)
	require.Equal(t, int64(1), mustAssignGroup(t, ctx, store, tenantArg, realm.ID, late.ID))
	require.Empty(t, facts(early.ID, false))
	require.Empty(t, scores(early.ID))
	require.Len(t, facts(late.ID, false), 2, "moving the realm does not discard earned facts")
	require.Len(t, facts(late.ID, true), 1)
	require.Empty(t, scores(late.ID), "old-group scores must not appear under the new policy before a rebuild")
	members, err := store.ListRatingRealmGroupMembers(ctx, database.ListRatingRealmGroupMembersParams{
		GroupID: late.ID, TenantID: tenantArg,
	})
	require.NoError(t, err)
	require.Len(t, members, 1)
	require.Equal(t, realm.ID, members[0].ID)
	_, err = store.DeleteRatingRealmGroup(ctx, database.DeleteRatingRealmGroupParams{GroupID: late.ID, TenantID: tenantArg})
	require.Error(t, err, "groups with members must not silently discard assignments")
}

func mustAssignGroup(t *testing.T, ctx context.Context, store interface {
	AssignRatingRealmToGroup(context.Context, database.AssignRatingRealmToGroupParams) (int64, error)
}, tenant uuid.NullUUID, realm, group uuid.UUID) int64 {
	t.Helper()
	count, err := store.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{
		TenantID: tenant, RealmID: realm, GroupID: group,
	})
	require.NoError(t, err)
	return count
}
