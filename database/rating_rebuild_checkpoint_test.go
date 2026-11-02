package database_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRatingRebuildCheckpointRevisionAndPublish(t *testing.T) {
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
	tenant, err := q.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "Checkpoint Tenant", Slug: pgtype.Text{String: "checkpoint-" + uuid.NewString()[:8], Valid: true}, AvailableFormats: []string{},
	})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Checkpoint Server"})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant.ID, Valid: true}}))
	realm, err := q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Checkpoint Realm"})
	require.NoError(t, err)
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: server.ID, TenantID: tenant.ID, Name: "Original"})
	require.NoError(t, err)
	require.Equal(t, int64(1), mustAssignGroup(t, ctx, q, tenant.ID, realm.ID, group.ID))
	_, err = q.PutRatingGroupPolicy(ctx, database.PutRatingGroupPolicyParams{
		TenantID: tenant.ID, GroupID: group.ID, Version: 1, PeriodDays: 30,
		HalfLifeDays: 10, BestWeight: 0.5, FormWeight: 0.3, FloorWeight: 0.2,
		RankOneWeight: 0.5, FullRankKills: 5,
	})
	require.NoError(t, err)
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		TenantID: tenant.ID, GroupID: group.ID, InstanceName: "Raid", EncounterName: "Boss",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 1,
	})
	require.NoError(t, err)
	_, err = q.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
		TenantID: tenant.ID, GroupID: group.ID, InstanceName: "Raid", PeakWeight: 1, MasteryWeight: 1,
	})
	require.NoError(t, err)

	asOf := database.Timestamptz(time.Now().UTC().Truncate(time.Second))
	start := database.StartRatingRebuildParams{TenantID: tenant.ID, PolicyVersion: 1, AsOf: asOf, SourceCutoff: asOf}
	previous, err := q.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{TenantID: tenant.ID, PolicyVersion: 1, AsOf: asOf})
	require.NoError(t, err)
	activated, err := q.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{GenerationID: previous.ID, TenantID: tenant.ID})
	require.NoError(t, err)
	require.Equal(t, int64(1), activated)
	first, err := q.StartRatingRebuild(ctx, start)
	require.NoError(t, err)
	again, err := q.StartRatingRebuild(ctx, start)
	require.NoError(t, err)
	require.Equal(t, first, again, "only one building generation per tenant")
	cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant.ID, GenerationID: first})
	require.NoError(t, err)
	require.True(t, asOf.Time.Equal(cp.SourceCutoff.Time))
	require.True(t, asOf.Time.Equal(cp.AsOf.Time))
	require.Equal(t, "runs", cp.Phase)
	var manifest struct {
		Groups []struct {
			Name string `json:"name"`
		} `json:"groups"`
		Memberships  []json.RawMessage `json:"memberships"`
		Policies     []json.RawMessage `json:"policies"`
		BossPolicies []json.RawMessage `json:"boss_policies"`
		RaidPolicies []json.RawMessage `json:"raid_policies"`
	}
	require.NoError(t, json.Unmarshal(cp.Manifest, &manifest))
	require.Equal(t, "Original", manifest.Groups[0].Name)
	require.Len(t, manifest.Memberships, 1)
	require.Len(t, manifest.Policies, 1)
	require.Len(t, manifest.BossPolicies, 1)
	require.Len(t, manifest.RaidPolicies, 1)

	advance := database.AdvanceRatingRebuildCheckpointParams{
		TenantID: tenant.ID, GenerationID: first, ExpectedPhase: "runs", ExpectedCursor: []byte(`{}`),
		NextPhase: "ready", NextCursor: []byte(`{"run":"done"}`),
	}
	n, err := q.AdvanceRatingRebuildCheckpoint(ctx, advance)
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	n, err = q.AdvanceRatingRebuildCheckpoint(ctx, advance)
	require.NoError(t, err)
	require.Zero(t, n, "stale cursor cannot overwrite progress")
	_, err = q.RenameRatingRealmGroup(ctx, database.RenameRatingRealmGroupParams{TenantID: tenant.ID, GroupID: group.ID, Name: "Changed"})
	require.NoError(t, err)
	published, err := q.PublishRatingRebuild(ctx, database.PublishRatingRebuildParams{GenerationID: first, TenantID: tenant.ID})
	require.NoError(t, err)
	require.False(t, published, "config edit during build cannot publish")
	var activeBefore uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT id FROM rating_score_generations WHERE tenant_id=$1 AND status='active'", tenant.ID).Scan(&activeBefore))
	require.Equal(t, previous.ID, activeBefore, "stale publish keeps previous active generation")
	cp, err = q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant.ID, GenerationID: first})
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(cp.Manifest, &manifest))
	require.Equal(t, "Original", manifest.Groups[0].Name, "snapshot remains stable")
	_, err = q.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{GenerationID: first, TenantID: tenant.ID})
	require.Error(t, err, "legacy activation must not bypass the revision gate")
	retired, err := q.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{GenerationID: first, TenantID: tenant.ID})
	require.NoError(t, err)
	require.Equal(t, int64(1), retired)
	second, err := q.StartRatingRebuild(ctx, start)
	require.NoError(t, err)
	require.NotEqual(t, first, second)
	advance.GenerationID = second
	n, err = q.AdvanceRatingRebuildCheckpoint(ctx, advance)
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	published, err = q.PublishRatingRebuild(ctx, database.PublishRatingRebuildParams{GenerationID: second, TenantID: tenant.ID})
	require.NoError(t, err)
	require.True(t, published)
	var active uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT id FROM rating_score_generations WHERE tenant_id=$1 AND status='active'", tenant.ID).Scan(&active))
	require.Equal(t, second, active)
}

func TestRatingConfigRevisionCoversRootEdits(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	root := uuid.Nil
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Root Revision Server"})
	require.NoError(t, err)
	realm, err := q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Root Revision Realm"})
	require.NoError(t, err)
	var revision int64
	readRevision := func() int64 {
		t.Helper()
		require.NoError(t, conn.QueryRow(ctx, "SELECT revision FROM rating_config_revisions WHERE tenant_id=$1", root).Scan(&revision))
		return revision
	}
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: server.ID, TenantID: root, Name: "Root A"})
	require.NoError(t, err)
	last := readRevision()
	changed := func() { t.Helper(); next := readRevision(); require.Greater(t, next, last); last = next }
	_, err = q.RenameRatingRealmGroup(ctx, database.RenameRatingRealmGroupParams{TenantID: root, GroupID: group.ID, Name: "Root B"})
	require.NoError(t, err)
	changed()
	require.Equal(t, int64(1), mustAssignGroup(t, ctx, q, root, realm.ID, group.ID))
	changed()
	_, err = q.PutRatingGroupPolicy(ctx, database.PutRatingGroupPolicyParams{
		TenantID: root, GroupID: group.ID, Version: 1, PeriodDays: 30, HalfLifeDays: 10,
		BestWeight: 0.5, FormWeight: 0.3, FloorWeight: 0.2, RankOneWeight: 0.5, FullRankKills: 5,
	})
	require.NoError(t, err)
	changed()
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		TenantID: root, GroupID: group.ID, InstanceName: "Raid", EncounterName: "Boss",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 1,
	})
	require.NoError(t, err)
	changed()
	_, err = q.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
		TenantID: root, GroupID: group.ID, InstanceName: "Raid", PeakWeight: 1, MasteryWeight: 1,
	})
	require.NoError(t, err)
	changed()
	_, err = q.DeleteRatingRaidPolicy(ctx, database.DeleteRatingRaidPolicyParams{TenantID: root, GroupID: group.ID, InstanceName: "Raid"})
	require.NoError(t, err)
	changed()
	_, err = q.DeleteRatingBossPolicy(ctx, database.DeleteRatingBossPolicyParams{TenantID: root, GroupID: group.ID, InstanceName: "Raid", EncounterName: "Boss"})
	require.NoError(t, err)
	changed()
	_, err = q.UnassignRatingRealmFromGroup(ctx, database.UnassignRatingRealmFromGroupParams{TenantID: root, RealmID: realm.ID})
	require.NoError(t, err)
	changed()
	_, err = q.DeleteRatingRealmGroup(ctx, database.DeleteRatingRealmGroupParams{TenantID: root, GroupID: group.ID})
	require.NoError(t, err)
	changed()
}
