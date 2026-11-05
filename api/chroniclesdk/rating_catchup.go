package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// TenantRatingCatchupResponse is a lightweight public status for an evolving board.
type TenantRatingCatchupResponse struct {
	CaughtUp bool `json:"caught_up"`
}

// AdminRatingCatchupStatusResponse is a current database snapshot; it has no
// durable chart history. Re-fetching it never starts a repair job.
type AdminRatingCatchupStatusResponse struct {
	ObservedAt time.Time                  `json:"observed_at"`
	Tenants    []AdminTenantRatingCatchup `json:"tenants"`
}

// A completed policy stage's last update is its approximate finish time.
type AdminRatingPolicyStageTime struct {
	Stage       string    `json:"stage"`
	CompletedAt time.Time `json:"completed_at"`
}

type AdminTenantRatingCatchup struct {
	TenantID                   uuid.UUID                    `json:"tenant_id"`
	TenantSlug                 string                       `json:"tenant_slug"`
	Status                     string                       `json:"status"`
	ReadState                  string                       `json:"read_state"`
	DirtyRuns                  int64                        `json:"dirty_runs"`
	DirtyRenown                int64                        `json:"dirty_renown"`
	DirtyMastery               int64                        `json:"dirty_mastery"`
	DirtyPeak                  int64                        `json:"dirty_peak"`
	PolicyScanStages           int64                        `json:"policy_scan_stages"`
	UnfinishedPolicyScanStages int64                        `json:"unfinished_policy_scan_stages"`
	PolicyScanStartedAt        *time.Time                   `json:"policy_scan_started_at,omitempty"`
	PolicyScanStageTimes       []AdminRatingPolicyStageTime `json:"policy_scan_stage_times"`
	PolicyScanStageNumber      int32                        `json:"policy_scan_stage_number"`
	ActiveDrainJobs            int64                        `json:"active_drain_jobs"`
	PeakPages                  int64                        `json:"peak_pages"`
	OldestRun                  *time.Time                   `json:"oldest_run,omitempty"`
	OldestRenown               *time.Time                   `json:"oldest_renown,omitempty"`
	OldestMastery              *time.Time                   `json:"oldest_mastery,omitempty"`
	OldestPeak                 *time.Time                   `json:"oldest_peak,omitempty"`
	JobKind                    string                       `json:"job_kind,omitempty"`
	JobState                   string                       `json:"job_state,omitempty"`
	JobLastError               string                       `json:"job_last_error,omitempty"`
	JobAttemptedAt             *time.Time                   `json:"job_attempted_at,omitempty"`
	LastSucceededAt            *time.Time                   `json:"last_succeeded_at,omitempty"`
	ScanAfterRunID             *uuid.UUID                   `json:"scan_after_run_id,omitempty"`
	ScanSourceCutoff           *time.Time                   `json:"scan_source_cutoff,omitempty"`
	ScanCompletedAt            *time.Time                   `json:"scan_completed_at,omitempty"`
}
