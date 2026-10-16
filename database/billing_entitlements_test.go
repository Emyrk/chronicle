package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestBillingEntitlementsAndStorageGrant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	now := time.Now().UTC()
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "stripe-entitlement-user", Email: userID.String() + "@example.com",
		CreatedAt: pgtype.Timestamptz{Time: now, Valid: true}, UpdatedAt: pgtype.Timestamptz{Time: now, Valid: true},
	})
	require.NoError(t, err)

	_, err = store.UpsertBillingEntitlement(ctx, database.UpsertBillingEntitlementParams{
		UserID: userID, Provider: "stripe", ProviderCustomerID: "cus_test",
		ProviderEntitlementID: "ent_test", EntitlementKey: "ad-free",
	})
	require.NoError(t, err)
	entitled, err := store.HasBillingEntitlement(ctx, database.HasBillingEntitlementParams{UserID: userID, EntitlementKey: "ad-free"})
	require.NoError(t, err)
	require.True(t, entitled)

	_, err = store.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID: userID, Source: "billing:stripe:+300mb-storage", StorageBytes: 300_000_000,
		Description: pgtype.Text{String: "Stripe +300 MB storage entitlement", Valid: true},
	})
	require.NoError(t, err)
	user, err := store.GetUserByID(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, int64(400_000_000), user.MaxStorageBytes)

	require.NoError(t, store.DeleteBillingEntitlementsByProviderCustomerID(ctx, database.DeleteBillingEntitlementsByProviderCustomerIDParams{Provider: "stripe", ProviderCustomerID: "cus_test"}))
	entitled, err = store.HasBillingEntitlement(ctx, database.HasBillingEntitlementParams{UserID: userID, EntitlementKey: "ad-free"})
	require.NoError(t, err)
	require.False(t, entitled)
}
