package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestNewArgsLogParseMatchesTenantReparse(t *testing.T) {
	t.Parallel()

	logID := uuid.New()
	realmID := uuid.New()
	tenantID := uuid.New()
	ctx := servicetenant.WithTenantID(t.Context(), tenantID)

	got := newArgsLogParse(ctx, logID, 7, true, true, true, realmID)
	require.Equal(t, ArgsLogParse{
		LogID:           logID,
		ParseGeneration: 7,
		RealmID:         realmID,
		TenantID:        tenantID,
		Verbose:         true,
		IdentityMode:    true,
		Profile:         true,
	}, got)
}

func TestNewReplacementArgsLogParseCarriesPreviousRankingRuns(t *testing.T) {
	t.Parallel()

	logID := uuid.New()
	realmID := uuid.New()
	tenantID := uuid.New()
	oldInstanceID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	oldRunID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	ctx := servicetenant.WithTenantID(t.Context(), tenantID)

	got := newReplacementArgsLogParse(ctx, logID, 9, true, true, true, realmID, []uuid.UUID{oldRunID, oldInstanceID, oldRunID})
	require.Equal(t, ArgsLogParse{
		LogID:                 logID,
		ParseGeneration:       9,
		RealmID:               realmID,
		TenantID:              tenantID,
		Verbose:               true,
		IdentityMode:          true,
		Profile:               true,
		Replacement:           true,
		PreviousRankingRunIDs: []uuid.UUID{oldInstanceID, oldRunID},
	}, got)
}
