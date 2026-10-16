package chronicle

import (
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/riverqueue/river"
)

// RegisterParsingWorkers configures a River client to consume every job kind
// assigned to the log-parsing queue.
func (c *Chronicle) RegisterParsingWorkers(q *riverqueue.Queues, maxWorkers int) {
	q.AddQueue(riverqueue.QueueLogParsing, river.QueueConfig{
		MaxWorkers: maxWorkers,
	})
	riverqueue.AddWorker(q, c.NewWorkerLogParse())
	riverqueue.AddWorker(q, c.NewWorkerReLogParse())
	riverqueue.AddWorker(q, c.NewWorkerRegressionSnapshot())
}
