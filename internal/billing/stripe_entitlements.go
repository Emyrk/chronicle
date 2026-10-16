package billing

import (
	"context"
	"fmt"

	"errors"
	"github.com/Emyrk/chronicle/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v87"
)

const (
	stripeStorageGrantSource       = "billing:stripe:+300mb-storage"
	stripeStorageGrantBytes  int64 = 300_000_000
)

func (s *Service) syncStripeEntitlementsIfConfigured(ctx context.Context, customerID string) error {
	if s == nil || s.listActiveEntitlements == nil || customerID == "" {
		return nil
	}
	return s.syncStripeEntitlements(ctx, customerID)
}

func (s *Service) syncStripeEntitlements(ctx context.Context, customerID string) error {
	if customerID == "" {
		return fmt.Errorf("stripe entitlement summary missing customer ID")
	}
	if s.listActiveEntitlements == nil {
		return fmt.Errorf("stripe active entitlement listing is not configured")
	}
	persistedOwner, ownerErr := s.store.GetBillingEntitlementOwnerByProviderCustomerID(ctx, database.GetBillingEntitlementOwnerByProviderCustomerIDParams{
		Provider:           ProviderStripe,
		ProviderCustomerID: customerID,
	})
	if ownerErr != nil && !errors.Is(ownerErr, pgx.ErrNoRows) {
		return fmt.Errorf("find persisted entitlement owner for stripe customer %q: %w", customerID, ownerErr)
	}

	subscription, err := s.store.GetBillingSubscriptionByProviderCustomerID(ctx, database.GetBillingSubscriptionByProviderCustomerIDParams{
		Provider:           ProviderStripe,
		ProviderCustomerID: customerID,
	})
	userID := subscription.UserID
	if errors.Is(err, pgx.ErrNoRows) {
		userID, err = persistedOwner, ownerErr
	}
	if err != nil {
		return fmt.Errorf("find Chronicle user for stripe customer %q: %w", customerID, err)
	}
	if userID == uuid.Nil {
		return fmt.Errorf("find Chronicle user for stripe customer %q: empty user ID", customerID)
	}
	active, err := s.listActiveEntitlements(ctx, customerID)
	if err != nil {
		return fmt.Errorf("list active entitlements for Stripe customer %q: %w", customerID, err)
	}
	for _, entitlement := range active {
		if entitlement == nil || entitlement.ID == "" || entitlement.LookupKey == "" {
			return fmt.Errorf("stripe customer %q returned an invalid active entitlement", customerID)
		}
	}

	return s.store.InTx(ctx, func(tx database.Store) error {
		if persistedOwner != uuid.Nil && persistedOwner != userID {
			if err := tx.DeleteDataGrant(ctx, database.DeleteDataGrantParams{
				UserID: persistedOwner,
				Source: stripeStorageGrantSource,
			}); err != nil {
				return fmt.Errorf("remove previous Stripe owner's storage grant: %w", err)
			}
		}

		if err := tx.DeleteBillingEntitlementsByProviderCustomerID(ctx, database.DeleteBillingEntitlementsByProviderCustomerIDParams{
			Provider:           ProviderStripe,
			ProviderCustomerID: customerID,
		}); err != nil {
			return fmt.Errorf("clear persisted Stripe entitlements: %w", err)
		}

		hasStorageGrant := false
		for _, entitlement := range active {
			if _, err := tx.UpsertBillingEntitlement(ctx, database.UpsertBillingEntitlementParams{
				UserID:                userID,
				Provider:              ProviderStripe,
				ProviderCustomerID:    customerID,
				ProviderEntitlementID: entitlement.ID,
				EntitlementKey:        entitlement.LookupKey,
			}); err != nil {
				return fmt.Errorf("persist Stripe entitlement %q: %w", entitlement.LookupKey, err)
			}
			if Entitlement(entitlement.LookupKey) == EntitlementStorage300MB {
				hasStorageGrant = true
			}
		}

		if hasStorageGrant {
			if _, err := tx.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
				UserID:       userID,
				Source:       stripeStorageGrantSource,
				StorageBytes: stripeStorageGrantBytes,
				Description:  pgtype.Text{String: "Stripe +300 MB storage entitlement", Valid: true},
			}); err != nil {
				return fmt.Errorf("upsert Stripe storage grant: %w", err)
			}
		} else if err := tx.DeleteDataGrant(ctx, database.DeleteDataGrantParams{
			UserID: userID,
			Source: stripeStorageGrantSource,
		}); err != nil {
			return fmt.Errorf("remove Stripe storage grant: %w", err)
		}
		return nil
	}, nil)
}

func stripeEntitlementCustomer(summary stripe.EntitlementsActiveEntitlementSummary) (string, error) {
	if summary.Customer == "" {
		return "", fmt.Errorf("stripe entitlement summary missing customer ID")
	}
	return summary.Customer, nil
}
