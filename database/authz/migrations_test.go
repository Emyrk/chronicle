package authz

import (
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/authztest"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestMigration008RepairsMissingTenantChronicleLink(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	grpcURL, presharedKey := authztest.NewSpiceDBWithAddress(t)
	ctx := testutil.Context(t, testutil.WaitLong)

	zed, err := New(ctx, Options{
		GRPCURL:      grpcURL,
		PreSharedKey: presharedKey,
		Logger:       slog.Default(),
		DB:           db,
	})
	require.NoError(t, err)

	tenantID := uuid.New()
	_, err = db.InsertTenant(ctx, database.InsertTenantParams{
		ID:               tenantID,
		Slug:             pgtype.Text{String: "missing-link-" + tenantID.String()[:8], Valid: true},
		Name:             "Missing authz link",
		AvailableFormats: []string{},
	})
	require.NoError(t, err)

	userID := uuid.New()
	require.NoError(t, zed.SetStripeEntitlementRole(ctx, userID, "stripe_submit_photo_proof", true))
	check := policy.New().Wow_tenant(tenantID).CanSubmit_photo_proof_User(policy.New().User(userID))

	allowed, err := zed.CheckOne(ctx, nil, check)
	require.NoError(t, err)
	require.False(t, allowed)

	require.NoError(t, migration008(ctx, zed))
	allowed, err = zed.CheckOne(ctx, nil, check)
	require.NoError(t, err)
	require.True(t, allowed)
}
