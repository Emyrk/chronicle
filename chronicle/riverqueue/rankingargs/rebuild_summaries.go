package rankingargs

import (
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindRebuildRankingRunSummaries = "rebuild-ranking-run-summaries"

// ArgsRebuildRankingRunSummaries drains the durable ranking summary dirty queue.
// Database triggers own invalidation; this coalesced job only wakes the consumer.
type ArgsRebuildRankingRunSummaries struct{}

func (ArgsRebuildRankingRunSummaries) Kind() string { return KindRebuildRankingRunSummaries }

func (ArgsRebuildRankingRunSummaries) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 5,
		UniqueOpts: river.UniqueOpts{
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
				rivertype.JobStateRetryable,
			},
		},
	}
}
