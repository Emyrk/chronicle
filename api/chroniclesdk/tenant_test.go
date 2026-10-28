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
		ID:          uuid.New(),
		Name:        "Progression",
		AdsEnabled:  true,
		DisabledAds: []string{"rail", "recent-content"},
	})
	require.True(t, tenant.AdsEnabled)
	require.Equal(t, []string{"rail", "recent-content"}, tenant.DisabledAds)

	enabled := true
	createReq := chroniclesdk.UpsertTenantRequest{
		AdsEnabled:  &enabled,
		DisabledAds: []string{"rail"},
	}
	require.True(t, createReq.ToInsertParams().AdsEnabled)
	require.Equal(t, []string{"rail"}, createReq.ToInsertParams().DisabledAds)

	updateReq := chroniclesdk.UpsertTenantRequest{
		ID:          uuid.NullUUID{UUID: tenant.ID, Valid: true},
		AdsEnabled:  &enabled,
		DisabledAds: []string{"recent-content"},
	}
	updateParams := updateReq.ToUpdateParams()
	require.True(t, updateParams.AdsEnabled.Valid)
	require.True(t, updateParams.AdsEnabled.Bool)
	require.Equal(t, []string{"recent-content"}, updateParams.DisabledAds)

	unchangedParams := (chroniclesdk.UpsertTenantRequest{
		ID: uuid.NullUUID{UUID: tenant.ID, Valid: true},
	}).ToUpdateParams()
	require.False(t, unchangedParams.AdsEnabled.Valid)
	require.Nil(t, unchangedParams.DisabledAds)
}

func TestTenantWoWLogsForwarding(t *testing.T) {
	t.Parallel()

	tenant := chroniclesdk.TenantFromDB(database.Tenant{
		ID:                       uuid.New(),
		Name:                     "Warmane",
		WowLogsForwardingEnabled: true,
	})
	require.True(t, tenant.WoWLogsForwardingEnabled)

	enabled := true
	createParams := (chroniclesdk.UpsertTenantRequest{WoWLogsForwardingEnabled: &enabled}).ToInsertParams()
	require.True(t, createParams.WowLogsForwardingEnabled)

	updateParams := (chroniclesdk.UpsertTenantRequest{
		ID:                       uuid.NullUUID{UUID: tenant.ID, Valid: true},
		WoWLogsForwardingEnabled: &enabled,
	}).ToUpdateParams()
	require.True(t, updateParams.WowLogsForwardingEnabled.Valid)
	require.True(t, updateParams.WowLogsForwardingEnabled.Bool)

	unchangedParams := (chroniclesdk.UpsertTenantRequest{
		ID: uuid.NullUUID{UUID: tenant.ID, Valid: true},
	}).ToUpdateParams()
	require.False(t, unchangedParams.WowLogsForwardingEnabled.Valid)
}

func TestTenantExternalLinkingMethods(t *testing.T) {
	t.Parallel()

	methods := map[string]chroniclesdk.ExternalLinkingMethod{
		"zug-zug":     {Enabled: true, Callout: "Guild only"},
		"photo-proof": {Enabled: false, Callout: "Upload a photo"},
	}
	req := chroniclesdk.UpsertTenantRequest{
		ExternalLinking: &chroniclesdk.ExternalLinking{Methods: methods},
	}
	stored := req.ToInsertParams().ExternalLinking
	parsed := chroniclesdk.ParseExternalLinking(stored)
	require.NotNil(t, parsed)
	require.Equal(t, methods, parsed.Methods)
	require.Equal(t, stored, req.ToUpdateParams().ExternalLinking)

	converted := chroniclesdk.TenantFromDB(database.Tenant{ExternalLinking: stored})
	require.Equal(t, methods, converted.ExternalLinking.Methods)
	require.Nil(t, chroniclesdk.ParseExternalLinking(nil))
	require.Nil(t, chroniclesdk.ParseExternalLinking([]byte("null")))
	require.Nil(t, chroniclesdk.ParseExternalLinking([]byte("{")))
}
