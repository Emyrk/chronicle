package billing

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v87"
)

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

func TestRoleIsAdFree(t *testing.T) {
	t.Parallel()
	require.True(t, RoleIsAdFree([]string{"user", "supporter"}))
	require.False(t, RoleIsAdFree([]string{"user"}))
}

func TestSubscriptionIsAdFree(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, time.October, 13, 12, 0, 0, 0, time.UTC)
	future := pgtype.Timestamptz{Time: now.Add(time.Hour), Valid: true}
	past := pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true}

	tests := []struct {
		name string
		sub  database.BillingSubscription
		want bool
	}{
		{name: "active supporter", sub: database.BillingSubscription{Tier: TierSupporter, Status: "active"}, want: true},
		{name: "trialing supporter", sub: database.BillingSubscription{Tier: TierSupporter, Status: "trialing"}, want: true},
		{name: "canceled but paid through", sub: database.BillingSubscription{Tier: TierSupporter, Status: "canceled", CurrentPeriodEnd: future}, want: true},
		{name: "expired cancellation", sub: database.BillingSubscription{Tier: TierSupporter, Status: "canceled", CurrentPeriodEnd: past}, want: false},
		{name: "past due", sub: database.BillingSubscription{Tier: TierSupporter, Status: "past_due"}, want: false},
		{name: "wrong tier", sub: database.BillingSubscription{Tier: TierFree, Status: "active"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, subscriptionIsAdFree(now, tt.sub))
		})
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
