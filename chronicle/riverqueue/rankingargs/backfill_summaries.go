package rankingargs

import (
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const KindBackfillRankingRunSummaries = "backfill-ranking-run-summaries"

// ArgsBackfillRankingRunSummaries scans logical ranking runs in UUID order and
// marks one bounded batch of missing or stale projections dirty.
type ArgsBackfillRankingRunSummaries struct {
	AfterRunID uuid.UUID `json:"after_run_id"`
}

func (ArgsBackfillRankingRunSummaries) Kind() string { return KindBackfillRankingRunSummaries }

func (ArgsBackfillRankingRunSummaries) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 5,
	}
}
