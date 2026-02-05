package riverqueue

import (
	"context"

	"github.com/riverqueue/river/rivertype"
)

type RiverQueuer interface {
	JobDelete(ctx context.Context, id int64) (*rivertype.JobRow, error)
}

func (q *Queues) JobDelete(ctx context.Context, jobID int64) (*rivertype.JobRow, error) {
	return q.Client.JobDelete(ctx, jobID)
}
