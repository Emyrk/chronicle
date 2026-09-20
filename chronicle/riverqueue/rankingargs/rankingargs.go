// Package rankingargs defines River arguments shared by ranking producers and workers.
package rankingargs

import (
	"slices"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindRefreshRankingRuns = "refresh-ranking-runs"
	KindRepairRankingRuns  = "repair-ranking-runs"
)

var activeStates = []rivertype.JobState{
	rivertype.JobStateScheduled,
	rivertype.JobStatePending,
	rivertype.JobStateAvailable,
	rivertype.JobStateRunning,
	rivertype.JobStateRetryable,
}

type ArgsRefreshRankingRuns struct {
	AffectedIDs []uuid.UUID `json:"affected_ids"`
}

func NewRefreshRankingRuns(ids ...uuid.UUID) ArgsRefreshRankingRuns {
	return ArgsRefreshRankingRuns{AffectedIDs: NormalizeIDs(ids)}
}

func (ArgsRefreshRankingRuns) Kind() string { return KindRefreshRankingRuns }

func (ArgsRefreshRankingRuns) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityHigh,
		MaxAttempts: 5,
	}
}

type ArgsRepairRankingRuns struct{}

func (ArgsRepairRankingRuns) Kind() string { return KindRepairRankingRuns }

func (ArgsRepairRankingRuns) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 5,
		UniqueOpts: river.UniqueOpts{
			ByState: activeStates,
		},
	}
}

func NormalizeIDs(ids []uuid.UUID) []uuid.UUID {
	normalized := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id != uuid.Nil {
			normalized = append(normalized, id)
		}
	}
	slices.SortFunc(normalized, func(a, b uuid.UUID) int { return slices.Compare(a[:], b[:]) })
	return slices.Compact(normalized)
}
