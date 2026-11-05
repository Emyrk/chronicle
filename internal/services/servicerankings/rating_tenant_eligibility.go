package servicerankings

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

type ratingTenantEligibilityStore interface {
	TenantRatingsEnabled(context.Context, uuid.UUID) (bool, error)
}

// skipDisabledRootRatings is a cheap no-op for named tenants. Root jobs consult
// the singleton site setting so already-queued work also stops after a toggle.
func skipDisabledRootRatings(ctx context.Context, store ratingTenantEligibilityStore, tenantID uuid.UUID) (bool, error) {
	if tenantID != uuid.Nil {
		return false, nil
	}
	enabled, err := store.TenantRatingsEnabled(ctx, tenantID)
	if err != nil {
		return false, fmt.Errorf("check root tenant rating eligibility: %w", err)
	}
	return !enabled, nil
}
