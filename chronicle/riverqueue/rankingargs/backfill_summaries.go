package rankingargs

import (
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const KindBackfillRankingRunSummaries = "backfill-ranking-run-summaries"

// ArgsBackfillRankingRunSummaries advances one persisted, resumable backfill.
type ArgsBackfillRankingRunSummaries struct {
	BackfillID uuid.UUID `json:"backfill_id"`
}

func (ArgsBackfillRankingRunSummaries) Kind() string { return KindBackfillRankingRunSummaries }

func (ArgsBackfillRankingRunSummaries) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 5,
	}
}
