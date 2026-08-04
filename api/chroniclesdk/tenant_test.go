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
