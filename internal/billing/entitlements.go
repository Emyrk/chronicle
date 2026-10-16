package billing

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v87"
)

type ProductCode string

type Entitlement string

const (
	ProductSupporter ProductCode = "supporter"

	EntitlementStorage300MB    Entitlement = "+300mb-storage"
	EntitlementDownloadRawLogs Entitlement = "download-raw-logs"
	EntitlementPrivateLogs     Entitlement = "private-logs"
	EntitlementAdFree          Entitlement = "ad-free"
)

var productEntitlements = map[ProductCode]map[Entitlement]struct{}{
	ProductSupporter: {
		EntitlementStorage300MB:    {},
		EntitlementDownloadRawLogs: {},
		EntitlementPrivateLogs:     {},
		EntitlementAdFree:          {},
	},
}

func ProductHasEntitlement(product ProductCode, entitlement Entitlement) bool {
	_, ok := productEntitlements[product][entitlement]
	return ok
}

func RolesHaveEntitlement(roles []string, entitlement Entitlement) bool {
	for _, role := range roles {
		if ProductHasEntitlement(ProductCode(role), entitlement) {
			return true
		}
	}
	return false
}

const billingGracePeriod = 3 * 24 * time.Hour

func subscriptionBlocksCheckout(now time.Time, sub database.BillingSubscription) bool {
	if !sub.CurrentPeriodEnd.Valid {
		return false
	}
	switch sub.Status {
	case string(stripe.SubscriptionStatusActive),
		string(stripe.SubscriptionStatusTrialing),
		string(stripe.SubscriptionStatusCanceled),
		string(stripe.SubscriptionStatusPastDue):
		return now.Before(sub.CurrentPeriodEnd.Time.Add(billingGracePeriod))
	default:
		return false
	}
}

func (s *Service) HasEntitlement(ctx context.Context, userID uuid.UUID, entitlement Entitlement) (bool, error) {
	if s.roles != nil {
		roles, err := s.roles(ctx, userID)
		if err != nil {
			return false, fmt.Errorf("get billing entitlement roles: %w", err)
		}
		if RolesHaveEntitlement(roles, entitlement) {
			return true, nil
		}
	}

	for product := range productEntitlements {
		if !ProductHasEntitlement(product, entitlement) {
			continue
		}
		granted, err := s.store.HasActiveBillingGrant(ctx, database.HasActiveBillingGrantParams{
			UserID:      userID,
			ProductCode: string(product),
		})
		if err != nil {
			return false, fmt.Errorf("check billing grant for product %q: %w", product, err)
		}
		if granted {
			return true, nil
		}
	}

	granted, err := s.store.HasBillingEntitlement(ctx, database.HasBillingEntitlementParams{
		UserID:         userID,
		EntitlementKey: string(entitlement),
	})
	if err != nil {
		return false, fmt.Errorf("check persisted billing entitlement %q: %w", entitlement, err)
	}
	return granted, nil
}
