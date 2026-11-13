package database_test

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type lockedDatasetResolution struct {
	datasetID        uuid.UUID
	revision         int64
	defaultFlavor    []string
	additionalFlavor []string
}

func lockDatasetResolutionForTest(
	t *testing.T,
	ctx context.Context,
	q database.StoreQueries,
	realmID uuid.UUID,
	fallbackDatasetID uuid.UUID,
) lockedDatasetResolution {
	t.Helper()
	serverID, err := q.LockRealmDatasetResolution(ctx, realmID)
	require.NoError(t, err)
	server, err := q.LockServerDatasetResolution(ctx, serverID)
	require.NoError(t, err)

	datasetID := fallbackDatasetID
	var additionalFlavor []string
	if server.TenantID.Valid {
		tenant, err := q.LockTenantDatasetResolution(ctx, server.TenantID.UUID)
		require.NoError(t, err)
		additionalFlavor = tenant.AdditionalFlavor
		if tenant.TenantDatasetID.Valid && tenant.TenantDatasetID.UUID != uuid.Nil {
			datasetID = tenant.TenantDatasetID.UUID
		}
	}
	if server.ServerDatasetID.Valid && server.ServerDatasetID.UUID != uuid.Nil {
		datasetID = server.ServerDatasetID.UUID
	}

	dataset, err := q.LockDatasetForResolution(ctx, datasetID)
	require.NoError(t, err)
	return lockedDatasetResolution{
		datasetID:        datasetID,
		revision:         dataset.Revision,
		defaultFlavor:    dataset.DefaultFlavor,
		additionalFlavor: additionalFlavor,
	}
}

func TestLockedDatasetResolutionPrecedenceAndFallback(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	fallback := insertRevisionDataset(t, store, "resolution-fallback")
	tenantDataset := insertRevisionDataset(t, store, "resolution-tenant")
	serverDataset := insertRevisionDataset(t, store, "resolution-server")

	tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID:               uuid.New(),
		Name:             "Resolution Tenant",
		Slug:             pgtype.Text{String: "resolution-tenant", Valid: true},
		IncludeInAll:     true,
		AvailableFormats: []string{},
		AdditionalFlavor: []string{"tenant-extra"},
	})
	require.NoError(t, err)
	require.NoError(t, store.SetTenantDataset(ctx, database.SetTenantDatasetParams{
		ID:               tenant.ID,
		DefaultDatasetID: uuid.NullUUID{UUID: tenantDataset.ID, Valid: true},
	}))

	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Resolution Server"})
	require.NoError(t, err)
	require.NoError(t, store.SetServerTenant(ctx, database.SetServerTenantParams{
		ID:       server.ID,
		TenantID: uuid.NullUUID{UUID: tenant.ID, Valid: true},
	}))
	require.NoError(t, store.SetServerDataset(ctx, database.SetServerDatasetParams{
		ID:               server.ID,
		DefaultDatasetID: uuid.NullUUID{UUID: serverDataset.ID, Valid: true},
	}))
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:       uuid.New(),
		ServerID: server.ID,
		Name:     "Resolution Realm",
	})
	require.NoError(t, err)

	resolve := func() lockedDatasetResolution {
		t.Helper()
		tx, err := pool.Begin(ctx)
		require.NoError(t, err)
		result := lockDatasetResolutionForTest(t, ctx, database.NewQueries(tx), realm.ID, fallback.ID)
		require.NoError(t, tx.Commit(ctx))
		return result
	}

	serverResolved := resolve()
	require.Equal(t, serverDataset.ID, serverResolved.datasetID)
	require.Equal(t, serverDataset.Revision, serverResolved.revision)
	require.Empty(t, serverResolved.defaultFlavor)
	require.Equal(t, []string{"tenant-extra"}, serverResolved.additionalFlavor)

	require.NoError(t, store.SetServerDataset(ctx, database.SetServerDatasetParams{ID: server.ID}))
	tenantResolved := resolve()
	require.Equal(t, tenantDataset.ID, tenantResolved.datasetID)

	require.NoError(t, store.SetTenantDataset(ctx, database.SetTenantDatasetParams{ID: tenant.ID}))
	fallbackResolved := resolve()
	require.Equal(t, fallback.ID, fallbackResolved.datasetID)

	_, err = store.LockRealmDatasetResolution(ctx, uuid.New())
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestLockedDatasetResolutionFencesContributors(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	dataset := insertRevisionDataset(t, store, "resolution-lock-dataset")
	tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID:               uuid.New(),
		Name:             "Resolution Lock Tenant",
		Slug:             pgtype.Text{String: "resolution-lock-tenant", Valid: true},
		IncludeInAll:     true,
		AvailableFormats: []string{},
		AdditionalFlavor: []string{"locked"},
	})
	require.NoError(t, err)
	require.NoError(t, store.SetTenantDataset(ctx, database.SetTenantDatasetParams{
		ID:               tenant.ID,
		DefaultDatasetID: uuid.NullUUID{UUID: dataset.ID, Valid: true},
	}))
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Resolution Lock Server"})
	require.NoError(t, err)
	require.NoError(t, store.SetServerTenant(ctx, database.SetServerTenantParams{
		ID:       server.ID,
		TenantID: uuid.NullUUID{UUID: tenant.ID, Valid: true},
	}))
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:       uuid.New(),
		ServerID: server.ID,
		Name:     "Resolution Lock Realm",
	})
	require.NoError(t, err)

	lockTx, err := pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = lockTx.Rollback(ctx) })
	locked := lockDatasetResolutionForTest(t, ctx, database.NewQueries(lockTx), realm.ID, dataset.ID)
	require.Equal(t, dataset.ID, locked.datasetID)

	assertLocked := func(mutate func(database.StoreQueries) error) {
		t.Helper()
		mutationTx, err := pool.Begin(ctx)
		require.NoError(t, err)
		_, err = mutationTx.Exec(ctx, `SET LOCAL lock_timeout = '100ms'`)
		require.NoError(t, err)
		err = mutate(database.NewQueries(mutationTx))
		var pgErr *pgconn.PgError
		require.ErrorAs(t, err, &pgErr)
		require.Equal(t, "55P03", pgErr.Code)
		require.NoError(t, mutationTx.Rollback(ctx))
	}

	assertLocked(func(tx database.StoreQueries) error {
		_, err := tx.UpdateWoWServerRealm(ctx, database.UpdateWoWServerRealmParams{
			ID:          realm.ID,
			Name:        "Changed Realm",
			Description: "",
			Aliases:     []string{},
		})
		return err
	})
	assertLocked(func(tx database.StoreQueries) error {
		return tx.SetServerDataset(ctx, database.SetServerDatasetParams{
			ID:               server.ID,
			DefaultDatasetID: uuid.NullUUID{UUID: dataset.ID, Valid: true},
		})
	})
	assertLocked(func(tx database.StoreQueries) error {
		return tx.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID})
	})
	assertLocked(func(tx database.StoreQueries) error {
		return tx.SetTenantDataset(ctx, database.SetTenantDatasetParams{ID: tenant.ID})
	})
	assertLocked(func(tx database.StoreQueries) error {
		_, err := tx.UpdateTenant(ctx, database.UpdateTenantParams{
			ID:               tenant.ID,
			AdditionalFlavor: []string{"changed"},
		})
		return err
	})
	assertLocked(func(tx database.StoreQueries) error {
		_, err := tx.BumpDatasetRevision(ctx, dataset.ID)
		return err
	})

	require.NoError(t, lockTx.Commit(ctx))
	bumped, err := store.BumpDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Greater(t, bumped, locked.revision)
}
