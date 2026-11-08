package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

// BeforeDate is an exclusive UTC day boundary (YYYY-MM-DD), defaulting to today.
type CreateLeaderboardOperationRequest struct {
	TenantID   uuid.UUID  `json:"tenant_id"`
	Purpose    string     `json:"purpose"`
	Scope      string     `json:"scope"`
	BeforeDate string     `json:"before_date,omitempty"`
	RunID      *uuid.UUID `json:"run_id,omitempty"`
}

type LeaderboardOperation struct {
	Backlog           *LeaderboardOperationBacklog `json:"backlog,omitempty"`
	MissingDates      int64                        `json:"missing_dates"`
	DateBasis         string                       `json:"date_basis"`
	ID                uuid.UUID                    `json:"id"`
	TenantID          uuid.UUID                    `json:"tenant_id"`
	RequestedBy       uuid.UUID                    `json:"requested_by"`
	Purpose           string                       `json:"purpose"`
	Scope             string                       `json:"scope"`
	RunID             *uuid.UUID                   `json:"run_id,omitempty"`
	BeforeDate        string                       `json:"before_date"`
	Cutoff            time.Time                    `json:"cutoff"`
	State             string                       `json:"state"`
	Phase             string                       `json:"phase"`
	Discovered        int64                        `json:"discovered"`
	DiscoveryComplete bool                         `json:"discovery_complete"`
	StartedAt         time.Time                    `json:"started_at"`
	CompletedAt       *time.Time                   `json:"completed_at,omitempty"`
	LastProgressAt    time.Time                    `json:"last_progress_at"`
	RetryCount        int32                        `json:"retry_count"`
	LastError         string                       `json:"last_error"`
}

type LeaderboardOperationList struct {
	Operations []LeaderboardOperation `json:"operations"`
}

type LeaderboardMaintenance struct {
	MissingDates int64     `json:"missing_dates"`
	DateBasis    string    `json:"date_basis"`
	Kind         string    `json:"kind"`
	State        string    `json:"state"`
	Message      string    `json:"message"`
	BeforeDate   string    `json:"before_date"`
	Cutoff       time.Time `json:"cutoff"`
}

type LeaderboardMaintenanceResponse struct {
	Maintenance *LeaderboardMaintenance `json:"maintenance"`
}

type LeaderboardOperationBacklog struct {
	D1Pending       int64      `json:"d1_pending"`
	D2Pending       int64      `json:"d2_pending"`
	OldestPendingAt *time.Time `json:"oldest_pending_at,omitempty"`
	PendingRetries  int64      `json:"pending_retries"`
}
