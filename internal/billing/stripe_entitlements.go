package billing

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/paidtier"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stripe/stripe-go/v87"
)

func (s *Service) syncStripeEntitlementsIfConfigured(ctx context.Context, customerID string) error {
	if s == nil || s.listActiveEntitlements == nil || customerID == "" {
		return nil
	}
	return s.syncStripeEntitlements(ctx, customerID)
}

func (s *Service) syncStripeEntitlements(ctx context.Context, customerID string) (syncErr error) {
	defer func() {
		s.metrics.observeEntitlementSync(syncErr)
	}()
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

	if s.runEntitlementTransaction == nil {
		return fmt.Errorf("billing entitlement transactions are not configured")
	}
	previousTiers := make(map[uuid.UUID]string, 2)
	if s.discordRoleSyncEnqueuer != nil {
		for _, owner := range []uuid.UUID{persistedOwner, userID} {
			if owner == uuid.Nil {
				continue
			}
			rows, err := s.store.ListBillingEntitlementsByUserID(ctx, owner)
			if err == nil {
				previousTiers[owner] = paidtier.Effective(rows)
			}
		}
	}
	if err := s.runEntitlementTransaction(ctx, func(tx EntitlementTransaction) error {
		if persistedOwner != uuid.Nil && persistedOwner != userID {
			if err := revokeAllStripeEntitlements(ctx, tx, persistedOwner); err != nil {
				return fmt.Errorf("revoke previous Stripe owner's entitlements: %w", err)
			}
		}
		if err := revokeAllStripeEntitlements(ctx, tx, userID); err != nil {
			return fmt.Errorf("revoke current Stripe entitlement state: %w", err)
		}

		if err := tx.DeleteBillingEntitlementsByProviderCustomerID(ctx, database.DeleteBillingEntitlementsByProviderCustomerIDParams{
			Provider:           ProviderStripe,
			ProviderCustomerID: customerID,
		}); err != nil {
			return fmt.Errorf("clear persisted Stripe entitlements: %w", err)
		}

		granted := make(map[Entitlement]struct{}, len(active))
		for _, activeEntitlement := range active {
			key := Entitlement(activeEntitlement.LookupKey)
			if _, err := tx.UpsertBillingEntitlement(ctx, database.UpsertBillingEntitlementParams{
				UserID:                userID,
				Provider:              ProviderStripe,
				ProviderCustomerID:    customerID,
				ProviderEntitlementID: activeEntitlement.ID,
				EntitlementKey:        activeEntitlement.LookupKey,
			}); err != nil {
				return fmt.Errorf("persist Stripe entitlement %q: %w", activeEntitlement.LookupKey, err)
			}
			behavior, known := stripeEntitlementBehavior(key)
			if !known {
				continue
			}
			if _, alreadyGranted := granted[key]; alreadyGranted {
				continue
			}
			if err := behavior.Grant(ctx, tx, userID); err != nil {
				return fmt.Errorf("grant Stripe entitlement %q: %w", key, err)
			}
			granted[key] = struct{}{}
		}
		return nil
	}); err != nil {
		return err
	}
	if s.discordRoleSyncEnqueuer != nil {
		for owner, previousTier := range previousTiers {
			rows, err := s.store.ListBillingEntitlementsByUserID(ctx, owner)
			if err == nil && paidtier.Effective(rows) != previousTier {
				// Discord roles are best-effort. The periodic audit repairs missed jobs.
				_ = s.discordRoleSyncEnqueuer(ctx, owner)
			}
		}
	}
	if s.cosmeticAuditEnqueuer != nil {
		_ = s.cosmeticAuditEnqueuer(ctx, userID)
		if persistedOwner != uuid.Nil && persistedOwner != userID {
			_ = s.cosmeticAuditEnqueuer(ctx, persistedOwner)
		}
	}
	return nil
}

func revokeAllStripeEntitlements(ctx context.Context, tx EntitlementTransaction, userID uuid.UUID) error {
	if err := tx.DeleteDataGrant(ctx, database.DeleteDataGrantParams{UserID: userID, Source: stripePaidTierStorageGrantSource}); err != nil {
		return fmt.Errorf("revoke storage grant: %w", err)
	}

	revoked := make(map[string]struct{}, len(stripeEntitlements))
	for _, entitlement := range stripeEntitlements {
		if _, alreadyRevoked := revoked[entitlement.behaviorKey]; alreadyRevoked {
			continue
		}
		if err := entitlement.behavior.Revoke(ctx, tx, userID); err != nil {
			return fmt.Errorf("revoke %q: %w", entitlement.key, err)
		}
		revoked[entitlement.behaviorKey] = struct{}{}
	}
	return nil
}

func stripeEntitlementCustomer(summary stripe.EntitlementsActiveEntitlementSummary) (string, error) {
	if summary.Customer == "" {
		return "", fmt.Errorf("stripe entitlement summary missing customer ID")
	}
	return summary.Customer, nil
}
