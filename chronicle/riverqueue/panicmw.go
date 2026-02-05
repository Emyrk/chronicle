package riverqueue

import (
	"context"
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/riverqueue/river/rivertype"
)

var _ rivertype.WorkerMiddleware = (*workerPanicMW)(nil)

type workerPanicMW struct {
	logger *slog.Logger
}

func (workerPanicMW) IsMiddleware() bool { return true }

func NewWorkerPanicMW(logger *slog.Logger) *workerPanicMW {
	return &workerPanicMW{
		logger: logger,
	}
}

func (w workerPanicMW) Work(ctx context.Context, job *rivertype.JobRow, doInner func(context.Context) error) error {
	defer func() {
		r := recover()

		// Reverse proxying (among other things) may panic with
		// http.ErrAbortHandler when the request is aborted. It's not a
		// real panic so we shouldn't log them.
		//
		//nolint:errorlint // this is how the stdlib does the check
		if r != nil && r != http.ErrAbortHandler {
			w.logger.Warn(
				"panic serving with job (recovered)",
				slog.String("job_kind", job.Kind),
				slog.Any("panic", r),
				slog.String("stack", string(debug.Stack())),
			)

			panic(r)
		}
	}()

	return doInner(ctx)
}
