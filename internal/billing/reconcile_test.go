package billing

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v87"
)

type reconciliationStore struct {
	database.Store
	providerRow        database.BillingSubscription
	providerErr        error
	upserts            []database.UpsertBillingSubscriptionParams
	conditionalUpserts []database.UpsertBillingSubscriptionIfChangedParams
	changedRows        []int64
	localSubscriptions []database.BillingSubscription
	providerCustomers  []database.ListBillingProviderCustomersForReconciliationRow
	runID              uuid.UUID
	completion         database.CompleteBillingReconciliationRunParams
}

func (s *reconciliationStore) GetBillingSubscriptionByProviderID(context.Context, database.GetBillingSubscriptionByProviderIDParams) (database.BillingSubscription, error) {
	return s.providerRow, s.providerErr
}

func (s *reconciliationStore) UpsertBillingSubscription(_ context.Context, arg database.UpsertBillingSubscriptionParams) (database.BillingSubscription, error) {
	s.upserts = append(s.upserts, arg)
	return database.BillingSubscription{}, nil
}

func (s *reconciliationStore) UpsertBillingSubscriptionIfChanged(_ context.Context, arg database.UpsertBillingSubscriptionIfChangedParams) (int64, error) {
	s.conditionalUpserts = append(s.conditionalUpserts, arg)
	if len(s.changedRows) == 0 {
		return 0, nil
	}
	rows := s.changedRows[0]
	s.changedRows = s.changedRows[1:]
	return rows, nil
}

func (s *reconciliationStore) GetBillingEntitlementOwnerByProviderCustomerID(context.Context, database.GetBillingEntitlementOwnerByProviderCustomerIDParams) (uuid.UUID, error) {
	return uuid.Nil, pgx.ErrNoRows
}

func (s *reconciliationStore) GetBillingSubscriptionByProviderCustomerID(_ context.Context, arg database.GetBillingSubscriptionByProviderCustomerIDParams) (database.BillingSubscription, error) {
	for _, sub := range s.localSubscriptions {
		if sub.ProviderCustomerID == arg.ProviderCustomerID {
			return sub, nil
		}
	}
	return database.BillingSubscription{}, pgx.ErrNoRows
}

func (s *reconciliationStore) ListBillingProviderCustomersForReconciliation(context.Context) ([]database.ListBillingProviderCustomersForReconciliationRow, error) {
	return s.providerCustomers, nil
}

func (s *reconciliationStore) ListBillingSubscriptionsForReconciliation(context.Context) ([]database.BillingSubscription, error) {
	return s.localSubscriptions, nil
}

func (s *reconciliationStore) InsertBillingReconciliationRun(_ context.Context, id uuid.UUID) (database.BillingReconciliationRun, error) {
	s.runID = id
	return database.BillingReconciliationRun{ID: id}, nil
}

func (s *reconciliationStore) CompleteBillingReconciliationRun(_ context.Context, arg database.CompleteBillingReconciliationRunParams) error {
	s.completion = arg
	return nil
}

func TestReconciliationJobRetriesAtMostOnce(t *testing.T) {
	t.Parallel()

	// River counts the initial execution as an attempt, so two attempts means
	// at most one retry.
	require.Equal(t, 2, ArgsReconcileSubscriptions{}.InsertOpts().MaxAttempts)
}

func TestSubscriptionWebhookUsesAuthoritativeStateAndPriceTier(t *testing.T) {
	t.Parallel()
	userID := uuid.New()
	periodEnd := time.Now().Add(24 * time.Hour)
	store := &reconciliationStore{providerErr: pgx.ErrNoRows}
	svc := New(Options{Store: store, ExaltedPriceIDs: []string{"price_exalted"}})
	var updatedCustomerID string
	var updatedCustomerMetadata map[string]string
	svc.updateCustomer = func(_ context.Context, customerID string, params *stripe.CustomerUpdateParams) (*stripe.Customer, error) {
		updatedCustomerID = customerID
		updatedCustomerMetadata = params.Metadata
		return &stripe.Customer{ID: customerID}, nil
	}
	var notified SubscriptionChangeNotification
	svc.SetSubscriptionChangeNotifier(func(ctx context.Context, change SubscriptionChangeNotification) error {
		_, hasDeadline := ctx.Deadline()
		require.True(t, hasDeadline)
		notified = change
		return nil
	})
	authoritative := testStripeSubscription("prod_exalted", "price_exalted", periodEnd)
	authoritative.ID = "sub_authoritative"
	authoritative.Customer = &stripe.Customer{ID: "cus_authoritative"}
	authoritative.Status = stripe.SubscriptionStatusActive
	authoritative.Metadata = map[string]string{
		"chronicle_user_id":      userID.String(),
		"chronicle_product_code": string(ProductRevered),
	}
	svc.retrieveSubscription = func(context.Context, string, *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		return authoritative, nil
	}
	snapshot, err := json.Marshal(stripe.Subscription{ID: authoritative.ID, Status: stripe.SubscriptionStatusCanceled})
	require.NoError(t, err)

	err = svc.processEvent(context.Background(), stripe.Event{
		Type: stripe.EventTypeCustomerSubscriptionUpdated,
		Data: &stripe.EventData{Raw: snapshot},
	})
	require.NoError(t, err)
	require.Len(t, store.upserts, 1)
	require.Equal(t, userID, store.upserts[0].UserID)
	require.Equal(t, string(ProductExalted), store.upserts[0].ProductCode, "configured price must override stale product metadata")
	require.Equal(t, string(stripe.SubscriptionStatusActive), store.upserts[0].Status)
	require.Equal(t, authoritative.Customer.ID, updatedCustomerID)
	require.Equal(t, userID.String(), updatedCustomerMetadata[stripeMetadataChronicleUserID])
	require.Equal(t, SubscriptionChangeNotification{
		EventType:              string(stripe.EventTypeCustomerSubscriptionUpdated),
		UserID:                 userID,
		ProviderCustomerID:     authoritative.Customer.ID,
		ProviderSubscriptionID: authoritative.ID,
		ProductCode:            string(ProductExalted),
		Status:                 string(stripe.SubscriptionStatusActive),
		CurrentPeriodEnd:       periodEnd.Truncate(time.Second).UTC(),
	}, notified)
}

func TestSubscriptionWebhookFallsBackToLocalOwner(t *testing.T) {
	t.Parallel()
	userID := uuid.New()
	store := &reconciliationStore{providerRow: database.BillingSubscription{UserID: userID, ProductCode: string(ProductRevered)}}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	var notified SubscriptionChangeNotification
	svc.SetSubscriptionChangeNotifier(func(_ context.Context, change SubscriptionChangeNotification) error {
		notified = change
		return errors.New("river unavailable")
	})
	authoritative := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	authoritative.ID = "sub_existing"
	authoritative.Customer = &stripe.Customer{ID: "cus_existing"}
	authoritative.Status = stripe.SubscriptionStatusPastDue
	svc.retrieveSubscription = func(context.Context, string, *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		return authoritative, nil
	}
	raw, err := json.Marshal(stripe.Subscription{ID: authoritative.ID})
	require.NoError(t, err)

	err = svc.processEvent(context.Background(), stripe.Event{Type: stripe.EventTypeCustomerSubscriptionCreated, Data: &stripe.EventData{Raw: raw}})
	require.NoError(t, err)
	require.Equal(t, userID, store.upserts[0].UserID)
	require.Equal(t, string(stripe.SubscriptionStatusPastDue), store.upserts[0].Status)
	require.Equal(t, string(stripe.EventTypeCustomerSubscriptionCreated), notified.EventType)
	require.Equal(t, userID, notified.UserID)
	require.Equal(t, authoritative.ID, notified.ProviderSubscriptionID)
}

func TestDeletedSubscriptionWebhookNotifiesFromPersistedRow(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	periodEnd := time.Date(2026, time.November, 18, 23, 25, 45, 0, time.UTC)
	row := database.BillingSubscription{
		UserID:                 userID,
		Provider:               ProviderStripe,
		ProviderCustomerID:     "cus_deleted",
		ProviderSubscriptionID: text("sub_deleted"),
		ProviderProductID:      text("prod_supporter"),
		ProviderPriceID:        text("price_monthly"),
		ProductCode:            string(ProductRevered),
		Status:                 string(stripe.SubscriptionStatusActive),
		CurrentPeriodEnd:       pgtype.Timestamptz{Time: periodEnd, Valid: true},
	}
	store := &reconciliationStore{providerRow: row}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	var notified SubscriptionChangeNotification
	svc.SetSubscriptionChangeNotifier(func(_ context.Context, change SubscriptionChangeNotification) error {
		notified = change
		return nil
	})
	svc.retrieveSubscription = func(context.Context, string, *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		return nil, &stripe.Error{Code: stripe.ErrorCodeResourceMissing}
	}
	raw, err := json.Marshal(stripe.Subscription{ID: row.ProviderSubscriptionID.String})
	require.NoError(t, err)

	err = svc.processEvent(context.Background(), stripe.Event{
		Type: stripe.EventTypeCustomerSubscriptionDeleted,
		Data: &stripe.EventData{Raw: raw},
	})
	require.NoError(t, err)
	require.Len(t, store.upserts, 1)
	require.Equal(t, string(stripe.SubscriptionStatusCanceled), store.upserts[0].Status)
	require.Equal(t, SubscriptionChangeNotification{
		EventType:              string(stripe.EventTypeCustomerSubscriptionDeleted),
		UserID:                 userID,
		ProviderCustomerID:     row.ProviderCustomerID,
		ProviderSubscriptionID: row.ProviderSubscriptionID.String,
		ProductCode:            row.ProductCode,
		Status:                 string(stripe.SubscriptionStatusCanceled),
		CurrentPeriodEnd:       periodEnd,
	}, notified)
}

func TestThinSubscriptionWebhookUsesRelatedObject(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &reconciliationStore{providerErr: pgx.ErrNoRows}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	authoritative := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	authoritative.ID = "sub_thin"
	authoritative.Customer = &stripe.Customer{ID: "cus_thin"}
	authoritative.Metadata = map[string]string{"chronicle_user_id": userID.String()}
	svc.retrieveSubscription = func(_ context.Context, id string, _ *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		require.Equal(t, authoritative.ID, id)
		return authoritative, nil
	}

	err := svc.processEventNotification(context.Background(), &stripe.V1CustomerSubscriptionUpdatedEventNotification{
		V2CoreEventNotification: stripe.V2CoreEventNotification{
			ID:   "evt_thin_subscription",
			Type: "v1.customer.subscription.updated",
		},
		RelatedObject: stripe.V2CoreEventRelatedObject{ID: authoritative.ID},
	})

	require.NoError(t, err)
	require.Len(t, store.upserts, 1)
	require.Equal(t, userID, store.upserts[0].UserID)
	require.Equal(t, authoritative.ID, store.upserts[0].ProviderSubscriptionID.String)
}

func TestThinCheckoutWebhookRetrievesRelatedSession(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &reconciliationStore{providerErr: pgx.ErrNoRows}
	svc := New(Options{Store: store, ExaltedPriceIDs: []string{"price_exalted"}})
	authoritative := testStripeSubscription("prod_exalted", "price_exalted", time.Now().Add(time.Hour))
	authoritative.ID = "sub_checkout"
	authoritative.Customer = &stripe.Customer{ID: "cus_checkout"}
	authoritative.Metadata = map[string]string{"chronicle_user_id": userID.String()}
	svc.retrieveCheckoutSession = func(_ context.Context, id string, _ *stripe.CheckoutSessionRetrieveParams) (*stripe.CheckoutSession, error) {
		require.Equal(t, "cs_thin", id)
		return &stripe.CheckoutSession{
			ID:                id,
			ClientReferenceID: userID.String(),
			Subscription:      &stripe.Subscription{ID: authoritative.ID},
		}, nil
	}
	svc.retrieveSubscription = func(_ context.Context, id string, _ *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		require.Equal(t, authoritative.ID, id)
		return authoritative, nil
	}

	err := svc.processEventNotification(context.Background(), &stripe.V1CheckoutSessionCompletedEventNotification{
		V2CoreEventNotification: stripe.V2CoreEventNotification{
			ID:   "evt_thin_checkout",
			Type: "v1.checkout.session.completed",
		},
		RelatedObject: stripe.V2CoreEventRelatedObject{ID: "cs_thin"},
	})

	require.NoError(t, err)
	require.Len(t, store.upserts, 1)
	require.Equal(t, userID, store.upserts[0].UserID)
	require.Equal(t, authoritative.ID, store.upserts[0].ProviderSubscriptionID.String)
}

func TestReconciliationCountsChangedNoopAndInvalidMetadata(t *testing.T) {
	t.Parallel()
	userID := uuid.New()
	validChanged := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	validChanged.ID = "sub_changed"
	validChanged.Customer = &stripe.Customer{ID: "cus_changed"}
	cancelAt := time.Date(2026, time.November, 18, 23, 25, 45, 0, time.UTC)
	validChanged.CancelAt = cancelAt.Unix()
	validChanged.Metadata = map[string]string{"chronicle_user_id": userID.String(), "chronicle_product_code": string(ProductRevered)}
	validNoopUserID := uuid.New()
	validNoop := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	validNoop.ID = "sub_noop"
	validNoop.Customer = &stripe.Customer{ID: "cus_noop"}
	validNoop.Metadata = map[string]string{"chronicle_user_id": validNoopUserID.String(), "chronicle_product_code": string(ProductRevered)}
	invalid := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	invalid.ID = "sub_invalid"
	invalid.Customer = &stripe.Customer{ID: "cus_invalid"}
	invalid.Metadata = map[string]string{"chronicle_user_id": "not-a-uuid", "chronicle_product_code": string(ProductRevered)}

	store := &reconciliationStore{
		providerErr: pgx.ErrNoRows,
		changedRows: []int64{1, 0},
		localSubscriptions: []database.BillingSubscription{
			{Provider: ProviderStripe, ProviderSubscriptionID: text(validChanged.ID)},
			{Provider: ProviderStripe, ProviderSubscriptionID: text(validNoop.ID)},
		},
		providerCustomers: []database.ListBillingProviderCustomersForReconciliationRow{
			{Provider: ProviderStripe, ProviderCustomerID: "cus_persisted"},
		},
	}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	customerMetadata := make(map[string]string)
	svc.updateCustomer = func(_ context.Context, customerID string, params *stripe.CustomerUpdateParams) (*stripe.Customer, error) {
		customerMetadata[customerID] = params.Metadata[stripeMetadataChronicleUserID]
		return &stripe.Customer{ID: customerID}, nil
	}
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) {
		return []*stripe.Subscription{validChanged, validNoop, invalid}, nil
	}
	svc.retrieveSubscription = func(_ context.Context, id string, _ *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		require.Equal(t, invalid.ID, id)
		return invalid, nil
	}
	worker := &ReconciliationWorker{Billing: svc, Store: store}
	require.NoError(t, worker.Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{}))
	require.NotEqual(t, uuid.Nil, store.runID)
	require.Equal(t, "completed", store.completion.Status)
	require.Equal(t, int32(1), store.completion.ProviderCustomersFound)
	require.Equal(t, int32(2), store.completion.LocalSubscriptionsFound)
	require.Equal(t, int32(3), store.completion.SubscriptionsSeen)
	require.Equal(t, int32(1), store.completion.SubscriptionsChanged)
	require.Equal(t, int32(1), store.completion.SubscriptionsSkippedInvalid)
	require.Equal(t, pgtype.Timestamptz{Time: cancelAt, Valid: true}, store.conditionalUpserts[0].CancelAt)
	require.Equal(t, userID.String(), customerMetadata[validChanged.Customer.ID])
	require.Equal(t, validNoopUserID.String(), customerMetadata[validNoop.Customer.ID])
	require.Equal(t, int32(3), store.completion.EntitlementCustomersFound)
	require.Equal(t, int32(3), store.completion.EntitlementCustomersSynced)
}

func TestReconciliationContinuesAfterSubscriptionError(t *testing.T) {
	t.Parallel()

	periodEnd := time.Date(2026, time.November, 19, 0, 0, 0, 0, time.UTC)
	failed := testStripeSubscription("prod_supporter", "price_monthly", periodEnd)
	failed.ID = "sub_failed"
	failed.Customer = &stripe.Customer{ID: "cus_failed"}
	failed.Metadata = map[string]string{"chronicle_user_id": uuid.NewString()}
	succeeded := testStripeSubscription("prod_supporter", "price_monthly", periodEnd)
	succeeded.ID = "sub_succeeded"
	succeeded.Customer = &stripe.Customer{ID: "cus_succeeded"}
	succeeded.Metadata = map[string]string{"chronicle_user_id": uuid.NewString()}

	store := &reconciliationStore{changedRows: []int64{1}}
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	svc := New(Options{Store: store, Metrics: metrics, ReveredPriceIDs: []string{"price_monthly"}})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) {
		return []*stripe.Subscription{failed, succeeded}, nil
	}
	svc.retrieveSubscription = func(_ context.Context, id string, _ *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		switch id {
		case failed.ID:
			return nil, errors.New("temporary Stripe failure")
		case succeeded.ID:
			return succeeded, nil
		default:
			t.Fatalf("unexpected subscription %q", id)
			return nil, nil
		}
	}

	err = (&ReconciliationWorker{Billing: svc, Store: store}).Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.NoError(t, err, "a subscription-level failure must not fail or retry the River job")
	require.Equal(t, "failed", store.completion.Status)
	require.Contains(t, store.completion.ErrorText, `reconcile Stripe subscription "sub_failed"`)
	require.Contains(t, store.completion.ErrorText, "temporary Stripe failure")
	require.Equal(t, int32(2), store.completion.SubscriptionsSeen)
	require.Equal(t, int32(1), store.completion.SubscriptionsSkippedInvalid)
	require.Equal(t, int32(1), store.completion.SubscriptionsChanged)
	require.Len(t, store.conditionalUpserts, 1)
	require.Equal(t, succeeded.ID, store.conditionalUpserts[0].ProviderSubscriptionID.String)
	require.Equal(t, int32(1), store.completion.EntitlementCustomersFound)
	require.Equal(t, float64(1), metricValue(t, metrics.reconciliationRuns.WithLabelValues("failed")))
	require.Positive(t, metricValue(t, metrics.reconciliationLastCompleted))
	require.Zero(t, metricValue(t, metrics.reconciliationLastSuccess))
	require.Equal(t, float64(1), metricValue(t, metrics.reconciliationSubscriptionErrors))
	require.Equal(t, float64(0), metricValue(t, metrics.reconciliationEntitlementErrors))
	require.Equal(t, float64(1), metricValue(t, metrics.reconciliationCustomersFound))
	require.Equal(t, float64(1), metricValue(t, metrics.reconciliationCustomersSynced))
	require.Equal(t, int32(1), store.completion.EntitlementCustomersSynced)
}

func TestReconciliationRetrievesLocalSubscriptionMissingFromList(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	local := database.BillingSubscription{
		UserID:                 userID,
		Provider:               ProviderStripe,
		ProviderSubscriptionID: text("sub_existing"),
		ProductCode:            string(ProductRevered),
	}
	authoritative := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	authoritative.ID = local.ProviderSubscriptionID.String
	authoritative.Customer = &stripe.Customer{ID: "cus_existing"}
	authoritative.Metadata = map[string]string{
		"chronicle_user_id":      userID.String(),
		"chronicle_product_code": string(ProductRevered),
	}
	store := &reconciliationStore{
		localSubscriptions: []database.BillingSubscription{local},
		changedRows:        []int64{1},
	}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) { return nil, nil }
	svc.retrieveSubscription = func(_ context.Context, id string, _ *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		require.Equal(t, local.ProviderSubscriptionID.String, id)
		return authoritative, nil
	}

	err := (&ReconciliationWorker{Billing: svc, Store: store}).Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.NoError(t, err)
	require.Equal(t, int32(1), store.completion.SubscriptionsChanged)
	require.Len(t, store.conditionalUpserts, 1)
	require.NotEqual(t, string(stripe.SubscriptionStatusCanceled), store.conditionalUpserts[0].Status)
}

func TestReconciliationCancelsLocalSubscriptionMissingFromStripe(t *testing.T) {
	t.Parallel()

	local := database.BillingSubscription{
		UserID:                 uuid.New(),
		Provider:               ProviderStripe,
		ProviderCustomerID:     "cus_missing",
		ProviderSubscriptionID: text("sub_missing"),
		ProviderProductID:      text("prod_supporter"),
		ProviderPriceID:        text("price_monthly"),
		ProductCode:            string(ProductRevered),
		Status:                 string(stripe.SubscriptionStatusActive),
		CurrentPeriodEnd:       pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	}
	store := &reconciliationStore{
		localSubscriptions: []database.BillingSubscription{local},
		changedRows:        []int64{1},
	}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) { return nil, nil }
	svc.retrieveSubscription = func(_ context.Context, id string, _ *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		require.Equal(t, local.ProviderSubscriptionID.String, id)
		return nil, &stripe.Error{Code: stripe.ErrorCodeResourceMissing}
	}

	err := (&ReconciliationWorker{Billing: svc, Store: store}).Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.NoError(t, err)
	require.Equal(t, int32(1), store.completion.SubscriptionsChanged)
	require.Len(t, store.conditionalUpserts, 1)
	require.Equal(t, string(stripe.SubscriptionStatusCanceled), store.conditionalUpserts[0].Status)
	require.Equal(t, local.CurrentPeriodEnd, store.conditionalUpserts[0].CurrentPeriodEnd)
}

// A user's row can still point at a subscription from a Stripe customer that no
// longer exists. Once Stripe's list has written their current subscription, the
// stale snapshot must not be written back as canceled.
func TestReconciliationKeepsListedSubscriptionOverStaleLocalRow(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	stale := database.BillingSubscription{
		UserID:                 userID,
		Provider:               ProviderStripe,
		ProviderCustomerID:     "cus_deleted",
		ProviderSubscriptionID: text("sub_deleted"),
		ProviderProductID:      text("prod_supporter"),
		ProviderPriceID:        text("price_monthly"),
		ProductCode:            string(ProductRevered),
		Status:                 string(stripe.SubscriptionStatusActive),
		CurrentPeriodEnd:       pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	}
	current := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	current.ID = "sub_current"
	current.Status = stripe.SubscriptionStatusActive
	current.Customer = &stripe.Customer{ID: "cus_current"}
	current.Metadata = map[string]string{
		"chronicle_user_id":      userID.String(),
		"chronicle_product_code": string(ProductRevered),
	}
	store := &reconciliationStore{
		localSubscriptions: []database.BillingSubscription{stale},
		changedRows:        []int64{1},
	}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) {
		return []*stripe.Subscription{current}, nil
	}
	svc.retrieveSubscription = func(_ context.Context, id string, _ *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error) {
		require.Equal(t, current.ID, id)
		return current, nil
	}

	err := (&ReconciliationWorker{Billing: svc, Store: store}).Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.NoError(t, err)
	require.Len(t, store.conditionalUpserts, 1)
	require.Equal(t, current.ID, store.conditionalUpserts[0].ProviderSubscriptionID.String)
	require.Equal(t, string(stripe.SubscriptionStatusActive), store.conditionalUpserts[0].Status)
}

func TestReconciliationContinuesAfterEntitlementCustomerError(t *testing.T) {
	t.Parallel()

	validCustomerID := "cus_valid"
	orphanCustomerID := "cus_orphan"
	store := &reconciliationStore{
		localSubscriptions: []database.BillingSubscription{{
			UserID:             uuid.New(),
			Provider:           ProviderStripe,
			ProviderCustomerID: validCustomerID,
		}},
		providerCustomers: []database.ListBillingProviderCustomersForReconciliationRow{{
			Provider:           ProviderStripe,
			ProviderCustomerID: orphanCustomerID,
		}},
	}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) { return nil, nil }
	svc.listActiveEntitlements = func(_ context.Context, customerID string) ([]*stripe.EntitlementsActiveEntitlement, error) {
		require.Equal(t, validCustomerID, customerID)
		return nil, nil
	}
	tx := &entitlementStore{}
	svc.runEntitlementTransaction = func(ctx context.Context, fn func(EntitlementTransaction) error) error {
		return fn(tx)
	}

	err := (&ReconciliationWorker{Billing: svc, Store: store}).Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.NoError(t, err, "a customer-level failure must not fail or retry the River job")
	require.Equal(t, "failed", store.completion.Status)
	require.Contains(t, store.completion.ErrorText, `reconcile Stripe entitlements for customer "cus_orphan"`)
	require.Contains(t, store.completion.ErrorText, `find Chronicle user for stripe customer "cus_orphan": no rows in result set`)
	require.Contains(t, store.completion.ErrorText, orphanCustomerID)
	require.Equal(t, int32(2), store.completion.EntitlementCustomersFound)
	require.Equal(t, int32(1), store.completion.EntitlementCustomersSynced)
	require.Equal(t, validCustomerID, tx.deletedCustomer.ProviderCustomerID)
}

func TestReconciliationSkipsEntitlementsForMissingStripeCustomer(t *testing.T) {
	t.Parallel()

	store := &reconciliationStore{
		localSubscriptions: []database.BillingSubscription{{
			UserID:             uuid.New(),
			Provider:           ProviderStripe,
			ProviderCustomerID: "cus_deleted",
		}},
	}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) { return nil, nil }
	svc.listActiveEntitlements = func(context.Context, string) ([]*stripe.EntitlementsActiveEntitlement, error) {
		return nil, &stripe.Error{Code: stripe.ErrorCodeResourceMissing}
	}

	err := (&ReconciliationWorker{Billing: svc, Store: store}).Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.NoError(t, err, "a customer-level failure must not fail or retry the River job")
	require.Equal(t, "failed", store.completion.Status)
	require.Contains(t, store.completion.ErrorText, `reconcile Stripe entitlements for customer "cus_deleted"`)
	require.Equal(t, int32(1), store.completion.EntitlementCustomersFound)
	require.Equal(t, int32(0), store.completion.EntitlementCustomersSynced)
}

func TestAuthoritativeSubscriptionRejectsUnconfiguredPriceAndEmptyCustomer(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &reconciliationStore{}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})

	wrongPrice := testStripeSubscription("prod_supporter", "price_other", time.Now().Add(time.Hour))
	wrongPrice.Customer = &stripe.Customer{ID: "cus_123"}
	err := svc.upsertSubscription(context.Background(), userID, wrongPrice)
	require.ErrorContains(t, err, "is not configured")

	emptyCustomer := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	emptyCustomer.Customer = &stripe.Customer{}
	err = svc.upsertSubscription(context.Background(), userID, emptyCustomer)
	require.ErrorContains(t, err, "missing customer")
	require.Empty(t, store.upserts)
}

func TestReconciliationRecordsFailureAndRetries(t *testing.T) {
	t.Parallel()
	store := &reconciliationStore{}
	svc := New(Options{Store: store, ReveredPriceIDs: []string{"price_monthly"}})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) { return nil, errors.New("stripe unavailable") }
	worker := &ReconciliationWorker{Billing: svc, Store: store}
	err := worker.Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.ErrorContains(t, err, "stripe unavailable")
	require.Equal(t, "failed", store.completion.Status)
	require.Contains(t, store.completion.ErrorText, "stripe unavailable")
}
