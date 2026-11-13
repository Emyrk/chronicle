package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type AdminRatingCatchupStatusResponse struct {
	ObservedAt time.Time                  `json:"observed_at"`
	Tenants    []AdminTenantRatingCatchup `json:"tenants"`
}

type AdminRatingJobResponse struct {
	JobID                    int64  `json:"job_id"`
	JobState                 string `json:"job_state"`
	UniqueSkippedAsDuplicate bool   `json:"unique_skipped_as_duplicate"`
}

type AdminRatingPolicyStageTime struct {
	Stage       string    `json:"stage"`
	CompletedAt time.Time `json:"completed_at"`
}

type AdminRatingRebuildJob struct {
	ID          int64      `json:"id"`
	State       string     `json:"state"`
	Attempt     int64      `json:"attempt"`
	TenantID    uuid.UUID  `json:"tenant_id"`
	TenantName  string     `json:"tenant_name"`
	CreatedAt   time.Time  `json:"created_at"`
	AttemptedAt *time.Time `json:"attempted_at,omitempty"`
	FinalizedAt *time.Time `json:"finalized_at,omitempty"`
	// DurationSeconds is the rebuild's elapsed time: the worker's recorded
	// elapsed time when it has one, else creation to finish (or to now).
	DurationSeconds float64 `json:"duration_seconds"`
	// Slow marks a job over twice the median of the listed finished rebuilds.
	Slow           bool     `json:"slow"`
	Phase          *string  `json:"phase,omitempty"`
	Status         *string  `json:"status,omitempty"`
	PagesProcessed *int64   `json:"pages_processed,omitempty"`
	PagesPerSecond *float64 `json:"pages_per_second,omitempty"`
	LastError      *string  `json:"last_error,omitempty"`
}

type AdminRatingRebuildJobsResponse struct {
	Jobs []AdminRatingRebuildJob `json:"jobs"`
	// MedianSeconds is the median duration of the listed finished rebuilds.
	MedianSeconds float64 `json:"median_seconds"`
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
	PolicyScanStageNumber      int64                        `json:"policy_scan_stage_number"`
	ActiveDrainJobs            int64                        `json:"active_drain_jobs"`
	PeakPages                  int64                        `json:"peak_pages"`
	OldestRun                  *time.Time                   `json:"oldest_run,omitempty"`
	OldestRenown               *time.Time                   `json:"oldest_renown,omitempty"`
	OldestMastery              *time.Time                   `json:"oldest_mastery,omitempty"`
	OldestPeak                 *time.Time                   `json:"oldest_peak,omitempty"`
	JobKind                    *string                      `json:"job_kind,omitempty"`
	JobState                   *string                      `json:"job_state,omitempty"`
	JobLastError               *string                      `json:"job_last_error,omitempty"`
	JobAttemptedAt             *time.Time                   `json:"job_attempted_at,omitempty"`
	LastSucceededAt            *time.Time                   `json:"last_succeeded_at,omitempty"`
	ScanAfterRunID             *uuid.UUID                   `json:"scan_after_run_id,omitempty"`
	ScanSourceCutoff           *time.Time                   `json:"scan_source_cutoff,omitempty"`
	ScanCompletedAt            *time.Time                   `json:"scan_completed_at,omitempty"`
}
