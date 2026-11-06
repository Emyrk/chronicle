// Package parseargs defines shared River job arguments for parse scoring.
// This eliminates the circular-mirror pattern: both the enqueue site
// (chronicle/logparse.go) and the worker (servicerankings) import this
// package instead of duplicating the type.
package parseargs

import (
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindComputeParseScores = "compute-parse-scores"

// ArgsComputeParseScores is the per-instance parse score computation job.
// Enqueued after a parse transaction commits.
type ArgsComputeParseScores struct {
	InstanceID uuid.UUID `json:"instance_id"`
	TenantID   uuid.UUID `json:"tenant_id"`
	// Attempt and RetryReason are retained to decode jobs queued before windowed
	// scoring removed snapshot retry scheduling. They are otherwise ignored.
	Attempt     int    `json:"attempt"`
	RetryReason string `json:"retry_reason,omitempty"`
}

func (ArgsComputeParseScores) Kind() string { return KindComputeParseScores }

const KindComputeTimeParseScores = "compute-time-parse-scores"

// ArgsComputeTimeParseScores atomically computes locked clear/boss duration
// parses for one instance. Force replaces an existing successful contract and
// is used after a successful reparse or for an explicit recompute.
type ArgsComputeTimeParseScores struct {
	InstanceID uuid.UUID `json:"instance_id"`
	TenantID   uuid.UUID `json:"tenant_id"`
	Force      bool      `json:"force,omitempty"`
}

func (ArgsComputeTimeParseScores) Kind() string { return KindComputeTimeParseScores }

func (ArgsComputeTimeParseScores) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
			},
		},
	}
}

func (ArgsComputeParseScores) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
			},
		},
	}
}
