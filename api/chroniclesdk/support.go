package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type SupportProvider string

const (
	SupportProviderManual         SupportProvider = "manual"
	SupportProviderPatreon        SupportProvider = "patreon"
	SupportProviderGitHubSponsors SupportProvider = "github_sponsors"
	SupportProviderBuyMeACoffee   SupportProvider = "buy_me_a_coffee"
)

type SupportSettings struct {
	PublicEnabled    bool      `json:"public_enabled"`
	Currency         string    `json:"currency"`
	MonthlyGoalCents int64     `json:"monthly_goal_cents"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type UpdateSupportSettingsRequest struct {
	PublicEnabled    bool   `json:"public_enabled"`
	Currency         string `json:"currency"`
	MonthlyGoalCents int64  `json:"monthly_goal_cents"`
}

type SupportService struct {
	ID              uuid.UUID       `json:"id"`
	Provider        SupportProvider `json:"provider"`
	DisplayName     string          `json:"display_name"`
	PublicURL       string          `json:"public_url,omitempty"`
	Enabled         bool            `json:"enabled"`
	ReceivedCents   int64           `json:"received_cents"`
	RecurringCents  int64           `json:"recurring_cents"`
	UpdatedAt       time.Time       `json:"updated_at"`
	TotalsUpdatedAt *time.Time      `json:"totals_updated_at,omitempty"`
}

type CreateSupportServiceRequest struct {
	Provider       SupportProvider `json:"provider"`
	DisplayName    string          `json:"display_name"`
	PublicURL      string          `json:"public_url,omitempty"`
	Enabled        bool            `json:"enabled"`
	ReceivedCents  int64           `json:"received_cents"`
	RecurringCents int64           `json:"recurring_cents"`
}

type UpdateSupportServiceRequest = CreateSupportServiceRequest

type SupportAdminResponse struct {
	Month    string           `json:"month"`
	Settings SupportSettings  `json:"settings"`
	Services []SupportService `json:"services"`
}

type SupportSummaryProvider struct {
	Provider       SupportProvider `json:"provider"`
	DisplayName    string          `json:"display_name"`
	PublicURL      string          `json:"public_url,omitempty"`
	ReceivedCents  int64           `json:"received_cents"`
	RecurringCents int64           `json:"recurring_cents"`
}

type SupportSummary struct {
	Month                  string                   `json:"month"`
	Currency               string                   `json:"currency"`
	MonthlyGoalCents       int64                    `json:"monthly_goal_cents"`
	MonthlyRecurringCents  int64                    `json:"monthly_recurring_cents"`
	ReceivedThisMonthCents int64                    `json:"received_this_month_cents"`
	RemainingMonthlyCents  int64                    `json:"remaining_monthly_cents"`
	Providers              []SupportSummaryProvider `json:"providers"`
	UpdatedAt              time.Time                `json:"updated_at"`
}
