package serviceriver

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/stripe/stripe-go/v87"
	"golang.org/x/text/currency"
)

func billingSubscriptionNotificationArgs(accessURL string, change billing.SubscriptionChangeNotification) chroniclebot.ArgsNotifyAdmin {
	fields := []chroniclebot.AdminNotificationField{
		{Name: "User", Value: change.UserID.String(), Inline: true},
		{Name: "Tier", Value: valueOrUnknown(change.ProductCode), Inline: true},
		{Name: "Status", Value: valueOrUnknown(change.Status), Inline: true},
		{Name: "Event", Value: valueOrUnknown(change.EventType)},
	}
	if price := subscriptionPriceSummary(change); price != "" {
		fields = append(fields, chroniclebot.AdminNotificationField{Name: "Subscription price", Value: price, Inline: true})
	}
	if change.IntervalMonths > 0 {
		fields = append(fields, chroniclebot.AdminNotificationField{
			Name: "Billing period", Value: formatMonths(change.IntervalMonths), Inline: true,
		})
	}
	if change.Quantity > 1 {
		fields = append(fields, chroniclebot.AdminNotificationField{
			Name: "Quantity", Value: fmt.Sprintf("%d", change.Quantity), Inline: true,
		})
	}
	fields = append(fields,
		chroniclebot.AdminNotificationField{Name: "Price", Value: valueOrUnknown(change.ProviderPriceID)},
		chroniclebot.AdminNotificationField{Name: "Subscription", Value: valueOrUnknown(change.ProviderSubscriptionID)},
		chroniclebot.AdminNotificationField{Name: "Customer", Value: valueOrUnknown(change.ProviderCustomerID)},
	)
	if !change.CurrentPeriodEnd.IsZero() {
		fields = append(fields, chroniclebot.AdminNotificationField{
			Name:  "Current period ends",
			Value: change.CurrentPeriodEnd.UTC().Format(time.RFC3339),
		})
	}
	if !change.CancelAt.IsZero() {
		fields = append(fields, chroniclebot.AdminNotificationField{
			Name:  "Cancels at",
			Value: change.CancelAt.UTC().Format(time.RFC3339),
		})
	} else if change.CancelAtPeriodEnd {
		fields = append(fields, chroniclebot.AdminNotificationField{
			Name:  "Cancellation",
			Value: "At current period end",
		})
	}
	return chroniclebot.ArgsNotifyAdmin{
		Title:  stripeSubscriptionNotificationTitle(change.EventType),
		URL:    strings.TrimRight(accessURL, "/") + "/admin/billing",
		Fields: fields,
	}
}

func subscriptionPriceSummary(change billing.SubscriptionChangeNotification) string {
	if change.UnitAmount <= 0 || change.Currency == "" {
		return ""
	}
	quantity := change.Quantity
	if quantity <= 0 {
		quantity = 1
	}
	return formatMinorUnits(change.UnitAmount*quantity, change.Currency)
}

func formatMinorUnits(amount int64, currencyCode string) string {
	currencyCode = strings.ToUpper(currencyCode)
	unit, err := currency.ParseISO(currencyCode)
	if err != nil {
		return fmt.Sprintf("%d %s (minor units)", amount, currencyCode)
	}
	scale, _ := currency.Standard.Rounding(unit)
	if scale <= 0 {
		return fmt.Sprintf("%d %s", amount, currencyCode)
	}
	divisor := int64(1)
	for range scale {
		divisor *= 10
	}
	return fmt.Sprintf("%d.%0*d %s", amount/divisor, scale, amount%divisor, currencyCode)
}

func formatMonths(months int64) string {
	if months == 1 {
		return "1 month"
	}
	return fmt.Sprintf("%d months", months)
}

func stripeSubscriptionNotificationTitle(eventType string) string {
	switch eventType {
	case billing.SubscriptionChangeEventReconciled:
		return "Stripe subscription changed during reconciliation"
	case billing.SubscriptionChangeEventReconciledCanceled:
		return "Stripe subscription canceled during reconciliation"
	}
	switch stripe.EventType(eventType) {
	case stripe.EventTypeCustomerSubscriptionCreated:
		return "Stripe subscription created"
	case stripe.EventTypeCustomerSubscriptionUpdated:
		return "Stripe subscription updated"
	case stripe.EventTypeCustomerSubscriptionDeleted:
		return "Stripe subscription deleted"
	default:
		return fmt.Sprintf("Stripe subscription changed (%s)", valueOrUnknown(eventType))
	}
}

func valueOrUnknown(value string) string {
	if value == "" {
		return "Unknown"
	}
	return value
}
