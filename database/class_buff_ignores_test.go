package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestClassBuffIgnores(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	newTenant := func(name string) uuid.UUID {
		t.Helper()
		tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
			ID: uuid.New(), Name: name,
			Slug:             pgtype.Text{String: name, Valid: true},
			AvailableFormats: []string{},
		})
		require.NoError(t, err)
		return tenant.ID
	}
	tenantA := newTenant("buff-ignore-a")
	tenantB := newTenant("buff-ignore-b")

	upsert := func(scopeID uuid.UUID, tenantID uuid.NullUUID, name string) {
		t.Helper()
		require.NoError(t, store.UpsertClassBuffIgnore(ctx, database.UpsertClassBuffIgnoreParams{
			ScopeID: scopeID, TenantID: tenantID, SpellName: name,
		}))
	}
	upsert(uuid.Nil, uuid.NullUUID{}, "  Power Word: Fortitude  ")
	upsert(tenantA, uuid.NullUUID{UUID: tenantA, Valid: true}, "power word: fortitude")
	upsert(tenantB, uuid.NullUUID{UUID: tenantB, Valid: true}, "Arcane Intellect")

	rootNames, err := store.ListClassBuffIgnoresForScope(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, rootNames)
	tenantNames, err := store.ListClassBuffIgnoresForScope(ctx, tenantA)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, tenantNames)

	policies, err := store.ListClassBuffIgnorePolicies(ctx)
	require.NoError(t, err)
	require.Len(t, policies, 3)

	require.NoError(t, store.DeleteClassBuffIgnore(ctx, database.DeleteClassBuffIgnoreParams{
		ScopeID: tenantA, SpellName: "POWER WORD: FORTITUDE",
	}))
	tenantNames, err = store.ListClassBuffIgnoresForScope(ctx, tenantA)
	require.NoError(t, err)
	require.Empty(t, tenantNames)
	rootNames, err = store.ListClassBuffIgnoresForScope(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, rootNames)
}
