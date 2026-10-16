package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

const SidekickOnlineThreshold = 3 * time.Minute

type SidekickInstallation struct {
	ID             uuid.UUID              `json:"id"`
	Name           string                 `json:"name"`
	Platform       string                 `json:"platform,omitempty"`
	Version        string                 `json:"version,omitempty"`
	Online         bool                   `json:"online"`
	LastSeenAt     *time.Time             `json:"last_seen_at,omitempty"`
	LastUploadAt   *time.Time             `json:"last_upload_at,omitempty"`
	DisconnectedAt *time.Time             `json:"disconnected_at,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	WoWDirectories []SidekickWoWDirectory `json:"wow_directories"`
	Issues         []SidekickIssue        `json:"issues"`
}

type SidekickWoWDirectory struct {
	Path          string `json:"path"`
	TenantName    string `json:"tenant_name"`
	TenantBaseURL string `json:"tenant_base_url"`
	Realmlist     string `json:"realmlist,omitempty"`
}

type SidekickIssue struct {
	ID              uuid.UUID  `json:"id"`
	Code            string     `json:"code"`
	Message         string     `json:"message"`
	Details         string     `json:"details,omitempty"`
	FirstReportedAt time.Time  `json:"first_reported_at"`
	LastReportedAt  time.Time  `json:"last_reported_at"`
	ResolvedAt      *time.Time `json:"resolved_at,omitempty"`
}

type ListSidekicksResponse struct {
	Sidekicks []SidekickInstallation `json:"sidekicks"`
}

type RenameSidekickRequest struct {
	Name string `json:"name"`
}

type SidekickStatusRequest struct {
	Platform       string                 `json:"platform,omitempty"`
	Version        string                 `json:"version,omitempty"`
	WoWDirectories []SidekickWoWDirectory `json:"wow_directories"`
	Issues         []SidekickIssueReport  `json:"issues"`
}

type SidekickIssueReport struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}
