package chroniclesdk

import "time"

type BillingCheckoutRequest struct {
	PriceID     string `json:"price_id"`
	OperationID string `json:"operation_id"`
}

type BillingCheckoutResponse struct {
	URL string `json:"url"`
}

type BillingPrice struct {
	ID             string `json:"id"`
	Tier           string `json:"tier"`
	Currency       string `json:"currency"`
	UnitAmount     int64  `json:"unit_amount"`
	IntervalMonths int64  `json:"interval_months"`
}

type BillingSummary struct {
	Enabled           bool           `json:"enabled"`
	Tier              string         `json:"tier"`
	AdsFree           bool           `json:"ads_free"`
	HasSubscription   bool           `json:"has_subscription"`
	HasBillingAccount bool           `json:"has_billing_account"`
	CanCheckout       bool           `json:"can_checkout"`
	Status            string         `json:"status,omitempty"`
	CurrentPeriodEnd  *time.Time     `json:"current_period_end,omitempty"`
	CancelAtPeriodEnd bool           `json:"cancel_at_period_end,omitempty"`
	CancelAt          *time.Time     `json:"cancel_at,omitempty"`
	CustomerID        string         `json:"customer_id,omitempty"`
	Entitlements      []string       `json:"entitlements"`
	Prices            []BillingPrice `json:"prices,omitempty"`
}

type AdminBillingReconciliationRun struct {
	ID                          string     `json:"id"`
	Status                      string     `json:"status"`
	StartedAt                   time.Time  `json:"started_at"`
	CompletedAt                 *time.Time `json:"completed_at,omitempty"`
	ProviderCustomersFound      int32      `json:"provider_customers_found"`
	LocalSubscriptionsFound     int32      `json:"local_subscriptions_found"`
	SubscriptionsSeen           int32      `json:"subscriptions_seen"`
	SubscriptionsChanged        int32      `json:"subscriptions_changed"`
	SubscriptionsSkippedInvalid int32      `json:"subscriptions_skipped_invalid"`
	EntitlementCustomersFound   int32      `json:"entitlement_customers_found"`
	EntitlementCustomersSynced  int32      `json:"entitlement_customers_synced"`
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
	CancelAt               *time.Time `json:"cancel_at,omitempty"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

type AdminBillingActivityResponse struct {
	ReconciliationRuns []AdminBillingReconciliationRun `json:"reconciliation_runs"`
	WebhookDeliveries  []AdminBillingWebhookDelivery   `json:"webhook_deliveries"`
	Subscriptions      []AdminBillingSubscription      `json:"subscriptions"`
}
