package chronicle

import (
	"context"
	"errors"

	"github.com/riverqueue/river"
)

// RunLogParseBaseline runs the production parser and synchronous publication path
// without a River worker. It is intended only for baseline tooling against an
// isolated database with the same input objects and reference data as production.
// Construct Chronicle with New and do not attach a queue (including concurrently
// with this call). A configured queue is rejected before any parsing or writes.
//
// The database is the result channel. Ranking refreshes, computed scores and
// notifications are not queued. River output recording outside a worker returns
// an error, which the existing parse path ignores. All other parse behavior,
// including profiling, generation fencing, partial writes on failure, timestamps
// and durations, is unchanged. In particular, a stale-generation abort returns
// nil; callers must verify publication in the database rather than treating nil
// as proof that a baseline was produced. Cancellation errors are returned intact.
func (c *Chronicle) RunLogParseBaseline(ctx context.Context, args ArgsLogParse) error {
	if c.queue != nil {
		return errors.New("baseline parsing requires a Chronicle without a queue")
	}
	return (&WorkerLogParse{parent: c}).work(ctx, &river.Job[ArgsLogParse]{Args: args}, newRankingRunRefreshPlan(args))
}
