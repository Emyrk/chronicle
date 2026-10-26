package billing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stripe/stripe-go/v87"
)

const KindReconcileSubscriptions = "billing-reconcile-subscriptions"

type ArgsReconcileSubscriptions struct{}

func (ArgsReconcileSubscriptions) Kind() string { return KindReconcileSubscriptions }

func (ArgsReconcileSubscriptions) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		MaxAttempts: 2,
		UniqueOpts: river.UniqueOpts{ByState: []rivertype.JobState{
			rivertype.JobStateScheduled,
			rivertype.JobStatePending,
			rivertype.JobStateAvailable,
			rivertype.JobStateRunning,
		}},
	}
}

type ReconciliationWorker struct {
	river.WorkerDefaults[ArgsReconcileSubscriptions]

	Billing *Service
	Store   database.Store
	Logger  *slog.Logger
}

type reconciliationCounts struct {
	providerCustomersFound     int32
	localSubscriptionsFound    int32
	subscriptionsSeen          int32
	subscriptionsChanged       int32
	subscriptionsInvalid       int32
	entitlementCustomersFound  int32
	entitlementCustomersSynced int32
}

func (w *ReconciliationWorker) Work(ctx context.Context, _ *river.Job[ArgsReconcileSubscriptions]) (workErr error) {
	if w.Billing == nil || !w.Billing.reconciliationEnabled() {
		return nil
	}
	runID := uuid.New()
	if _, err := w.Store.InsertBillingReconciliationRun(ctx, runID); err != nil {
		return fmt.Errorf("record billing reconciliation start: %w", err)
	}
	counts := reconciliationCounts{}
	var partialErr error
	var subscriptionErrorCount int
	var entitlementErrorCount int
	defer func() {
		status := "completed"
		errorText := ""
		runErr := workErr
		if runErr == nil {
			runErr = partialErr
		}
		if runErr != nil {
			status = "failed"
			errorText = runErr.Error()
		}
		completedAt := time.Now()
		completionCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := w.Store.CompleteBillingReconciliationRun(completionCtx, database.CompleteBillingReconciliationRunParams{
			ID:                          runID,
			Status:                      status,
			ProviderCustomersFound:      counts.providerCustomersFound,
			LocalSubscriptionsFound:     counts.localSubscriptionsFound,
			SubscriptionsSeen:           counts.subscriptionsSeen,
			SubscriptionsChanged:        counts.subscriptionsChanged,
			SubscriptionsSkippedInvalid: counts.subscriptionsInvalid,
			EntitlementCustomersFound:   counts.entitlementCustomersFound,
			EntitlementCustomersSynced:  counts.entitlementCustomersSynced,
			ErrorText:                   errorText,
		}); err != nil {
			if workErr == nil {
				workErr = fmt.Errorf("record billing reconciliation completion: %w", err)
			} else if w.Logger != nil {
				w.Logger.ErrorContext(ctx, "failed to record billing reconciliation failure", "error", err)
			}
		}
		metricStatus := status
		if workErr != nil {
			metricStatus = "failed"
		}
		w.Billing.metrics.observeReconciliation(metricStatus, completedAt, counts, subscriptionErrorCount, entitlementErrorCount)
	}()

	providerCustomers, err := w.Store.ListBillingProviderCustomersForReconciliation(ctx)
	if err != nil {
		return fmt.Errorf("list local billing customers: %w", err)
	}
	counts.providerCustomersFound = int32(len(providerCustomers))
	customers := make(map[string]struct{}, len(providerCustomers))
	for _, customer := range providerCustomers {
		if customer.Provider == ProviderStripe && customer.ProviderCustomerID != "" {
			customers[customer.ProviderCustomerID] = struct{}{}
		}
	}

	localSubscriptions, err := w.Store.ListBillingSubscriptionsForReconciliation(ctx)
	if err != nil {
		return fmt.Errorf("list local billing subscriptions: %w", err)
	}
	counts.localSubscriptionsFound = int32(len(localSubscriptions))
	localByProviderID := make(map[string]database.BillingSubscription, len(localSubscriptions))
	for _, sub := range localSubscriptions {
		if sub.Provider == ProviderStripe && sub.ProviderCustomerID != "" {
			customers[sub.ProviderCustomerID] = struct{}{}
		}
		if sub.Provider == ProviderStripe && sub.ProviderSubscriptionID.Valid {
			localByProviderID[sub.ProviderSubscriptionID.String] = sub
		}
	}

	subscriptions, err := w.Billing.listSubscriptions(ctx)
	if err != nil {
		return fmt.Errorf("list Stripe subscriptions: %w", err)
	}
	seen := make(map[string]struct{}, len(subscriptions))
	subscriptionErrors := make([]error, 0)
	recordSubscriptionError := func(subscriptionID string, err error) {
		counts.subscriptionsInvalid++
		subscriptionErrorCount++
		subscriptionErr := fmt.Errorf("reconcile Stripe subscription %q: %w", subscriptionID, err)
		subscriptionErrors = append(subscriptionErrors, subscriptionErr)
		if w.Logger != nil {
			w.Logger.WarnContext(ctx, "skipping Stripe subscription", slog.String("subscription_id", subscriptionID), "error", err)
		}
	}
	// Users whose single subscription row was just written from Stripe's list.
	// Their pre-run local snapshot is stale and must not be written back.
	reconciledUsers := make(map[uuid.UUID]struct{}, len(subscriptions))
	for _, sub := range subscriptions {
		counts.subscriptionsSeen++
		if sub == nil || sub.ID == "" {
			counts.subscriptionsInvalid++
			continue
		}
		seen[sub.ID] = struct{}{}
		if _, existsLocally := localByProviderID[sub.ID]; !existsLocally {
			subscriptionID := sub.ID
			sub, err = w.Billing.retrieveAuthoritativeSubscription(ctx, subscriptionID)
			if err != nil {
				if stripeResourceMissing(err) {
					counts.subscriptionsInvalid++
					continue
				}
				recordSubscriptionError(subscriptionID, fmt.Errorf("retrieve authoritative state: %w", err))
				continue
			}
		}
		userID, err := w.Billing.subscriptionOwner(ctx, sub)
		if err != nil {
			counts.subscriptionsInvalid++
			continue
		}
		changed, err := w.Billing.upsertSubscriptionIfChanged(ctx, userID, sub)
		if err != nil {
			recordSubscriptionError(sub.ID, err)
			continue
		}
		reconciledUsers[userID] = struct{}{}
		if sub.Customer != nil && sub.Customer.ID != "" {
			customers[sub.Customer.ID] = struct{}{}
		}
		if changed {
			counts.subscriptionsChanged++
		}
	}

	for subscriptionID, local := range localByProviderID {
		if _, ok := seen[subscriptionID]; ok {
			continue
		}
		if _, ok := reconciledUsers[local.UserID]; ok {
			continue
		}
		sub, err := w.Billing.retrieveAuthoritativeSubscription(ctx, subscriptionID)
		if err != nil {
			if !stripeResourceMissing(err) {
				recordSubscriptionError(subscriptionID, fmt.Errorf("retrieve locally missing subscription: %w", err))
				continue
			}
			changed, cancelErr := w.Billing.cancelSubscriptionIfChanged(ctx, local)
			if cancelErr != nil {
				recordSubscriptionError(subscriptionID, fmt.Errorf("mark deleted subscription canceled: %w", cancelErr))
				continue
			}
			if changed {
				counts.subscriptionsChanged++
			}
			if local.ProviderCustomerID != "" {
				customers[local.ProviderCustomerID] = struct{}{}
			}
			continue
		}
		changed, err := w.Billing.reconcileSubscription(ctx, sub)
		if err != nil {
			recordSubscriptionError(subscriptionID, fmt.Errorf("reconcile locally missing subscription: %w", err))
			continue
		}
		if sub.Customer != nil && sub.Customer.ID != "" {
			customers[sub.Customer.ID] = struct{}{}
		}
		if changed {
			counts.subscriptionsChanged++
		}
	}
	counts.entitlementCustomersFound = int32(len(customers))
	customerErrors := make([]error, 0, len(customers))
	for customerID := range customers {
		if err := w.Billing.syncStripeEntitlementsIfConfigured(ctx, customerID); err != nil {
			entitlementErrorCount++
			customerErr := fmt.Errorf("reconcile Stripe entitlements for customer %q: %w", customerID, err)
			customerErrors = append(customerErrors, customerErr)
			if w.Logger != nil {
				w.Logger.WarnContext(ctx, "skipping Stripe entitlement customer", slog.String("customer_id", customerID), "error", err)
			}
			continue
		}
		counts.entitlementCustomersSynced++
	}
	partialErrors := append(subscriptionErrors, customerErrors...)
	if len(partialErrors) > 0 {
		partialErr = errors.Join(partialErrors...)
	}
	if w.Logger != nil {
		w.Logger.InfoContext(ctx, "billing reconciliation finished",
			slog.Int("provider_customers_found", int(counts.providerCustomersFound)),
			slog.Int("local_subscriptions_found", int(counts.localSubscriptionsFound)),
			slog.Int("subscriptions_seen", int(counts.subscriptionsSeen)),
			slog.Int("subscriptions_changed", int(counts.subscriptionsChanged)),
			slog.Int("subscriptions_skipped_invalid", int(counts.subscriptionsInvalid)),
			slog.Int("entitlement_customers_found", int(counts.entitlementCustomersFound)),
			slog.Int("entitlement_customers_synced", int(counts.entitlementCustomersSynced)),
			slog.Int("subscription_errors", len(subscriptionErrors)),
			slog.Int("entitlement_customer_errors", len(customerErrors)),
		)
	}
	return nil
}

func (s *Service) reconcileSubscription(ctx context.Context, sub *stripe.Subscription) (bool, error) {
	userID, err := s.subscriptionOwner(ctx, sub)
	if err != nil {
		return false, err
	}
	return s.upsertSubscriptionIfChanged(ctx, userID, sub)
}

func (s *Service) upsertSubscriptionIfChanged(ctx context.Context, userID uuid.UUID, sub *stripe.Subscription) (bool, error) {
	if sub.Customer == nil || sub.Customer.ID == "" {
		return false, fmt.Errorf("subscription missing customer")
	}
	purchase, err := stripeSubscriptionPurchase(sub)
	if err != nil {
		return false, err
	}
	product, err := s.validateSubscriptionPurchase(purchase)
	if err != nil {
		return false, err
	}
	rows, err := s.store.UpsertBillingSubscriptionIfChanged(ctx, database.UpsertBillingSubscriptionIfChangedParams{
		UserID:                 userID,
		Provider:               ProviderStripe,
		ProviderCustomerID:     sub.Customer.ID,
		ProviderSubscriptionID: text(sub.ID),
		ProviderProductID:      text(purchase.productID),
		ProviderPriceID:        text(purchase.priceID),
		ProductCode:            string(product),
		Status:                 string(sub.Status),
		CurrentPeriodEnd:       purchase.periodEnd,
		CancelAtPeriodEnd:      sub.CancelAtPeriodEnd,
		CancelAt:               stripeSubscriptionCancelAt(sub),
	})
	if err != nil {
		return false, fmt.Errorf("upsert billing subscription: %w", err)
	}
	if err := s.syncStripeCustomerMetadata(ctx, sub.Customer.ID, userID); err != nil {
		return false, err
	}
	return rows > 0, nil
}

func (s *Service) cancelSubscriptionIfChanged(ctx context.Context, sub database.BillingSubscription) (bool, error) {
	rows, err := s.store.UpsertBillingSubscriptionIfChanged(ctx, database.UpsertBillingSubscriptionIfChangedParams{
		UserID:                 sub.UserID,
		Provider:               sub.Provider,
		ProviderCustomerID:     sub.ProviderCustomerID,
		ProviderSubscriptionID: sub.ProviderSubscriptionID,
		ProviderProductID:      sub.ProviderProductID,
		ProviderPriceID:        sub.ProviderPriceID,
		ProductCode:            sub.ProductCode,
		Status:                 string(stripe.SubscriptionStatusCanceled),
		CurrentPeriodEnd:       sub.CurrentPeriodEnd,
		CancelAtPeriodEnd:      sub.CancelAtPeriodEnd,
		CancelAt:               sub.CancelAt,
	})
	if err != nil {
		return false, fmt.Errorf("mark billing subscription canceled: %w", err)
	}
	return rows > 0, nil
}

func text(value string) (result pgtype.Text) {
	result.String = value
	result.Valid = value != ""
	return result
}
