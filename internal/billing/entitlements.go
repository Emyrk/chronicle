package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stripe/stripe-go/v87"
)

type ProductCode string

type Entitlement string

const (
	ProductSupporter ProductCode = "supporter"

	EntitlementAdFree Entitlement = "ad_free"
)

var productEntitlements = map[ProductCode]map[Entitlement]struct{}{
	ProductSupporter: {
		EntitlementAdFree: {},
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

	sub, err := s.store.GetBillingSubscriptionByUserID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("get billing subscription: %w", err)
	}
	return subscriptionHasEntitlement(time.Now(), sub, entitlement), nil
}

func subscriptionHasEntitlement(now time.Time, sub database.BillingSubscription, entitlement Entitlement) bool {
	if !ProductHasEntitlement(ProductCode(sub.ProductCode), entitlement) {
		return false
	}
	switch sub.Status {
	case string(stripe.SubscriptionStatusActive), string(stripe.SubscriptionStatusTrialing):
		return true
	case string(stripe.SubscriptionStatusCanceled):
		return sub.CurrentPeriodEnd.Valid && sub.CurrentPeriodEnd.Time.After(now)
	default:
		return false
	}
}
