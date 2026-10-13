package chroniclesdk

import "time"

type BillingCheckoutResponse struct {
	URL string `json:"url"`
}

type BillingSummary struct {
	Enabled           bool       `json:"enabled"`
	Tier              string     `json:"tier"`
	AdsFree           bool       `json:"ads_free"`
	Status            string     `json:"status,omitempty"`
	CurrentPeriodEnd  *time.Time `json:"current_period_end,omitempty"`
	CancelAtPeriodEnd bool       `json:"cancel_at_period_end,omitempty"`
}

type AdminGrantBillingMonthsRequest struct {
	Months int32  `json:"months"`
	Reason string `json:"reason"`
}

type AdminGrantBillingMonthsResponse struct {
	Tier      string    `json:"tier"`
	StartsAt  time.Time `json:"starts_at"`
	ExpiresAt time.Time `json:"expires_at"`
	Months    int32     `json:"months"`
	Reason    string    `json:"reason"`
}
