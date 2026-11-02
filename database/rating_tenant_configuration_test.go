package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTenantRatingConfigurationRevisionAndRLS(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	root, other := uuid.Nil, uuid.New()
	policy := database.PutTenantRatingPolicyParams{
		TenantID: root, Version: 1, HalfLifeDays: 7,
		BestWeight: .5, FormWeight: .3, FloorWeight: .2,
		RankOneWeight: .5, FullRankKills: 5,
	}
	written, err := store.PutTenantRatingPolicy(ctx, policy)
	require.NoError(t, err)
	require.EqualValues(t, 1, written)
	revision, err := store.GetRatingConfigRevision(ctx, root)
	require.NoError(t, err)
	require.EqualValues(t, 1, revision)

	// Identical writes may increment policy version but never roll it back.
	written, err = store.PutTenantRatingPolicy(ctx, policy)
	require.NoError(t, err)
	require.Zero(t, written)
	policy.Version = 2
	written, err = store.PutTenantRatingPolicy(ctx, policy)
	require.NoError(t, err)
	require.EqualValues(t, 1, written)
	revision, err = store.GetRatingConfigRevision(ctx, root)
	require.NoError(t, err)
	require.EqualValues(t, 2, revision)

	boss := database.PutTenantRenownBossParams{TenantID: root, InstanceName: "Zul'Gurub", EncounterName: "Gri'lek", RenownPoints: 1}
	written, err = store.PutTenantRenownBoss(ctx, boss)
	require.NoError(t, err)
	require.EqualValues(t, 1, written)
	bosses, err := store.ListTenantRenownBosses(ctx, root)
	require.NoError(t, err)
	require.Len(t, bosses, 1)
	require.Equal(t, "Gri'lek", bosses[0].EncounterName)
	boss.EncounterName = "Hazza'rah"
	written, err = store.PutTenantRenownBoss(ctx, boss)
	require.NoError(t, err)
	require.EqualValues(t, 1, written, "Edge variants are distinct bosses")
	bosses, err = store.ListTenantRenownBosses(ctx, root)
	require.NoError(t, err)
	require.Len(t, bosses, 2)
	revision, err = store.GetRatingConfigRevision(ctx, root)
	require.NoError(t, err)
	require.EqualValues(t, 4, revision)

	// Root cannot read or insert another tenant's policy or curated boss.
	_, err = store.GetTenantRatingPolicy(ctx, other)
	require.Error(t, err)
	policy.TenantID = other
	_, err = store.PutTenantRatingPolicy(ctx, policy)
	require.Error(t, err)
	boss.TenantID = other
	_, err = store.PutTenantRenownBoss(ctx, boss)
	require.Error(t, err)
}
