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
	ProductHonored ProductCode = "honored"
	ProductRevered ProductCode = "revered"
	ProductExalted ProductCode = "exalted"

	EntitlementChronicleHonored Entitlement = "chronicle-honored"
	EntitlementChronicleRevered Entitlement = "chronicle-revered"
	EntitlementChronicleExalted Entitlement = "chronicle-exalted"
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

type chroniclePaidEntitlement struct {
	storageBytes int64
	roles        []string
}

const (
	stripePaidTierStorageGrantSource = "billing:stripe:paid-tier-storage"

	stripeHonoredStorageGrantBytes int64 = 300_000_000
	stripeReveredStorageGrantBytes int64 = 1_000_000_000
	stripeExaltedStorageGrantBytes int64 = 2_000_000_000

	stripeRoleAdFree           = "stripe_ad_free"
	stripeRoleDownloadRawLogs  = "stripe_download_raw_logs"
	stripeRoleUnlistedLogs     = "stripe_unlisted_logs"
	stripeRoleSubmitPhotoProof = "stripe_submit_photo_proof"
	stripeRoleHonored          = "stripe_honored"
	stripeRoleRevered          = "stripe_revered"
	stripeRoleExalted          = "stripe_exalted"
)

var (
	chronicleHonoredStripeRoles = []string{
		stripeRoleAdFree,
		stripeRoleSubmitPhotoProof,
		stripeRoleHonored,
	}
	chronicleReveredStripeRoles = []string{
		stripeRoleAdFree,
		stripeRoleSubmitPhotoProof,
		stripeRoleDownloadRawLogs,
		stripeRoleUnlistedLogs,
		stripeRoleHonored,
		stripeRoleRevered,
	}
	chronicleExaltedStripeRoles = []string{
		stripeRoleAdFree,
		stripeRoleSubmitPhotoProof,
		stripeRoleDownloadRawLogs,
		stripeRoleUnlistedLogs,
		stripeRoleHonored,
		stripeRoleRevered,
		stripeRoleExalted,
	}
)

// Grant expands a Chronicle paid-tier Stripe feature into the benefits owned by
// that tier. Future benefit changes remain application code instead of Stripe
// catalog changes, so they apply without another Stripe billing cycle.
func (entitlement chroniclePaidEntitlement) Grant(ctx context.Context, tx EntitlementTransaction, userID uuid.UUID) error {
	if _, err := tx.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID:       userID,
		Source:       stripePaidTierStorageGrantSource,
		StorageBytes: entitlement.storageBytes,
		Description:  pgtype.Text{String: "Stripe Chronicle paid tier entitlement", Valid: true},
	}); err != nil {
		return err
	}
	for _, role := range entitlement.roles {
		if err := tx.SetStripeEntitlementRole(ctx, userID, role, true); err != nil {
			return err
		}
	}
	return nil
}

func (entitlement chroniclePaidEntitlement) Revoke(ctx context.Context, tx EntitlementTransaction, userID uuid.UUID) error {
	for _, role := range entitlement.roles {
		if err := tx.SetStripeEntitlementRole(ctx, userID, role, false); err != nil {
			return err
		}
	}
	return nil
}

type stripeEntitlementDefinition struct {
	key         Entitlement
	behaviorKey string
	behavior    StripeEntitlement
}

// stripeEntitlements is the complete, executable definition of known Stripe
// entitlements. Unknown lookup keys are still persisted, but have no effects.
var stripeEntitlements = []stripeEntitlementDefinition{
	{
		key:         EntitlementChronicleHonored,
		behaviorKey: "chronicle-honored",
		behavior: chroniclePaidEntitlement{
			storageBytes: stripeHonoredStorageGrantBytes,
			roles:        chronicleHonoredStripeRoles,
		},
	},
	{
		key:         EntitlementChronicleRevered,
		behaviorKey: "chronicle-revered",
		behavior: chroniclePaidEntitlement{
			storageBytes: stripeReveredStorageGrantBytes,
			roles:        chronicleReveredStripeRoles,
		},
	},
	{
		key:         EntitlementChronicleExalted,
		behaviorKey: "chronicle-exalted",
		behavior: chroniclePaidEntitlement{
			storageBytes: stripeExaltedStorageGrantBytes,
			roles:        chronicleExaltedStripeRoles,
		},
	},
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
// checkout eligibility and from current paid-tier access.
func subscriptionHasCurrentBillingState(sub database.BillingSubscription, hasPaidEntitlement bool) bool {
	if !sub.ProviderSubscriptionID.Valid {
		return false
	}
	switch sub.Status {
	case string(stripe.SubscriptionStatusCanceled), string(stripe.SubscriptionStatusIncompleteExpired):
		return hasPaidEntitlement
	default:
		return true
	}
}

func subscriptionBlocksCheckout(now time.Time, sub database.BillingSubscription, hasPaidEntitlement bool) bool {
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
		return hasPaidEntitlement && now.Before(accessEnd.Time.Add(billingGracePeriod))
	default:
		return false
	}
}

func isPaidProduct(product ProductCode) bool {
	switch product {
	case ProductHonored, ProductRevered, ProductExalted:
		return true
	default:
		return false
	}
}

func (s *Service) paidTier(ctx context.Context, userID uuid.UUID) (string, bool, error) {
	for _, candidate := range []struct {
		entitlement Entitlement
		tier        string
	}{
		{entitlement: EntitlementChronicleExalted, tier: TierExalted},
		{entitlement: EntitlementChronicleRevered, tier: TierRevered},
		{entitlement: EntitlementChronicleHonored, tier: TierHonored},
	} {
		granted, err := s.HasEntitlement(ctx, userID, candidate.entitlement)
		if err != nil {
			return TierFree, false, err
		}
		if granted {
			return candidate.tier, true, nil
		}
	}
	return TierFree, false, nil
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
