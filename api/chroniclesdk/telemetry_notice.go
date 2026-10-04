package chroniclesdk

import "time"

type TelemetryNoticeSeverity string

const (
	TelemetryNoticeSeverityInfo     TelemetryNoticeSeverity = "info"
	TelemetryNoticeSeverityWarning  TelemetryNoticeSeverity = "warning"
	TelemetryNoticeSeverityCritical TelemetryNoticeSeverity = "critical"
)

type TelemetryNotice struct {
	ID          string                  `json:"id"`
	Audience    string                  `json:"audience"`
	Category    string                  `json:"category"`
	Severity    TelemetryNoticeSeverity `json:"severity"`
	Title       string                  `json:"title"`
	Message     string                  `json:"message"`
	ActionLabel *string                 `json:"action_label,omitempty"`
	ActionURL   *string                 `json:"action_url,omitempty"`
	StartsAt    *time.Time              `json:"starts_at,omitempty"`
	ExpiresAt   *time.Time              `json:"expires_at,omitempty"`
	UpdatedAt   time.Time               `json:"updated_at"`
}

type TelemetryNoticesResponse struct {
	Notices []TelemetryNotice `json:"notices"`
}
