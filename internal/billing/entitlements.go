package billing

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v87"
)

type ProductCode string

type Entitlement string

const (
	ProductSupporter ProductCode = "supporter"

	EntitlementChronicleRevered Entitlement = "chronicle-revered"
)

// EntitlementTransaction is the set of durable effects an entitlement may use.
// Implementations can run arbitrary application code in Grant and Revoke while
// the Stripe synchronizer remains unaware of the entitlement's behavior.
type EntitlementTransaction interface {
	database.Store
	SetStripeEntitlementRole(ctx context.Context, userID uuid.UUID, role string, granted bool) error
}

type StripeEntitlementRoleSetter interface {
	SetStripeEntitlementRole(ctx context.Context, userID uuid.UUID, role string, granted bool) error
}

type stripeRoleChange struct {
	userID  uuid.UUID
	role    string
	granted bool
}

type deferredEntitlementTransaction struct {
	database.Store
	roleSetter  StripeEntitlementRoleSetter
	roleChanges []stripeRoleChange
	roleIndexes map[string]int
}

func (tx *deferredEntitlementTransaction) SetStripeEntitlementRole(_ context.Context, userID uuid.UUID, role string, granted bool) error {
	if tx.roleSetter == nil {
		return fmt.Errorf("stripe entitlement role setter is not configured")
	}
	key := userID.String() + "\x00" + role
	if index, ok := tx.roleIndexes[key]; ok {
		tx.roleChanges[index].granted = granted
		return nil
	}
	tx.roleIndexes[key] = len(tx.roleChanges)
	tx.roleChanges = append(tx.roleChanges, stripeRoleChange{userID: userID, role: role, granted: granted})
	return nil
}

// NewEntitlementTransactionRunner commits database-backed effects first, then
// applies the final desired SpiceDB role state. If a role write fails, Stripe's
// webhook retry or periodic reconciliation safely retries the idempotent change.
func NewEntitlementTransactionRunner(store database.Store, roleSetter StripeEntitlementRoleSetter) EntitlementTransactionRunner {
	return func(ctx context.Context, fn func(EntitlementTransaction) error) error {
		var effects *deferredEntitlementTransaction
		if err := store.InTx(ctx, func(tx database.Store) error {
			effects = &deferredEntitlementTransaction{
				Store:       tx,
				roleSetter:  roleSetter,
				roleIndexes: make(map[string]int),
			}
			return fn(effects)
		}, nil); err != nil {
			return err
		}
		for _, change := range effects.roleChanges {
			if err := roleSetter.SetStripeEntitlementRole(ctx, change.userID, change.role, change.granted); err != nil {
				return fmt.Errorf("set Stripe entitlement role %q: %w", change.role, err)
			}
		}
		return nil
	}
}

type EntitlementTransactionRunner func(context.Context, func(EntitlementTransaction) error) error

// StripeEntitlement defines the application behavior associated with one Stripe
// entitlement lookup key. Grant and Revoke must be idempotent because Stripe
// webhooks and reconciliation can apply the same authoritative snapshot again.
type StripeEntitlement interface {
	Grant(context.Context, EntitlementTransaction, uuid.UUID) error
	Revoke(context.Context, EntitlementTransaction, uuid.UUID) error
}

type chronicleReveredEntitlement struct{}

const (
	// Keep the established source key so upgrading the Stripe feature model does
	// not create a second storage grant for existing supporters.
	stripeStorageGrantSource       = "billing:stripe:+300mb-storage"
	stripeStorageGrantBytes  int64 = 300_000_000

	stripeRoleAdFree          = "stripe_ad_free"
	stripeRoleDownloadRawLogs = "stripe_download_raw_logs"
	stripeRoleUnlistedLogs    = "stripe_unlisted_logs"
)

var chronicleReveredStripeRoles = []string{
	stripeRoleAdFree,
	stripeRoleDownloadRawLogs,
	stripeRoleUnlistedLogs,
}

// Grant expands the single Chronicle Revered Stripe feature into every benefit
// owned by the tier. Future benefit changes remain application code instead of
// Stripe catalog changes, so they apply without another Stripe billing cycle.
func (chronicleReveredEntitlement) Grant(ctx context.Context, tx EntitlementTransaction, userID uuid.UUID) error {
	if _, err := tx.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID:       userID,
		Source:       stripeStorageGrantSource,
		StorageBytes: stripeStorageGrantBytes,
		Description:  pgtype.Text{String: "Stripe Chronicle Revered entitlement", Valid: true},
	}); err != nil {
		return err
	}
	for _, role := range chronicleReveredStripeRoles {
		if err := tx.SetStripeEntitlementRole(ctx, userID, role, true); err != nil {
			return err
		}
	}
	return nil
}

func (chronicleReveredEntitlement) Revoke(ctx context.Context, tx EntitlementTransaction, userID uuid.UUID) error {
	if err := tx.DeleteDataGrant(ctx, database.DeleteDataGrantParams{UserID: userID, Source: stripeStorageGrantSource}); err != nil {
		return err
	}
	for _, role := range chronicleReveredStripeRoles {
		if err := tx.SetStripeEntitlementRole(ctx, userID, role, false); err != nil {
			return err
		}
	}
	return nil
}

type stripeEntitlementDefinition struct {
	key      Entitlement
	behavior StripeEntitlement
}

// stripeEntitlements is the complete, executable definition of known Stripe
// entitlements. Unknown lookup keys are still persisted, but have no effects.
var stripeEntitlements = []stripeEntitlementDefinition{
	{key: EntitlementChronicleRevered, behavior: chronicleReveredEntitlement{}},
}

func stripeEntitlementBehavior(key Entitlement) (StripeEntitlement, bool) {
	for _, entitlement := range stripeEntitlements {
		if entitlement.key == key {
			return entitlement.behavior, true
		}
	}
	return nil, false
}

const billingGracePeriod = 3 * 24 * time.Hour

func billingSubscriptionAccessEnd(sub database.BillingSubscription) pgtype.Timestamptz {
	if sub.CancelAt.Valid {
		return sub.CancelAt
	}
	return sub.CurrentPeriodEnd
}

// subscriptionHasCurrentBillingState controls whether the account page should
// present the current-subscription management surface. It is separate from
// checkout eligibility and from current Revered access.
func subscriptionHasCurrentBillingState(sub database.BillingSubscription, hasReveredEntitlement bool) bool {
	if !sub.ProviderSubscriptionID.Valid {
		return false
	}
	switch sub.Status {
	case string(stripe.SubscriptionStatusCanceled), string(stripe.SubscriptionStatusIncompleteExpired):
		return hasReveredEntitlement
	default:
		return true
	}
}

func subscriptionBlocksCheckout(now time.Time, sub database.BillingSubscription, hasReveredEntitlement bool) bool {
	accessEnd := billingSubscriptionAccessEnd(sub)
	if !accessEnd.Valid {
		return false
	}
	switch sub.Status {
	case string(stripe.SubscriptionStatusActive),
		string(stripe.SubscriptionStatusTrialing),
		string(stripe.SubscriptionStatusPastDue):
		return now.Before(accessEnd.Time.Add(billingGracePeriod))
	case string(stripe.SubscriptionStatusCanceled):
		return hasReveredEntitlement && now.Before(accessEnd.Time.Add(billingGracePeriod))
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
