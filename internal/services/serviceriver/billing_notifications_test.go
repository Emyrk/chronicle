package serviceriver

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v87"
)

func TestBillingSubscriptionNotificationArgs(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	periodEnd := time.Date(2026, time.November, 18, 23, 25, 45, 0, time.UTC)
	cancelAt := time.Date(2026, time.November, 17, 23, 25, 45, 0, time.UTC)
	args := billingSubscriptionNotificationArgs("https://chronicle.example/", billing.SubscriptionChangeNotification{
		EventType:              string(stripe.EventTypeCustomerSubscriptionUpdated),
		UserID:                 userID,
		ProviderCustomerID:     "cus_123",
		ProviderSubscriptionID: "sub_123",
		ProductCode:            billing.TierExalted,
		ProviderPriceID:        "price_annual",
		UnitAmount:             1800,
		Currency:               "usd",
		IntervalMonths:         12,
		Quantity:               2,
		Status:                 string(stripe.SubscriptionStatusActive),
		CurrentPeriodEnd:       periodEnd,
		CancelAt:               cancelAt,
	})

	require.Equal(t, "Stripe subscription updated", args.Title)
	require.Equal(t, "https://chronicle.example/admin/billing", args.URL)
	require.Equal(t, []chroniclebot.AdminNotificationField{
		{Name: "User", Value: userID.String(), Inline: true},
		{Name: "Tier", Value: billing.TierExalted, Inline: true},
		{Name: "Status", Value: string(stripe.SubscriptionStatusActive), Inline: true},
		{Name: "Event", Value: string(stripe.EventTypeCustomerSubscriptionUpdated)},
		{Name: "Subscription price", Value: "36.00 USD", Inline: true},
		{Name: "Billing period", Value: "12 months", Inline: true},
		{Name: "Quantity", Value: "2", Inline: true},
		{Name: "Price", Value: "price_annual"},
		{Name: "Subscription", Value: "sub_123"},
		{Name: "Customer", Value: "cus_123"},
		{Name: "Current period ends", Value: periodEnd.Format(time.RFC3339)},
		{Name: "Cancels at", Value: cancelAt.Format(time.RFC3339)},
	}, args.Fields)
}

func TestFormatMinorUnits(t *testing.T) {
	t.Parallel()

	require.Equal(t, "18.00 USD", formatMinorUnits(1800, "usd"))
	require.Equal(t, "1800 JPY", formatMinorUnits(1800, "jpy"))
	require.Equal(t, "1800 CUSTOM (minor units)", formatMinorUnits(1800, "custom"))
}

func TestStripeSubscriptionNotificationTitles(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Stripe subscription changed during reconciliation", stripeSubscriptionNotificationTitle(billing.SubscriptionChangeEventReconciled))
	require.Equal(t, "Stripe subscription canceled during reconciliation", stripeSubscriptionNotificationTitle(billing.SubscriptionChangeEventReconciledCanceled))
	require.Equal(t, "Stripe subscription created", stripeSubscriptionNotificationTitle(string(stripe.EventTypeCustomerSubscriptionCreated)))
	require.Equal(t, "Stripe subscription updated", stripeSubscriptionNotificationTitle(string(stripe.EventTypeCustomerSubscriptionUpdated)))
	require.Equal(t, "Stripe subscription deleted", stripeSubscriptionNotificationTitle(string(stripe.EventTypeCustomerSubscriptionDeleted)))
}
