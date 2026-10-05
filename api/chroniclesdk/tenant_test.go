package chroniclesdk_test

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTenantAdditionalFlavor(t *testing.T) {
	t.Parallel()

	tenant := chroniclesdk.TenantFromDB(database.Tenant{
		ID:               uuid.New(),
		Name:             "Progression",
		AdditionalFlavor: []string{"azerothcore-progression"},
	})
	require.Equal(t, []string{"azerothcore-progression"}, tenant.AdditionalFlavor)

	req := chroniclesdk.UpsertTenantRequest{
		ID:               uuid.NullUUID{UUID: tenant.ID, Valid: true},
		AdditionalFlavor: []string{"azerothcore-progression"},
	}
	require.Equal(t, []string{"azerothcore-progression"}, req.ToUpdateParams().AdditionalFlavor)
}

func TestTenantAdsEnabled(t *testing.T) {
	t.Parallel()

	tenant := chroniclesdk.TenantFromDB(database.Tenant{
		ID:         uuid.New(),
		Name:       "Progression",
		AdsEnabled: true,
	})
	require.True(t, tenant.AdsEnabled)

	enabled := true
	createReq := chroniclesdk.UpsertTenantRequest{AdsEnabled: &enabled}
	require.True(t, createReq.ToInsertParams().AdsEnabled)

	updateReq := chroniclesdk.UpsertTenantRequest{
		ID:         uuid.NullUUID{UUID: tenant.ID, Valid: true},
		AdsEnabled: &enabled,
	}
	updateParams := updateReq.ToUpdateParams()
	require.True(t, updateParams.AdsEnabled.Valid)
	require.True(t, updateParams.AdsEnabled.Bool)

	unchangedParams := (chroniclesdk.UpsertTenantRequest{
		ID: uuid.NullUUID{UUID: tenant.ID, Valid: true},
	}).ToUpdateParams()
	require.False(t, unchangedParams.AdsEnabled.Valid)
}
