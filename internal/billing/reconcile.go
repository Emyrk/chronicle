package billing

import (
	"context"
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
		MaxAttempts: 5,
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
	seen    int32
	changed int32
	invalid int32
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
	defer func() {
		status := "completed"
		errorText := ""
		if workErr != nil {
			status = "failed"
			errorText = workErr.Error()
		}
		completionCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := w.Store.CompleteBillingReconciliationRun(completionCtx, database.CompleteBillingReconciliationRunParams{
			ID:                          runID,
			Status:                      status,
			SubscriptionsSeen:           counts.seen,
			SubscriptionsChanged:        counts.changed,
			SubscriptionsSkippedInvalid: counts.invalid,
			ErrorText:                   errorText,
		}); err != nil {
			if workErr == nil {
				workErr = fmt.Errorf("record billing reconciliation completion: %w", err)
			} else if w.Logger != nil {
				w.Logger.ErrorContext(ctx, "failed to record billing reconciliation failure", "error", err)
			}
		}
	}()

	localSubscriptions, err := w.Store.ListBillingSubscriptionsForReconciliation(ctx)
	if err != nil {
		return fmt.Errorf("list local billing subscriptions: %w", err)
	}
	localByProviderID := make(map[string]database.BillingSubscription, len(localSubscriptions))
	for _, sub := range localSubscriptions {
		if sub.Provider == ProviderStripe && sub.ProviderSubscriptionID.Valid {
			localByProviderID[sub.ProviderSubscriptionID.String] = sub
		}
	}

	subscriptions, err := w.Billing.listSubscriptions(ctx)
	if err != nil {
		return fmt.Errorf("list Stripe subscriptions: %w", err)
	}
	seen := make(map[string]struct{}, len(subscriptions))
	for _, sub := range subscriptions {
		counts.seen++
		if sub == nil || sub.ID == "" {
			counts.invalid++
			continue
		}
		seen[sub.ID] = struct{}{}
		if _, existsLocally := localByProviderID[sub.ID]; !existsLocally {
			subscriptionID := sub.ID
			sub, err = w.Billing.retrieveAuthoritativeSubscription(ctx, subscriptionID)
			if err != nil {
				if stripeResourceMissing(err) {
					counts.invalid++
					continue
				}
				return fmt.Errorf("retrieve discovered Stripe subscription %q: %w", subscriptionID, err)
			}
		}
		userID, product, err := w.Billing.subscriptionOwner(ctx, sub)
		if err != nil {
			counts.invalid++
			continue
		}
		changed, err := w.Billing.upsertSubscriptionIfChanged(ctx, userID, product, sub)
		if err != nil {
			return fmt.Errorf("reconcile Stripe subscription %q: %w", sub.ID, err)
		}
		if changed {
			counts.changed++
		}
	}

	for subscriptionID, local := range localByProviderID {
		if _, ok := seen[subscriptionID]; ok {
			continue
		}
		sub, err := w.Billing.retrieveAuthoritativeSubscription(ctx, subscriptionID)
		if err != nil {
			if !stripeResourceMissing(err) {
				return fmt.Errorf("retrieve locally missing Stripe subscription %q: %w", subscriptionID, err)
			}
			changed, cancelErr := w.Billing.cancelSubscriptionIfChanged(ctx, local)
			if cancelErr != nil {
				return fmt.Errorf("cancel deleted Stripe subscription %q: %w", subscriptionID, cancelErr)
			}
			if changed {
				counts.changed++
			}
			continue
		}
		changed, err := w.Billing.reconcileSubscription(ctx, sub)
		if err != nil {
			return fmt.Errorf("reconcile locally missing Stripe subscription %q: %w", subscriptionID, err)
		}
		if changed {
			counts.changed++
		}
	}
	if w.Logger != nil {
		w.Logger.InfoContext(ctx, "billing reconciliation completed",
			slog.Int("seen", int(counts.seen)),
			slog.Int("changed", int(counts.changed)),
			slog.Int("skipped_invalid", int(counts.invalid)),
		)
	}
	return nil
}

func (s *Service) reconcileSubscription(ctx context.Context, sub *stripe.Subscription) (bool, error) {
	userID, product, err := s.subscriptionOwner(ctx, sub)
	if err != nil {
		return false, err
	}
	return s.upsertSubscriptionIfChanged(ctx, userID, product, sub)
}

func (s *Service) upsertSubscriptionIfChanged(ctx context.Context, userID uuid.UUID, product ProductCode, sub *stripe.Subscription) (bool, error) {
	if sub.Customer == nil || sub.Customer.ID == "" {
		return false, fmt.Errorf("subscription missing customer")
	}
	purchase, err := stripeSubscriptionPurchase(sub)
	if err != nil {
		return false, err
	}
	if err := s.validateSubscriptionPurchase(product, purchase); err != nil {
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
	})
	if err != nil {
		return false, fmt.Errorf("upsert billing subscription: %w", err)
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
