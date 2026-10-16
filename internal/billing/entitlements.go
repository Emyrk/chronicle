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
	granted, err := s.store.HasBillingEntitlement(ctx, database.HasBillingEntitlementParams{
		UserID:         userID,
		EntitlementKey: string(entitlement),
	})
	if err != nil {
		return false, fmt.Errorf("check persisted billing entitlement %q: %w", entitlement, err)
	}
	return granted, nil
}
