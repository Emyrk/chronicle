package chronicle

import (
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/riverqueue/river"
)

// RegisterParsingWorkers registers every log-parsing job kind and configures
// queue consumption when maxWorkers is greater than zero.
func (c *Chronicle) RegisterParsingWorkers(q *riverqueue.Queues, maxWorkers int) {
	if maxWorkers > 0 {
		q.AddQueue(riverqueue.QueueLogParsing, river.QueueConfig{
			MaxWorkers: maxWorkers,
		})
	}
	// Keep workers registered even when this process does not consume the queue.
	// River uses the registrations to validate jobs inserted by the server.
	riverqueue.AddWorker(q, c.NewWorkerLogParse())
	riverqueue.AddWorker(q, c.NewWorkerReLogParse())
	riverqueue.AddWorker(q, c.NewWorkerRegressionSnapshot())
}
