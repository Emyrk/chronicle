package billing

import (
	"context"
	"testing"
	"time"

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

func TestRolesHaveEntitlement(t *testing.T) {
	t.Parallel()
	require.True(t, RolesHaveEntitlement([]string{"user", "supporter"}, EntitlementAdFree))
	require.False(t, RolesHaveEntitlement([]string{"user"}, EntitlementAdFree))
}

type entitlementStore struct {
	database.Store
	grant           bool
	subscription    database.BillingSubscription
	subscriptionErr error
	grantChecks     []database.HasActiveBillingGrantParams
	upsert          database.UpsertBillingSubscriptionParams
	upsertCalled    bool
}

func (s *entitlementStore) HasActiveBillingGrant(_ context.Context, arg database.HasActiveBillingGrantParams) (bool, error) {
	s.grantChecks = append(s.grantChecks, arg)
	return s.grant, nil
}

func (s *entitlementStore) GetBillingSubscriptionByUserID(context.Context, uuid.UUID) (database.BillingSubscription, error) {
	return s.subscription, s.subscriptionErr
}

func (s *entitlementStore) UpsertBillingSubscription(_ context.Context, arg database.UpsertBillingSubscriptionParams) (database.BillingSubscription, error) {
	s.upsert = arg
	s.upsertCalled = true
	return database.BillingSubscription{}, nil
}

func TestHasEntitlement(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	tests := []struct {
		name      string
		roles     []string
		grant     bool
		sub       database.BillingSubscription
		subErr    error
		want      bool
		wantGrant bool
	}{
		{name: "role", roles: []string{string(ProductSupporter)}, subErr: pgx.ErrNoRows, want: true},
		{name: "grant", grant: true, subErr: pgx.ErrNoRows, want: true, wantGrant: true},
		{name: "subscription", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: string(stripe.SubscriptionStatusActive), CurrentPeriodEnd: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}}, want: true, wantGrant: true},
		{name: "none", subErr: pgx.ErrNoRows, want: false, wantGrant: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			store := &entitlementStore{
				grant:           tt.grant,
				subscription:    tt.sub,
				subscriptionErr: tt.subErr,
			}
			s := New(Options{
				Store: store,
				Roles: func(context.Context, uuid.UUID) ([]string, error) {
					return tt.roles, nil
				},
			})

			got, err := s.HasEntitlement(context.Background(), userID, EntitlementAdFree)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
			if tt.wantGrant {
				require.Equal(t, []database.HasActiveBillingGrantParams{{
					UserID:      userID,
					ProductCode: string(ProductSupporter),
				}}, store.grantChecks)
			} else {
				require.Empty(t, store.grantChecks)
			}
		})
	}
}

func TestSubscriptionHasEntitlement(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, time.October, 13, 12, 0, 0, 0, time.UTC)
	insideGrace := pgtype.Timestamptz{Time: now.Add(-entitlementGracePeriod + time.Second), Valid: true}
	atGraceBoundary := pgtype.Timestamptz{Time: now.Add(-entitlementGracePeriod), Valid: true}
	future := pgtype.Timestamptz{Time: now.Add(time.Hour), Valid: true}

	tests := []struct {
		name string
		sub  database.BillingSubscription
		want bool
	}{
		{name: "active bounded period", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "active", CurrentPeriodEnd: future}, want: true},
		{name: "trialing inside grace", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "trialing", CurrentPeriodEnd: insideGrace}, want: true},
		{name: "canceled inside grace", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "canceled", CurrentPeriodEnd: insideGrace}, want: true},
		{name: "past due inside grace", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "past_due", CurrentPeriodEnd: insideGrace}, want: true},
		{name: "grace boundary expired", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "active", CurrentPeriodEnd: atGraceBoundary}, want: false},
		{name: "active missing period", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "active"}, want: false},
		{name: "incomplete", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "incomplete", CurrentPeriodEnd: future}, want: false},
		{name: "incomplete expired", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "incomplete_expired", CurrentPeriodEnd: future}, want: false},
		{name: "paused", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "paused", CurrentPeriodEnd: future}, want: false},
		{name: "unpaid", sub: database.BillingSubscription{ProductCode: string(ProductSupporter), Status: "unpaid", CurrentPeriodEnd: future}, want: false},
		{name: "unknown product", sub: database.BillingSubscription{ProductCode: "unknown", Status: "active", CurrentPeriodEnd: future}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, subscriptionHasEntitlement(now, tt.sub, EntitlementAdFree))
		})
	}
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

func TestGiftWindowUsesCalendarMonthsAndStacks(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, time.January, 31, 12, 0, 0, 0, time.UTC)
	start, expires := giftWindow(now, pgtype.Timestamptz{}, 1)
	require.Equal(t, now, start)
	require.Equal(t, now.AddDate(0, 1, 0), expires)

	latest := pgtype.Timestamptz{Time: time.Date(2026, time.April, 15, 12, 0, 0, 0, time.UTC), Valid: true}
	start, expires = giftWindow(now, latest, 3)
	require.Equal(t, latest.Time, start)
	require.Equal(t, latest.Time.AddDate(0, 3, 0), expires)
}
