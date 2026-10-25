package billing

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v87"
)

const subscriptionNotificationTimeout = 5 * time.Second

// SubscriptionChangeNotification describes a persisted Stripe subscription
// change for optional external notification delivery.
type SubscriptionChangeNotification struct {
	EventType              string
	UserID                 uuid.UUID
	ProviderCustomerID     string
	ProviderSubscriptionID string
	ProductCode            string
	Status                 string
	CurrentPeriodEnd       time.Time
	CancelAtPeriodEnd      bool
	CancelAt               time.Time
}

// SetSubscriptionChangeNotifier configures best-effort notification delivery
// after Stripe subscription state and entitlements have been persisted.
func (s *Service) SetSubscriptionChangeNotifier(notify func(context.Context, SubscriptionChangeNotification) error) {
	if s != nil {
		s.subscriptionChangeNotifier = notify
	}
}

func (s *Service) notifySubscriptionChange(ctx context.Context, change SubscriptionChangeNotification) {
	if s == nil || s.subscriptionChangeNotifier == nil {
		return
	}
	notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), subscriptionNotificationTimeout)
	defer cancel()
	if err := s.subscriptionChangeNotifier(notifyCtx, change); err != nil {
		slog.ErrorContext(notifyCtx, "failed to enqueue Stripe subscription change notification",
			"event_type", change.EventType,
			"subscription_id", change.ProviderSubscriptionID,
			"error", err,
		)
	}
}

func (s *Service) stripeSubscriptionChange(eventType stripe.EventType, userID uuid.UUID, sub *stripe.Subscription) SubscriptionChangeNotification {
	change := SubscriptionChangeNotification{
		EventType: string(eventType),
		UserID:    userID,
	}
	if sub == nil {
		return change
	}
	change.ProviderSubscriptionID = sub.ID
	change.Status = string(sub.Status)
	change.CancelAtPeriodEnd = sub.CancelAtPeriodEnd
	if sub.Customer != nil {
		change.ProviderCustomerID = sub.Customer.ID
	}
	if sub.CancelAt > 0 {
		change.CancelAt = time.Unix(sub.CancelAt, 0).UTC()
	}
	if purchase, err := stripeSubscriptionPurchase(sub); err == nil {
		change.CurrentPeriodEnd = purchase.periodEnd.Time
		if product, err := s.validateSubscriptionPurchase(purchase); err == nil {
			change.ProductCode = string(product)
		}
	}
	return change
}

func deletedSubscriptionChange(eventType stripe.EventType, snapshot stripe.Subscription, row database.BillingSubscription) SubscriptionChangeNotification {
	change := SubscriptionChangeNotification{
		EventType:              string(eventType),
		UserID:                 row.UserID,
		ProviderCustomerID:     row.ProviderCustomerID,
		ProviderSubscriptionID: snapshot.ID,
		ProductCode:            row.ProductCode,
		Status:                 string(stripe.SubscriptionStatusCanceled),
		CurrentPeriodEnd:       row.CurrentPeriodEnd.Time,
		CancelAtPeriodEnd:      row.CancelAtPeriodEnd,
		CancelAt:               row.CancelAt.Time,
	}
	if change.ProviderSubscriptionID == "" {
		change.ProviderSubscriptionID = row.ProviderSubscriptionID.String
	}
	if change.ProviderCustomerID == "" && snapshot.Customer != nil {
		change.ProviderCustomerID = snapshot.Customer.ID
	}
	return change
}
