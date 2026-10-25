package serviceriver

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/stripe/stripe-go/v87"
)

func billingSubscriptionNotificationArgs(accessURL string, change billing.SubscriptionChangeNotification) chroniclebot.ArgsNotifyAdmin {
	fields := []chroniclebot.AdminNotificationField{
		{Name: "User", Value: change.UserID.String(), Inline: true},
		{Name: "Tier", Value: valueOrUnknown(change.ProductCode), Inline: true},
		{Name: "Status", Value: valueOrUnknown(change.Status), Inline: true},
		{Name: "Subscription", Value: valueOrUnknown(change.ProviderSubscriptionID)},
		{Name: "Customer", Value: valueOrUnknown(change.ProviderCustomerID)},
	}
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

func stripeSubscriptionNotificationTitle(eventType string) string {
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
