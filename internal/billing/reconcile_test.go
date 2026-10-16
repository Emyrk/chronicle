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
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v87"
)

type reconciliationStore struct {
	database.Store
	providerRow database.BillingSubscription
	providerErr error
	upserts     []database.UpsertBillingSubscriptionParams
	changedRows []int64
	runID       uuid.UUID
	completion  database.CompleteBillingReconciliationRunParams
}

func (s *reconciliationStore) GetBillingSubscriptionByProviderID(context.Context, database.GetBillingSubscriptionByProviderIDParams) (database.BillingSubscription, error) {
	return s.providerRow, s.providerErr
}

func (s *reconciliationStore) UpsertBillingSubscription(_ context.Context, arg database.UpsertBillingSubscriptionParams) (database.BillingSubscription, error) {
	s.upserts = append(s.upserts, arg)
	return database.BillingSubscription{}, nil
}

func (s *reconciliationStore) UpsertBillingSubscriptionIfChanged(context.Context, database.UpsertBillingSubscriptionIfChangedParams) (int64, error) {
	if len(s.changedRows) == 0 {
		return 0, nil
	}
	rows := s.changedRows[0]
	s.changedRows = s.changedRows[1:]
	return rows, nil
}

func (s *reconciliationStore) InsertBillingReconciliationRun(_ context.Context, id uuid.UUID) (database.BillingReconciliationRun, error) {
	s.runID = id
	return database.BillingReconciliationRun{ID: id}, nil
}

func (s *reconciliationStore) CompleteBillingReconciliationRun(_ context.Context, arg database.CompleteBillingReconciliationRunParams) error {
	s.completion = arg
	return nil
}

func TestSubscriptionWebhookUsesAuthoritativeStateAndMetadata(t *testing.T) {
	t.Parallel()
	userID := uuid.New()
	periodEnd := time.Now().Add(24 * time.Hour)
	store := &reconciliationStore{providerErr: pgx.ErrNoRows}
	svc := New(Options{Store: store})
	authoritative := testStripeSubscription("prod_supporter", "price_monthly", periodEnd)
	authoritative.ID = "sub_authoritative"
	authoritative.Customer = &stripe.Customer{ID: "cus_authoritative"}
	authoritative.Status = stripe.SubscriptionStatusActive
	authoritative.Metadata = map[string]string{
		"chronicle_user_id":      userID.String(),
		"chronicle_product_code": string(ProductSupporter),
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
	require.Equal(t, string(stripe.SubscriptionStatusActive), store.upserts[0].Status)
}

func TestSubscriptionWebhookFallsBackToLocalOwner(t *testing.T) {
	t.Parallel()
	userID := uuid.New()
	store := &reconciliationStore{providerRow: database.BillingSubscription{UserID: userID, ProductCode: string(ProductSupporter)}}
	svc := New(Options{Store: store})
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
}

func TestReconciliationCountsChangedNoopAndInvalidMetadata(t *testing.T) {
	t.Parallel()
	userID := uuid.New()
	validChanged := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	validChanged.ID = "sub_changed"
	validChanged.Customer = &stripe.Customer{ID: "cus_changed"}
	validChanged.Metadata = map[string]string{"chronicle_user_id": userID.String(), "chronicle_product_code": string(ProductSupporter)}
	validNoop := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	validNoop.ID = "sub_noop"
	validNoop.Customer = &stripe.Customer{ID: "cus_noop"}
	validNoop.Metadata = map[string]string{"chronicle_user_id": uuid.NewString(), "chronicle_product_code": string(ProductSupporter)}
	invalid := testStripeSubscription("prod_supporter", "price_monthly", time.Now().Add(time.Hour))
	invalid.ID = "sub_invalid"
	invalid.Customer = &stripe.Customer{ID: "cus_invalid"}
	invalid.Metadata = map[string]string{"chronicle_user_id": "not-a-uuid", "chronicle_product_code": string(ProductSupporter)}

	store := &reconciliationStore{changedRows: []int64{1, 0}}
	svc := New(Options{Store: store})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) {
		return []*stripe.Subscription{validChanged, validNoop, invalid}, nil
	}
	worker := &ReconciliationWorker{Billing: svc, Store: store}
	require.NoError(t, worker.Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{}))
	require.NotEqual(t, uuid.Nil, store.runID)
	require.Equal(t, "completed", store.completion.Status)
	require.Equal(t, int32(3), store.completion.SubscriptionsSeen)
	require.Equal(t, int32(1), store.completion.SubscriptionsChanged)
	require.Equal(t, int32(1), store.completion.SubscriptionsSkippedInvalid)
}

func TestReconciliationRecordsFailureAndRetries(t *testing.T) {
	t.Parallel()
	store := &reconciliationStore{}
	svc := New(Options{Store: store})
	svc.listSubscriptions = func(context.Context) ([]*stripe.Subscription, error) { return nil, errors.New("stripe unavailable") }
	worker := &ReconciliationWorker{Billing: svc, Store: store}
	err := worker.Work(context.Background(), &river.Job[ArgsReconcileSubscriptions]{})
	require.ErrorContains(t, err, "stripe unavailable")
	require.Equal(t, "failed", store.completion.Status)
	require.Contains(t, store.completion.ErrorText, "stripe unavailable")
}
