package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestBuildTenantRatingsPolicyAndPublication(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	fixture := database.New(pool)
	tenant, err := fixture.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "Compute Tenant", Slug: pgtype.Text{String: "compute-" + uuid.NewString()[:8], Valid: true}, AvailableFormats: []string{},
	})
	require.NoError(t, err)
	tenantArg := tenant.ID
	server, err := fixture.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Compute Server"})
	require.NoError(t, err)
	realm, err := fixture.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Compute Realm"})
	require.NoError(t, err)
	otherRealm, err := fixture.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Other Realm"})
	require.NoError(t, err)
	asOf := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	recent := asOf.Add(-24 * time.Hour)
	var lockedInstance, lockedRun uuid.UUID
	for _, row := range []struct {
		realm    uuid.UUID
		player   string
		dps, hps float64
	}{
		{realm.ID, "player-a", 1000, 100},
		{realm.ID, "player-b", 500, 50},
		{otherRealm.ID, "player-c", 2000, 200},
	} {
		instance := uuid.New()
		insertRankingRow(t, pool, fixture, row.realm, rankingOpts{
			instanceID: instance, instanceName: "Molten Core", encounterName: "Ragnaros", playerGUID: row.player,
			playerClass: "SHAMAN", playerSpec: "Enhancement", playerSubSpec: "Two-Handed", difficultyName: "Normal",
			maxPlayers: 40, damageDone: int64(row.dps * 10), healingDone: int64(row.hps * 10),
			durationSecs: 10, dps: row.dps, hps: row.hps, killedAt: recent, isBoss: true,
		})
		sources, err := fixture.RankingRunSources(ctx, []uuid.UUID{instance})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = fixture.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
		if row.player == "player-a" {
			lockedInstance, lockedRun = instance, sources[0].RunID
		}
	}
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_bypass") }()
	q := database.NewQueries(conn)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenantArg, Valid: true}}))
	// Only locked parse results, not raw metrics alone, qualify for Mastery.
	require.NoError(t, q.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
		TenantID: tenant.ID, InstanceID: lockedInstance, RunID: lockedRun,
		EncounterName: "Ragnaros", PlayerGuid: "player-a", PlayerName: "Player A", PlayerClass: "SHAMAN",
		PlayerSpec: "Enhancement", PlayerSubSpec: "Two-Handed", Metric: "dps", MetricValue: 1000,
		PreciseScore: 92, DisplayScore: 92, Status: "ok", InstanceName: "Molten Core",
		DifficultyName: "Normal", MaxPlayers: 40, KilledAt: database.Timestamptz(recent),
	}))
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: server.ID, TenantID: tenantArg, Name: "Primary"})
	require.NoError(t, err)
	otherGroup, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: server.ID, TenantID: tenantArg, Name: "Other"})
	require.NoError(t, err)
	require.Equal(t, int64(1), mustAssignGroup(t, ctx, q, tenantArg, realm.ID, group.ID))
	require.Equal(t, int64(1), mustAssignGroup(t, ctx, q, tenantArg, otherRealm.ID, otherGroup.ID))
	for _, g := range []uuid.UUID{group.ID, otherGroup.ID} {
		affected, err := q.PutRatingGroupPolicy(ctx, database.PutRatingGroupPolicyParams{
			GroupID: g, TenantID: tenantArg, Version: 1, PeriodDays: 7, HalfLifeDays: 7,
			BestWeight: 1, FormWeight: 0, FloorWeight: 0, RankOneWeight: 1, FullRankKills: 1,
		})
		require.NoError(t, err)
		require.Equal(t, int64(1), affected)
		affected, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
			GroupID: g, TenantID: tenantArg, InstanceName: "Molten Core", EncounterName: "Ragnaros",
			PeakWeight: 1, MasteryWeight: 1, RenownPoints: 12, FinalBossBonus: 3,
		})
		require.NoError(t, err)
		require.Equal(t, int64(1), affected)
		affected, err = q.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
			GroupID: g, TenantID: tenantArg, InstanceName: "Molten Core", PeakWeight: 1, MasteryWeight: 1,
		})
		require.NoError(t, err)
		require.Equal(t, int64(1), affected)
	}
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, TenantID: tenantArg, InstanceName: "Molten Core", EncounterName: "Garr",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 12, FinalBossBonus: 3,
	})
	require.Error(t, err, "only one designated final boss per group and raid")
	policies, err := q.ListTenantRatingPolicies(ctx, tenantArg)
	require.NoError(t, err)
	require.Len(t, policies, 2)
	for _, policy := range policies {
		require.Equal(t, int32(3), policy.Version, "boss and raid eligibility bump the policy version")
	}
	unchanged, err := q.PutRatingGroupPolicy(ctx, database.PutRatingGroupPolicyParams{
		GroupID: group.ID, TenantID: tenantArg, Version: 1, PeriodDays: 7, HalfLifeDays: 7,
		BestWeight: 1, RankOneWeight: 1, FullRankKills: 1,
	})
	require.NoError(t, err)
	require.Zero(t, unchanged, "stale policy writes must not roll the version back")
	for _, ts := range []time.Time{asOf.Add(-10 * 24 * time.Hour), recent} {
		_, err = q.InsertRenownKillFact(ctx, database.InsertRenownKillFactParams{
			RealmID: realm.ID, PlayerGuid: "player-a", RunID: uuid.New(), InstanceName: "Molten Core",
			EncounterName: "Ragnaros", KilledAt: database.Timestamptz(ts),
		})
		require.NoError(t, err)
	}
	generation, count, err := ratingmath.BuildTenantRatings(ctx, q, tenant.ID, asOf, ratingmath.RebuildLimits{MaxRuns: 10, MaxFacts: 10})
	require.NoError(t, err)
	require.Positive(t, count)
	require.Equal(t, int32(3), generation.PolicyVersion)
	require.Equal(t, "building", generation.Status)
	scores := func(g uuid.UUID, metric, window, performance string) []database.RatingBossScore {
		t.Helper()
		rows, err := q.ListGroupRatingBossScores(ctx, database.ListGroupRatingBossScoresParams{
			TenantID: tenant.ID, GroupID: g, RatingMetric: metric, WindowKind: window,
			PerformanceMetric: performance, PlayerClass: "SHAMAN", PlayerSpec: "Enhancement",
			PlayerSubSpec: "Two-Handed", LimitCount: 10,
		})
		require.NoError(t, err)
		return rows
	}
	require.Empty(t, scores(group.ID, "peak", "period", "dps"), "building scores remain invisible")
	// Publication uses the same transactional path as production, with a local RLS bypass.
	require.NoError(t, fixture.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'"); err != nil {
			return err
		}
		return ratingmath.PublishTenantRatings(ctx, tx, tenant.ID, generation.ID)
	}, nil))
	for _, metric := range []struct {
		name      string
		high, low float64
	}{{"dps", 1000, 500}, {"hps", 100, 50}} {
		rows := scores(group.ID, "peak", "period", metric.name)
		require.Len(t, rows, 2)
		require.Equal(t, "player-a", rows[0].PlayerGuid)
		require.InDelta(t, 100, rows[0].Score, 0.0001)
		require.InDelta(t, metric.high, rows[0].BestRaw.Float64, 0.0001)
		require.InDelta(t, metric.high, rows[1].RankOneRaw.Float64, 0.0001)
		require.Equal(t, "player-b", rows[1].PlayerGuid)
		require.InDelta(t, 50, rows[1].Score, 0.0001)
		require.InDelta(t, metric.low, rows[1].BestRaw.Float64, 0.0001)
		require.Len(t, scores(group.ID, "peak", "all_time", metric.name), 2)
		require.Len(t, scores(otherGroup.ID, "peak", "period", metric.name), 1)
	}
	mastery := scores(group.ID, "mastery", "period", "dps")
	require.Len(t, mastery, 1)
	require.Equal(t, "player-a", mastery[0].PlayerGuid)
	require.InDelta(t, 92, mastery[0].Score, 0.0001)
	require.InDelta(t, 92, mastery[0].BestLockedParse.Float64, 0.0001)
	require.Equal(t, int32(1), mastery[0].EligibleKills)
	require.Empty(t, scores(group.ID, "mastery", "period", "hps"))
	require.Empty(t, scores(otherGroup.ID, "mastery", "period", "dps"))
	// Renown is independent of spec/class and counts durable kills even outside the period.
	renown := func(window string) database.RatingBossScore {
		t.Helper()
		rows, err := q.ListActiveGroupBossRatingScores(ctx, database.ListActiveGroupBossRatingScoresParams{
			TenantID: tenantArg, GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
			PerformanceMetric: "none", RatingMetric: "renown", WindowKind: window, LimitCount: 10,
		})
		require.NoError(t, err)
		require.Len(t, rows, 2, "canonical run observations also earn Renown for both players")
		require.Equal(t, "player-a", rows[0].PlayerGuid)
		return rows[0]
	}
	require.InDelta(t, 30, renown("period").Score, 0.0001)
	require.Equal(t, int32(2), renown("period").EligibleKills)
	require.InDelta(t, 45, renown("career").Score, 0.0001)
	require.Equal(t, int32(3), renown("career").EligibleKills)
	scopeScores := func(g uuid.UUID, instance, rating, window, metric string) []database.RatingScopeScore {
		t.Helper()
		rows, err := q.ListActiveRatingScopeScores(ctx, database.ListActiveRatingScopeScoresParams{
			TenantID: tenantArg, GroupID: g, InstanceName: instance,
			DifficultyName: "Normal", MaxPlayers: 40, PlayerClass: "SHAMAN",
			PlayerSpec: "Enhancement", PlayerSubSpec: "Two-Handed", PerformanceMetric: metric,
			RatingMetric: rating, WindowKind: window, LimitCount: 10,
		})
		require.NoError(t, err)
		return rows
	}
	initialRaid := scopeScores(group.ID, "Molten Core", "peak", "period", "dps")
	require.Len(t, initialRaid, 2)
	require.Equal(t, 100.0, initialRaid[0].Score)
	require.Len(t, scopeScores(group.ID, "", "peak", "period", "dps"), 2, "global scope is stored independently")
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, TenantID: tenantArg, InstanceName: "Molten Core", EncounterName: "Garr",
		PeakWeight: 3, MasteryWeight: 3, RenownPoints: 12, FinalBossBonus: 0,
	})
	require.NoError(t, err)
	weightedGen, _, err := ratingmath.BuildTenantRatings(ctx, q, tenant.ID, asOf, ratingmath.RebuildLimits{MaxRuns: 10, MaxFacts: 20})
	require.NoError(t, err)
	require.NoError(t, fixture.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'"); err != nil {
			return err
		}
		return ratingmath.PublishTenantRatings(ctx, tx, tenant.ID, weightedGen.ID)
	}, nil))
	weightedRaid := scopeScores(group.ID, "Molten Core", "peak", "period", "dps")
	require.Len(t, weightedRaid, 2)
	require.Equal(t, 25.0, weightedRaid[0].Score, "missing eligible boss retains its weight in denominator")
	require.Equal(t, 25.0, scopeScores(group.ID, "", "peak", "period", "dps")[0].Score)
	masteryScope := scopeScores(group.ID, "Molten Core", "mastery", "period", "dps")
	require.Len(t, masteryScope, 1)
	require.Equal(t, 23.0, masteryScope[0].Score, "Mastery uses its separately configured boss weight")
	_, err = q.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
		GroupID: group.ID, TenantID: tenantArg, InstanceName: "Zul'Gurub", PeakWeight: 3, MasteryWeight: 3,
	})
	require.NoError(t, err)
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, TenantID: tenantArg, InstanceName: "Zul'Gurub", EncounterName: "Hakkar",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 10, FinalBossBonus: 2,
	})
	require.NoError(t, err)
	multiRaidGen, _, err := ratingmath.BuildTenantRatings(ctx, q, tenant.ID, asOf, ratingmath.RebuildLimits{MaxRuns: 10, MaxFacts: 20})
	require.NoError(t, err)
	require.NoError(t, fixture.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'"); err != nil {
			return err
		}
		return ratingmath.PublishTenantRatings(ctx, tx, tenant.ID, multiRaidGen.ID)
	}, nil))
	require.Equal(t, 25.0, scopeScores(group.ID, "Molten Core", "peak", "period", "dps")[0].Score)
	require.Equal(t, 6.25, scopeScores(group.ID, "", "peak", "period", "dps")[0].Score,
		"missing eligible raid contributes zero to fixed global denominator")
	// A later failed build can leave a building generation but must never publish it.
	failed, _, err := ratingmath.BuildTenantRatings(ctx, q, tenant.ID, asOf, ratingmath.RebuildLimits{MaxRuns: 1, MaxFacts: 10})
	require.ErrorContains(t, err, "safety bound")
	require.NotEqual(t, uuid.Nil, failed.ID)
	require.Empty(t, scores(otherGroup.ID, "mastery", "period", "dps"))
	require.Len(t, scores(group.ID, "peak", "period", "dps"), 2)
	var status string
	require.NoError(t, conn.QueryRow(ctx, "SELECT status FROM rating_score_generations WHERE id = $1", failed.ID).Scan(&status))
	require.Equal(t, "building", status)
	// Moving a realm keeps earned facts, changes its competitive cohort, and
	// recalculates scores with the destination group's current policy.
	moved, err := q.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{
		RealmID: realm.ID, GroupID: otherGroup.ID, TenantID: tenantArg,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), moved)
	require.Empty(t, scores(group.ID, "peak", "period", "dps"), "old-group scores are not relabeled on a move")
	movedGeneration, _, err := ratingmath.BuildTenantRatings(ctx, q, tenant.ID, asOf, ratingmath.RebuildLimits{MaxRuns: 10, MaxFacts: 20})
	require.NoError(t, err)
	require.NoError(t, fixture.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'"); err != nil {
			return err
		}
		return ratingmath.PublishTenantRatings(ctx, tx, tenant.ID, movedGeneration.ID)
	}, nil))
	require.Empty(t, scores(group.ID, "peak", "period", "dps"))
	combined := scores(otherGroup.ID, "peak", "period", "dps")
	require.Len(t, combined, 3)
	require.Equal(t, "player-c", combined[0].PlayerGuid)
	require.InDelta(t, 50, combined[1].Score, 0.0001)
	require.InDelta(t, 25, combined[2].Score, 0.0001)
	movedFacts, err := q.ListActiveGroupBossRatingScores(ctx, database.ListActiveGroupBossRatingScoresParams{
		TenantID: tenantArg, GroupID: otherGroup.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		PerformanceMetric: "none", RatingMetric: "renown", WindowKind: "career", LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, movedFacts, 3)
	require.Equal(t, "player-a", movedFacts[0].PlayerGuid)
	require.Equal(t, 45.0, movedFacts[0].Score)
}

func TestBuildRootRealmRatings(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_bypass") }()
	q := database.NewQueries(conn)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Root Rating Server"})
	require.NoError(t, err)
	realm, err := q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Root Rating Realm"})
	require.NoError(t, err)
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: server.ID, Name: "Root Phase"})
	require.NoError(t, err)
	assigned, err := q.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{RealmID: realm.ID, GroupID: group.ID})
	require.NoError(t, err)
	require.Equal(t, int64(1), assigned)
	_, err = q.PutRatingGroupPolicy(ctx, database.PutRatingGroupPolicyParams{
		GroupID: group.ID, Version: 1, PeriodDays: 180, HalfLifeDays: 42,
		BestWeight: .3, FormWeight: .5, FloorWeight: .2,
		RankOneWeight: .65, FullRankKills: 5,
	})
	require.NoError(t, err)
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 12, FinalBossBonus: 3,
	})
	require.NoError(t, err)
	_, err = q.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
		GroupID: group.ID, InstanceName: "Molten Core", PeakWeight: 1, MasteryWeight: 1,
	})
	require.NoError(t, err)
	asOf := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	_, err = q.InsertRenownKillFact(ctx, database.InsertRenownKillFactParams{
		RealmID: realm.ID, PlayerGuid: "root-player", RunID: uuid.New(),
		InstanceName: "Molten Core", EncounterName: "Ragnaros", KilledAt: database.Timestamptz(asOf.Add(-time.Hour)),
	})
	require.NoError(t, err)
	tenants, err := q.ListRatingScoreTenants(ctx)
	require.NoError(t, err)
	require.Len(t, tenants, 1)
	require.False(t, tenants[0].Valid, "root-server policy must be dispatched even with NULL server tenant")
	gen, _, err := ratingmath.BuildTenantRatings(ctx, q, uuid.Nil, asOf, ratingmath.RebuildLimits{MaxRuns: 10, MaxFacts: 10})
	require.NoError(t, err)
	require.NoError(t, ratingmath.PublishTenantRatings(ctx, database.New(pool), uuid.Nil, gen.ID))
	rows, err := q.ListActiveGroupBossRatingScores(ctx, database.ListActiveGroupBossRatingScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID,
		InstanceName: "Molten Core", EncounterName: "Ragnaros", RatingMetric: "renown",
		PerformanceMetric: "none", WindowKind: "career", LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, 15.0, rows[0].Score)
}

func TestRatingGroupRLSFollowsServerTenant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	tenant, err := q.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "Rating Isolated Tenant", Slug: pgtype.Text{String: "riso-" + uuid.NewString()[:8], Valid: true},
		AvailableFormats: []string{},
	})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Rating Isolated Server"})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant.ID, Valid: true}}))
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: server.ID, TenantID: tenant.ID, Name: "Visible Group"})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_id") }()
	_, err = conn.Exec(ctx, "SET app.tenant_id = '"+tenant.ID.String()+"'")
	require.NoError(t, err)
	visible, err := q.ListRatingRealmGroups(ctx, tenant.ID)
	require.NoError(t, err)
	require.Len(t, visible, 1)
	require.Equal(t, group.ID, visible[0].ID)
	_, err = conn.Exec(ctx, "SET app.tenant_id = '"+uuid.NewString()+"'")
	require.NoError(t, err)
	hidden, err := q.ListRatingRealmGroups(ctx, tenant.ID)
	require.NoError(t, err)
	require.Empty(t, hidden, "RLS must hide another tenant's groups despite a forged tenant parameter")
}

func TestRatingRebuildConfigLockIsTransactional(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	first, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer first.Release()
	second, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer second.Release()
	tx, err := first.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	var triggerCount int
	require.NoError(t, tx.QueryRow(ctx, `SELECT count(*) FROM pg_trigger
		WHERE tgname IN ('rating_group_rebuild_lock', 'rating_membership_rebuild_lock',
		'rating_policy_rebuild_lock', 'rating_boss_policy_rebuild_lock', 'rating_raid_policy_rebuild_lock')`).Scan(&triggerCount))
	require.Equal(t, 5, triggerCount, "all configuration mutations share the rebuild fence")
	require.NoError(t, database.NewQueries(tx).AcquireRatingRebuildConfigLock(ctx))
	var acquired bool
	require.NoError(t, second.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(1131453276, 1)").Scan(&acquired))
	require.False(t, acquired, "a competing rebuild or config mutation must wait")
	require.NoError(t, tx.Commit(ctx))
	require.NoError(t, second.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(1131453276, 1)").Scan(&acquired))
	require.True(t, acquired, "the lock is released with the build transaction")
}
