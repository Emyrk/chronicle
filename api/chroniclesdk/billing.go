package chroniclesdk

import "time"

type BillingCheckoutRequest struct {
	PriceID string `json:"price_id"`
}

type BillingCheckoutResponse struct {
	URL string `json:"url"`
}

type BillingPrice struct {
	ID             string `json:"id"`
	Currency       string `json:"currency"`
	UnitAmount     int64  `json:"unit_amount"`
	IntervalMonths int64  `json:"interval_months"`
}

type BillingSummary struct {
	Enabled           bool           `json:"enabled"`
	Tier              string         `json:"tier"`
	AdsFree           bool           `json:"ads_free"`
	Status            string         `json:"status,omitempty"`
	CurrentPeriodEnd  *time.Time     `json:"current_period_end,omitempty"`
	CancelAtPeriodEnd bool           `json:"cancel_at_period_end,omitempty"`
	Prices            []BillingPrice `json:"prices,omitempty"`
}

type AdminBillingReconciliationRun struct {
	ID                          string     `json:"id"`
	Status                      string     `json:"status"`
	StartedAt                   time.Time  `json:"started_at"`
	CompletedAt                 *time.Time `json:"completed_at,omitempty"`
	SubscriptionsSeen           int32      `json:"subscriptions_seen"`
	SubscriptionsChanged        int32      `json:"subscriptions_changed"`
	SubscriptionsSkippedInvalid int32      `json:"subscriptions_skipped_invalid"`
	ErrorText                   string     `json:"error_text,omitempty"`
}

type AdminBillingWebhookDelivery struct {
	StripeEventID string     `json:"stripe_event_id"`
	EventType     string     `json:"event_type"`
	ReceivedAt    time.Time  `json:"received_at"`
	ProcessedAt   *time.Time `json:"processed_at,omitempty"`
}

type AdminBillingSubscription struct {
	UserID                 string     `json:"user_id"`
	Provider               string     `json:"provider"`
	ProviderCustomerID     string     `json:"provider_customer_id"`
	ProviderSubscriptionID string     `json:"provider_subscription_id,omitempty"`
	ProviderProductID      string     `json:"provider_product_id,omitempty"`
	ProviderPriceID        string     `json:"provider_price_id,omitempty"`
	ProductCode            string     `json:"product_code"`
	Status                 string     `json:"status"`
	CurrentPeriodEnd       *time.Time `json:"current_period_end,omitempty"`
	CancelAtPeriodEnd      bool       `json:"cancel_at_period_end"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

type AdminBillingActivityResponse struct {
	ReconciliationRuns []AdminBillingReconciliationRun `json:"reconciliation_runs"`
	WebhookDeliveries  []AdminBillingWebhookDelivery   `json:"webhook_deliveries"`
	Subscriptions      []AdminBillingSubscription      `json:"subscriptions"`
}
