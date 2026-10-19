package billing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v87"
)

func TestPublicTierName(t *testing.T) {
	t.Parallel()
	require.Equal(t, "revered", TierRevered)
	require.Equal(t, "supporter", string(ProductSupporter))
}

func TestSubscriptionHasCurrentBillingStateIsIndependentFromCheckoutAndAccess(t *testing.T) {
	t.Parallel()

	providerSubscriptionID := pgtype.Text{String: "sub_123", Valid: true}
	for _, tc := range []struct {
		name                  string
		status                stripe.SubscriptionStatus
		hasReveredEntitlement bool
		want                  bool
	}{
		{name: "active", status: stripe.SubscriptionStatusActive, want: true},
		{name: "payment issue", status: stripe.SubscriptionStatusUnpaid, want: true},
		{name: "paused", status: stripe.SubscriptionStatusPaused, want: true},
		{name: "canceled with remaining access", status: stripe.SubscriptionStatusCanceled, hasReveredEntitlement: true, want: true},
		{name: "canceled without access", status: stripe.SubscriptionStatusCanceled, want: false},
		{name: "incomplete expired", status: stripe.SubscriptionStatusIncompleteExpired, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, subscriptionHasCurrentBillingState(database.BillingSubscription{
				ProviderSubscriptionID: providerSubscriptionID,
				Status:                 string(tc.status),
			}, tc.hasReveredEntitlement))
		})
	}
}

func TestSubscriptionBlocksCheckoutMatchesManageableSubscriptionState(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.October, 18, 12, 0, 0, 0, time.UTC)
	periodEnd := pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true}

	for _, tc := range []struct {
		name                  string
		status                stripe.SubscriptionStatus
		end                   pgtype.Timestamptz
		cancelAt              pgtype.Timestamptz
		hasReveredEntitlement bool
		want                  bool
	}{
		{name: "active", status: stripe.SubscriptionStatusActive, end: periodEnd, want: true},
		{name: "trialing", status: stripe.SubscriptionStatusTrialing, end: periodEnd, want: true},
		{name: "canceled with remaining entitlement", status: stripe.SubscriptionStatusCanceled, end: periodEnd, hasReveredEntitlement: true, want: true},
		{name: "refunded canceled without entitlement", status: stripe.SubscriptionStatusCanceled, end: periodEnd, want: false},
		{name: "past due in grace period", status: stripe.SubscriptionStatusPastDue, end: periodEnd, want: true},
		{name: "explicit cancellation date overrides a later period end", status: stripe.SubscriptionStatusActive, end: periodEnd, cancelAt: pgtype.Timestamptz{Time: now.Add(-4 * 24 * time.Hour), Valid: true}, want: false},
		{name: "expired beyond grace period", status: stripe.SubscriptionStatusCanceled, end: pgtype.Timestamptz{Time: now.Add(-4 * 24 * time.Hour), Valid: true}, hasReveredEntitlement: true, want: false},
		{name: "unpaid", status: stripe.SubscriptionStatusUnpaid, end: periodEnd, want: false},
		{name: "missing period end", status: stripe.SubscriptionStatusActive, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, subscriptionBlocksCheckout(now, database.BillingSubscription{
				Status:           string(tc.status),
				CurrentPeriodEnd: tc.end,
				CancelAt:         tc.cancelAt,
			}, tc.hasReveredEntitlement))
		})
	}
}

func TestBillingSummarySeparatesCancellationRenewalAccessAndCheckoutState(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	periodEnd := time.Date(2027, time.April, 18, 0, 0, 0, 0, time.UTC)
	cancelAt := time.Now().Add(30 * 24 * time.Hour).UTC().Truncate(time.Second)
	store := &entitlementStore{
		billingEntitled: true,
		subscription: database.BillingSubscription{
			UserID:                 userID,
			Provider:               ProviderStripe,
			ProviderCustomerID:     "cus_canceling",
			ProviderSubscriptionID: pgtype.Text{String: "sub_canceling", Valid: true},
			Status:                 string(stripe.SubscriptionStatusActive),
			CurrentPeriodEnd:       pgtype.Timestamptz{Time: periodEnd, Valid: true},
			CancelAtPeriodEnd:      false,
			CancelAt:               pgtype.Timestamptz{Time: cancelAt, Valid: true},
		},
	}
	service := &Service{
		store:         store,
		stripe:        &stripe.Client{},
		webhookSecret: "whsec_test",
		priceIDs:      []string{"price_monthly"},
		accessURL:     &url.URL{Scheme: "https", Host: "example.com"},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me/billing", nil)
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	rec := httptest.NewRecorder()
	service.Summary(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var summary chroniclesdk.BillingSummary
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &summary))
	require.True(t, summary.HasBillingAccount)
	require.True(t, summary.HasSubscription)
	require.False(t, summary.CanCheckout)
	require.True(t, summary.AdsFree)
	require.Equal(t, string(stripe.SubscriptionStatusActive), summary.Status)
	require.False(t, summary.CancelAtPeriodEnd)
	require.Equal(t, &periodEnd, summary.CurrentPeriodEnd)
	require.Equal(t, &cancelAt, summary.CancelAt)
	require.Empty(t, summary.Prices)
}

func TestBillingSummaryKeepsFormerBillingAccountVisibleWhileAllowingResubscription(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	periodEnd := time.Date(2026, time.November, 15, 0, 0, 0, 0, time.UTC)
	cancelAt := time.Date(2026, time.November, 10, 0, 0, 0, 0, time.UTC)
	store := &entitlementStore{
		subscription: database.BillingSubscription{
			UserID:           userID,
			Status:           string(stripe.SubscriptionStatusCanceled),
			CurrentPeriodEnd: pgtype.Timestamptz{Time: periodEnd, Valid: true},
			CancelAt:         pgtype.Timestamptz{Time: cancelAt, Valid: true},
		},
	}
	price := testStripePrice("price_monthly", 200, stripe.PriceRecurringIntervalMonth, 1)
	service := &Service{
		store:         store,
		stripe:        &stripe.Client{},
		webhookSecret: "whsec_test",
		priceIDs:      []string{price.ID},
		accessURL:     &url.URL{Scheme: "https", Host: "example.com"},
		retrievePrice: func(context.Context, string, *stripe.PriceRetrieveParams) (*stripe.Price, error) {
			return price, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me/billing", nil)
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	rec := httptest.NewRecorder()
	service.Summary(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var summary chroniclesdk.BillingSummary
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &summary))
	require.True(t, summary.HasBillingAccount)
	require.False(t, summary.HasSubscription)
	require.True(t, summary.CanCheckout)
	require.Equal(t, string(stripe.SubscriptionStatusCanceled), summary.Status)
	require.Equal(t, &periodEnd, summary.CurrentPeriodEnd)
	require.Equal(t, &cancelAt, summary.CancelAt)
	require.Len(t, summary.Prices, 1)
}

func TestCreateCheckoutReusesExistingStripeCustomer(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &entitlementStore{
		subscription: database.BillingSubscription{
			UserID:             userID,
			Provider:           ProviderStripe,
			ProviderCustomerID: "cus_existing",
			Status:             string(stripe.SubscriptionStatusCanceled),
			CurrentPeriodEnd:   pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		},
		user: database.ChronicleUser{ID: userID, Email: "supporter@example.com"},
	}
	var checkoutParams *stripe.CheckoutSessionCreateParams
	service := &Service{
		store:         store,
		stripe:        &stripe.Client{},
		webhookSecret: "whsec_test",
		priceIDs:      []string{"price_monthly"},
		allowedPrices: map[string]struct{}{"price_monthly": {}},
		accessURL:     &url.URL{Scheme: "https", Host: "example.com"},
		createCheckoutSession: func(_ context.Context, params *stripe.CheckoutSessionCreateParams) (*stripe.CheckoutSession, error) {
			checkoutParams = params
			return &stripe.CheckoutSession{URL: "https://checkout.stripe.test/session"}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/me/billing/checkout", strings.NewReader(`{"price_id":"price_monthly"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	rec := httptest.NewRecorder()
	service.CreateCheckout(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, checkoutParams)
	require.Equal(t, "cus_existing", stripe.StringValue(checkoutParams.Customer))
	require.Nil(t, checkoutParams.CustomerEmail)
}

func TestCreateCheckoutUsesEmailWithoutExistingStripeCustomer(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &entitlementStore{
		subscriptionErr: pgx.ErrNoRows,
		user:            database.ChronicleUser{ID: userID, Email: "new-supporter@example.com"},
	}
	var checkoutParams *stripe.CheckoutSessionCreateParams
	service := &Service{
		store:         store,
		stripe:        &stripe.Client{},
		webhookSecret: "whsec_test",
		priceIDs:      []string{"price_monthly"},
		allowedPrices: map[string]struct{}{"price_monthly": {}},
		accessURL:     &url.URL{Scheme: "https", Host: "example.com"},
		createCheckoutSession: func(_ context.Context, params *stripe.CheckoutSessionCreateParams) (*stripe.CheckoutSession, error) {
			checkoutParams = params
			return &stripe.CheckoutSession{URL: "https://checkout.stripe.test/session"}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/me/billing/checkout", strings.NewReader(`{"price_id":"price_monthly"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	rec := httptest.NewRecorder()
	service.CreateCheckout(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, checkoutParams)
	require.Nil(t, checkoutParams.Customer)
	require.Equal(t, "new-supporter@example.com", stripe.StringValue(checkoutParams.CustomerEmail))
}

func TestValidateAccount(t *testing.T) {
	t.Parallel()

	t.Run("matches", func(t *testing.T) {
		t.Parallel()
		s := &Service{retrieveAccount: func(context.Context, *stripe.AccountRetrieveParams) (*stripe.Account, error) {
			return &stripe.Account{ID: "acct_expected"}, nil
		}}
		require.NoError(t, s.ValidateAccount(context.Background(), "acct_expected"))
	})

	t.Run("requires configured ID", func(t *testing.T) {
		t.Parallel()
		s := &Service{retrieveAccount: func(context.Context, *stripe.AccountRetrieveParams) (*stripe.Account, error) {
			return &stripe.Account{ID: "acct_actual"}, nil
		}}
		require.ErrorContains(t, s.ValidateAccount(context.Background(), ""), "account ID is required")
	})

	t.Run("rejects mismatch", func(t *testing.T) {
		t.Parallel()
		s := &Service{retrieveAccount: func(context.Context, *stripe.AccountRetrieveParams) (*stripe.Account, error) {
			return &stripe.Account{ID: "acct_actual"}, nil
		}}
		require.ErrorContains(t, s.ValidateAccount(context.Background(), "acct_expected"), "account mismatch")
	})

	t.Run("disabled without Stripe client", func(t *testing.T) {
		t.Parallel()
		require.NoError(t, (&Service{}).ValidateAccount(context.Background(), ""))
	})
}

func TestSupporterPrices(t *testing.T) {
	t.Parallel()

	prices := map[string]*stripe.Price{
		"price_monthly":   testStripePrice("price_monthly", 200, stripe.PriceRecurringIntervalMonth, 1),
		"price_quarterly": testStripePrice("price_quarterly", 500, stripe.PriceRecurringIntervalMonth, 3),
		"price_annual":    testStripePrice("price_annual", 1800, stripe.PriceRecurringIntervalYear, 1),
	}
	retrievals := 0
	s := &Service{
		priceIDs: []string{"price_annual", "price_monthly", "price_quarterly"},
		retrievePrice: func(_ context.Context, id string, _ *stripe.PriceRetrieveParams) (*stripe.Price, error) {
			retrievals++
			return prices[id], nil
		},
	}

	got, err := s.supporterPrices(context.Background())
	require.NoError(t, err)
	require.Equal(t, []int64{1, 3, 12}, []int64{
		got[0].IntervalMonths,
		got[1].IntervalMonths,
		got[2].IntervalMonths,
	})
	require.Equal(t, int64(200), got[0].UnitAmount)
	require.Equal(t, int64(1800), got[2].UnitAmount)

	_, err = s.supporterPrices(context.Background())
	require.NoError(t, err)
	require.Equal(t, 3, retrievals, "validated prices should be cached")
}

func TestSupporterPricesRequireOneProductAndUniquePeriods(t *testing.T) {
	t.Parallel()

	t.Run("different products", func(t *testing.T) {
		t.Parallel()
		monthly := testStripePrice("price_monthly", 200, stripe.PriceRecurringIntervalMonth, 1)
		annual := testStripePrice("price_annual", 1800, stripe.PriceRecurringIntervalYear, 1)
		annual.Product = &stripe.Product{ID: "prod_other"}
		s := testPriceService(monthly, annual)
		_, err := s.supporterPrices(context.Background())
		require.ErrorContains(t, err, "same product")
	})

	t.Run("duplicate periods", func(t *testing.T) {
		t.Parallel()
		oneYear := testStripePrice("price_year", 1800, stripe.PriceRecurringIntervalYear, 1)
		twelveMonths := testStripePrice("price_twelve_months", 1800, stripe.PriceRecurringIntervalMonth, 12)
		s := testPriceService(oneYear, twelveMonths)
		_, err := s.supporterPrices(context.Background())
		require.ErrorContains(t, err, "duplicate 12-month periods")
	})
}

func testPriceService(prices ...*stripe.Price) *Service {
	byID := make(map[string]*stripe.Price, len(prices))
	priceIDs := make([]string, 0, len(prices))
	for _, price := range prices {
		byID[price.ID] = price
		priceIDs = append(priceIDs, price.ID)
	}
	return &Service{
		priceIDs: priceIDs,
		retrievePrice: func(_ context.Context, id string, _ *stripe.PriceRetrieveParams) (*stripe.Price, error) {
			return byID[id], nil
		},
	}
}

func TestBillingPriceFromStripeRejectsUnsupportedPrices(t *testing.T) {
	t.Parallel()

	inactive := testStripePrice("price_inactive", 200, stripe.PriceRecurringIntervalMonth, 1)
	inactive.Active = false
	_, err := billingPriceFromStripe(inactive)
	require.ErrorContains(t, err, "inactive")

	weekly := testStripePrice("price_weekly", 200, stripe.PriceRecurringIntervalWeek, 1)
	_, err = billingPriceFromStripe(weekly)
	require.ErrorContains(t, err, "monthly or yearly")
}

func TestPriceAllowed(t *testing.T) {
	t.Parallel()

	s := New(Options{PriceIDs: []string{"price_monthly", "price_monthly", "price_annual"}})
	require.True(t, s.priceAllowed("price_monthly"))
	require.True(t, s.priceAllowed("price_annual"))
	require.False(t, s.priceAllowed("price_other"))
	require.Equal(t, []string{"price_monthly", "price_annual"}, s.priceIDs)
}

func testStripePrice(id string, amount int64, interval stripe.PriceRecurringInterval, count int64) *stripe.Price {
	return &stripe.Price{
		ID:            id,
		Active:        true,
		BillingScheme: stripe.PriceBillingSchemePerUnit,
		Currency:      stripe.CurrencyUSD,
		Product:       &stripe.Product{ID: "prod_supporter"},
		Recurring: &stripe.PriceRecurring{
			Interval:      interval,
			IntervalCount: count,
			UsageType:     stripe.PriceRecurringUsageTypeLicensed,
		},
		Type:       stripe.PriceTypeRecurring,
		UnitAmount: amount,
	}
}

type entitlementRoleChange struct {
	userID  uuid.UUID
	role    string
	granted bool
}

type entitlementStore struct {
	database.Store
	billingEntitled     bool
	billingEntitlements []database.BillingEntitlement
	subscription        database.BillingSubscription
	subscriptionErr     error
	user                database.ChronicleUser
	entitlementChecks   []database.HasBillingEntitlementParams
	providerCustomer    database.BillingSubscription
	providerCustomerErr error
	entitlementOwner    uuid.UUID
	persisted           []database.UpsertBillingEntitlementParams
	deletedCustomer     database.DeleteBillingEntitlementsByProviderCustomerIDParams
	dataGrant           database.UpsertDataGrantParams
	dataGrants          []database.UpsertDataGrantParams
	deletedDataGrant    database.DeleteDataGrantParams
	deletedDataGrants   []database.DeleteDataGrantParams
	roleChanges         []entitlementRoleChange
	transactionErr      error
	upsert              database.UpsertBillingSubscriptionParams
	upsertCalled        bool
}

func (s *entitlementStore) HasBillingEntitlement(_ context.Context, arg database.HasBillingEntitlementParams) (bool, error) {
	s.entitlementChecks = append(s.entitlementChecks, arg)
	return s.billingEntitled, nil
}

func (s *entitlementStore) ListBillingEntitlementsByUserID(context.Context, uuid.UUID) ([]database.BillingEntitlement, error) {
	return s.billingEntitlements, nil
}

func (s *entitlementStore) GetBillingSubscriptionByUserID(context.Context, uuid.UUID) (database.BillingSubscription, error) {
	return s.subscription, s.subscriptionErr
}

func (s *entitlementStore) GetUserByID(context.Context, uuid.UUID) (database.ChronicleUser, error) {
	return s.user, nil
}

func (s *entitlementStore) UpsertBillingSubscription(_ context.Context, arg database.UpsertBillingSubscriptionParams) (database.BillingSubscription, error) {
	s.upsert = arg
	s.upsertCalled = true
	return database.BillingSubscription{}, nil
}

func (s *entitlementStore) GetBillingSubscriptionByProviderCustomerID(_ context.Context, _ database.GetBillingSubscriptionByProviderCustomerIDParams) (database.BillingSubscription, error) {
	return s.providerCustomer, s.providerCustomerErr
}

func (s *entitlementStore) GetBillingEntitlementOwnerByProviderCustomerID(_ context.Context, _ database.GetBillingEntitlementOwnerByProviderCustomerIDParams) (uuid.UUID, error) {
	return s.entitlementOwner, nil
}

func (s *entitlementStore) InTx(ctx context.Context, fn func(database.Store) error, _ *pgx.TxOptions) error {
	if err := fn(s); err != nil {
		return err
	}
	return s.transactionErr
}

func (s *entitlementStore) DeleteBillingEntitlementsByProviderCustomerID(_ context.Context, arg database.DeleteBillingEntitlementsByProviderCustomerIDParams) error {
	s.deletedCustomer = arg
	return nil
}

func (s *entitlementStore) UpsertBillingEntitlement(_ context.Context, arg database.UpsertBillingEntitlementParams) (database.BillingEntitlement, error) {
	s.persisted = append(s.persisted, arg)
	return database.BillingEntitlement{}, nil
}

func (s *entitlementStore) UpsertDataGrant(_ context.Context, arg database.UpsertDataGrantParams) (database.DataGrant, error) {
	s.dataGrant = arg
	s.dataGrants = append(s.dataGrants, arg)
	return database.DataGrant{}, nil
}

func (s *entitlementStore) DeleteDataGrant(_ context.Context, arg database.DeleteDataGrantParams) error {
	s.deletedDataGrant = arg
	s.deletedDataGrants = append(s.deletedDataGrants, arg)
	return nil
}

func (s *entitlementStore) SetStripeEntitlementRole(_ context.Context, userID uuid.UUID, role string, granted bool) error {
	s.roleChanges = append(s.roleChanges, entitlementRoleChange{userID: userID, role: role, granted: granted})
	return nil
}

func TestHasEntitlementUsesPersistedStripeEntitlement(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &entitlementStore{billingEntitled: true}
	s := New(Options{Store: store})

	got, err := s.HasEntitlement(context.Background(), userID, EntitlementChronicleRevered)
	require.NoError(t, err)
	require.True(t, got)
	require.Equal(t, []database.HasBillingEntitlementParams{{
		UserID: userID, EntitlementKey: string(EntitlementChronicleRevered),
	}}, store.entitlementChecks)
}

func TestEntitlementSummaryWebhookFetchesAuthoritativeEntitlements(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &entitlementStore{providerCustomer: database.BillingSubscription{UserID: userID}}
	s := New(Options{Store: store})
	s.listActiveEntitlements = func(_ context.Context, customerID string) ([]*stripe.EntitlementsActiveEntitlement, error) {
		require.Equal(t, "cus_123", customerID)
		return []*stripe.EntitlementsActiveEntitlement{{ID: "ent_revered", LookupKey: string(EntitlementChronicleRevered)}}, nil
	}
	raw, err := json.Marshal(stripe.EntitlementsActiveEntitlementSummary{Customer: "cus_123"})
	require.NoError(t, err)

	err = s.processEvent(context.Background(), stripe.Event{
		Type: stripe.EventTypeEntitlementsActiveEntitlementSummaryUpdated,
		Data: &stripe.EventData{Raw: raw},
	})
	require.NoError(t, err)
	require.Len(t, store.persisted, 1)
	require.Equal(t, string(EntitlementChronicleRevered), store.persisted[0].EntitlementKey)
}

func TestSyncStripeEntitlementsPersistsAuthoritativeSnapshotAndStorageGrant(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &entitlementStore{providerCustomer: database.BillingSubscription{UserID: userID}}
	s := New(Options{Store: store})
	s.listActiveEntitlements = func(context.Context, string) ([]*stripe.EntitlementsActiveEntitlement, error) {
		return []*stripe.EntitlementsActiveEntitlement{
			{ID: "ent_revered", LookupKey: string(EntitlementChronicleRevered)},
			{ID: "ent_unknown", LookupKey: "future-entitlement"},
		}, nil
	}

	err := s.syncStripeEntitlements(context.Background(), "cus_123")
	require.NoError(t, err)
	require.Equal(t, database.DeleteBillingEntitlementsByProviderCustomerIDParams{Provider: ProviderStripe, ProviderCustomerID: "cus_123"}, store.deletedCustomer)
	require.Len(t, store.persisted, 2, "unknown entitlements remain visible in the persisted snapshot")
	require.Equal(t, stripeStorageGrantBytes, store.dataGrant.StorageBytes)
	require.Equal(t, stripeStorageGrantSource, store.dataGrant.Source)
	require.Equal(t, stripeStorageGrantSource, store.deletedDataGrant.Source)
	require.Equal(t, []entitlementRoleChange{
		{userID: userID, role: stripeRoleAdFree, granted: true},
		{userID: userID, role: stripeRoleDownloadRawLogs, granted: true},
		{userID: userID, role: stripeRoleUnlistedLogs, granted: true},
	}, store.roleChanges)
}

func TestSyncStripeEntitlementsUsesPersistedOwnerWithoutSubscription(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &entitlementStore{providerCustomerErr: pgx.ErrNoRows, entitlementOwner: userID}
	s := New(Options{Store: store})
	s.listActiveEntitlements = func(context.Context, string) ([]*stripe.EntitlementsActiveEntitlement, error) {
		return []*stripe.EntitlementsActiveEntitlement{{ID: "ent_revered", LookupKey: string(EntitlementChronicleRevered)}}, nil
	}

	require.NoError(t, s.syncStripeEntitlements(context.Background(), "cus_123"))
	require.Len(t, store.persisted, 1)
	require.Equal(t, userID, store.persisted[0].UserID)
}

func TestSyncStripeEntitlementsRemovesStorageGrantWhenAbsent(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &entitlementStore{providerCustomer: database.BillingSubscription{UserID: userID}}
	s := New(Options{Store: store})
	s.listActiveEntitlements = func(context.Context, string) ([]*stripe.EntitlementsActiveEntitlement, error) {
		return nil, nil
	}

	err := s.syncStripeEntitlements(context.Background(), "cus_123")
	require.NoError(t, err)
	require.Empty(t, store.persisted)
	require.Equal(t, database.DeleteDataGrantParams{UserID: userID, Source: stripeStorageGrantSource}, store.deletedDataGrant)
}

func TestSyncStripeEntitlementsTransfersOwnerAndAppliesRolePerEntitlement(t *testing.T) {
	t.Parallel()

	previousOwner := uuid.New()
	currentOwner := uuid.New()
	store := &entitlementStore{
		providerCustomer: database.BillingSubscription{UserID: currentOwner},
		entitlementOwner: previousOwner,
	}
	s := New(Options{Store: store})
	s.listActiveEntitlements = func(context.Context, string) ([]*stripe.EntitlementsActiveEntitlement, error) {
		return []*stripe.EntitlementsActiveEntitlement{
			{ID: "ent_revered", LookupKey: string(EntitlementChronicleRevered)},
			{ID: "ent_unknown", LookupKey: "future-entitlement"},
		}, nil
	}

	require.NoError(t, s.syncStripeEntitlements(context.Background(), "cus_123"))
	require.Len(t, store.persisted, 2, "unknown entitlements remain visible in the persisted snapshot")
	require.Equal(t, []database.DeleteDataGrantParams{
		{UserID: previousOwner, Source: stripeStorageGrantSource},
		{UserID: currentOwner, Source: stripeStorageGrantSource},
	}, store.deletedDataGrants)
	require.Equal(t, []entitlementRoleChange{
		{userID: previousOwner, role: stripeRoleAdFree, granted: false},
		{userID: previousOwner, role: stripeRoleDownloadRawLogs, granted: false},
		{userID: previousOwner, role: stripeRoleUnlistedLogs, granted: false},
		{userID: currentOwner, role: stripeRoleAdFree, granted: true},
		{userID: currentOwner, role: stripeRoleDownloadRawLogs, granted: true},
		{userID: currentOwner, role: stripeRoleUnlistedLogs, granted: true},
	}, store.roleChanges)
}

func TestEntitlementTransactionDoesNotApplyRolesWhenDatabaseCommitFails(t *testing.T) {
	t.Parallel()

	store := &entitlementStore{transactionErr: errors.New("commit failed")}
	run := NewEntitlementTransactionRunner(store, store)
	err := run(context.Background(), func(tx EntitlementTransaction) error {
		return tx.SetStripeEntitlementRole(context.Background(), uuid.New(), stripeRoleAdFree, true)
	})
	require.ErrorContains(t, err, "commit failed")
	require.Empty(t, store.roleChanges)
}

func TestStripeSubscriptionPurchase(t *testing.T) {
	t.Parallel()

	firstEnd := time.Date(2026, time.November, 15, 12, 0, 0, 0, time.UTC)
	latestEnd := firstEnd.AddDate(0, 1, 0)
	sub := testStripeSubscription("prod_supporter", "price_monthly", firstEnd)
	sub.Items.Data = append(sub.Items.Data, &stripe.SubscriptionItem{
		Price:            &stripe.Price{ID: "price_monthly", Product: &stripe.Product{ID: "prod_supporter"}},
		CurrentPeriodEnd: latestEnd.Unix(),
	})

	got, err := stripeSubscriptionPurchase(sub)
	require.NoError(t, err)
	require.Equal(t, "prod_supporter", got.productID)
	require.Equal(t, "price_monthly", got.priceID)
	require.Equal(t, pgtype.Timestamptz{Time: latestEnd, Valid: true}, got.periodEnd)
}

func TestStripeSubscriptionPurchaseRejectsInvalidItems(t *testing.T) {
	t.Parallel()

	_, err := stripeSubscriptionPurchase(&stripe.Subscription{})
	require.ErrorContains(t, err, "missing items")

	sub := testStripeSubscription("prod_supporter", "price_monthly", time.Now())
	sub.Items.Data = append(sub.Items.Data, &stripe.SubscriptionItem{
		Price: &stripe.Price{ID: "price_annual", Product: &stripe.Product{ID: "prod_supporter"}},
	})
	_, err = stripeSubscriptionPurchase(sub)
	require.ErrorContains(t, err, "multiple products or prices")
}

func TestUpsertSubscriptionPreservesExplicitCancellationFields(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	periodEnd := time.Date(2027, time.April, 18, 23, 25, 45, 0, time.UTC)
	cancelAt := time.Date(2026, time.November, 18, 23, 25, 45, 0, time.UTC)
	store := &entitlementStore{}
	s := New(Options{Store: store, PriceIDs: []string{"price_annual"}})
	sub := testStripeSubscription("prod_supporter", "price_annual", periodEnd)
	sub.ID = "sub_canceling"
	sub.Customer = &stripe.Customer{ID: "cus_canceling"}
	sub.Status = stripe.SubscriptionStatusActive
	sub.CancelAt = cancelAt.Unix()
	sub.CancelAtPeriodEnd = false

	err := s.upsertSubscription(context.Background(), userID, ProductSupporter, sub)
	require.NoError(t, err)
	require.Equal(t, pgtype.Timestamptz{Time: periodEnd, Valid: true}, store.upsert.CurrentPeriodEnd)
	require.False(t, store.upsert.CancelAtPeriodEnd)
	require.Equal(t, pgtype.Timestamptz{Time: cancelAt, Valid: true}, store.upsert.CancelAt)
}

func TestUpsertSubscriptionPersistsPurchaseIdentity(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	periodEnd := time.Date(2026, time.November, 15, 12, 0, 0, 0, time.UTC)
	store := &entitlementStore{}
	s := New(Options{Store: store, PriceIDs: []string{"price_annual"}})
	sub := testStripeSubscription("prod_supporter", "price_annual", periodEnd)
	sub.ID = "sub_123"
	sub.Customer = &stripe.Customer{ID: "cus_123"}
	sub.Status = stripe.SubscriptionStatusActive
	sub.CancelAtPeriodEnd = true

	err := s.upsertSubscription(context.Background(), userID, ProductSupporter, sub)
	require.NoError(t, err)
	require.True(t, store.upsertCalled)
	require.Equal(t, database.UpsertBillingSubscriptionParams{
		UserID:                 userID,
		Provider:               ProviderStripe,
		ProviderCustomerID:     "cus_123",
		ProviderSubscriptionID: pgtype.Text{String: "sub_123", Valid: true},
		ProviderProductID:      pgtype.Text{String: "prod_supporter", Valid: true},
		ProviderPriceID:        pgtype.Text{String: "price_annual", Valid: true},
		ProductCode:            string(ProductSupporter),
		Status:                 string(stripe.SubscriptionStatusActive),
		CurrentPeriodEnd:       pgtype.Timestamptz{Time: periodEnd, Valid: true},
		CancelAtPeriodEnd:      true,
	}, store.upsert)
}

func testStripeSubscription(productID, priceID string, periodEnd time.Time) *stripe.Subscription {
	return &stripe.Subscription{
		Items: &stripe.SubscriptionItemList{Data: []*stripe.SubscriptionItem{{
			Price:            &stripe.Price{ID: priceID, Product: &stripe.Product{ID: productID}},
			CurrentPeriodEnd: periodEnd.Unix(),
		}}},
	}
}
