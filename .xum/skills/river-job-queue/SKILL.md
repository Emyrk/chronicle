---
name: river-job-queue
description: River is a PostgreSQL-based job queue used in Chronicle for background processing. Jobs are defined as Go types implementing rivertype.JobArgs. The queue handles log parsing, reparsing, and other async tasks. Workers process jobs from named queues with configurable priorities, retry policies, and deduplication.
---
# River Job Queue

Chronicle uses [River](https://riverqueue.com/) for background job processing, storing jobs in PostgreSQL.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        riverqueue.Queues                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Workers   │  │   Queues    │  │      River UI       │  │
│  │  (per job)  │  │  (configs)  │  │   /river endpoint   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
                   ┌─────────▼─────────┐
                   │     PostgreSQL     │
                   │  (river_* tables)  │
                   └───────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `chronicle/riverqueue/riverqueue.go` | Queue initialization, web UI setup |
| `chronicle/riverqueue/riveractions.go` | Job action methods (delete, etc.) |
| `chronicle/riverqueue/panicmw.go` | Panic recovery middleware |
| `chronicle/logparse.go` | Log parsing job (`ArgsLogParse`) |
| `chronicle/reparse.go` | Re-parsing job (`ArgsLogReparse`) |
| `chronicle/chronicle.go` | Service that enqueues jobs |

## Creating a New Job

### 1. Define Job Arguments

Job args must implement `rivertype.JobArgs` by providing `Kind()` and `InsertOpts()`:

```go
// In chronicle/myjob.go
package chronicle

import (
    "github.com/Emyrk/chronicle/chronicle/riverqueue"
    "github.com/riverqueue/river"
    "github.com/riverqueue/river/rivertype"
)

const KindMyJob = "my-job"

type ArgsMyJob struct {
    SomeID uuid.UUID `json:"some_id"`
}

func (ArgsMyJob) Kind() string { return KindMyJob }

func (ArgsMyJob) InsertOpts() river.InsertOpts {
    return river.InsertOpts{
        Queue:       riverqueue.QueueLogParsing,  // or QueueDefault
        Priority:    riverqueue.PriorityDefault,   // 1=highest, 4=low
        MaxAttempts: 5,
        UniqueOpts: river.UniqueOpts{
            ByArgs: true,  // Dedupe by args
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
```

### 2. Implement the Worker

```go
type WorkerMyJob struct {
    parent *Chronicle
    river.WorkerDefaults[ArgsMyJob]  // Provides default timeout, etc.
}

func (c *Chronicle) NewWorkerMyJob() river.Worker[ArgsMyJob] {
    return &WorkerMyJob{parent: c}
}

func (w *WorkerMyJob) Work(ctx context.Context, job *river.Job[ArgsMyJob]) error {
    // Access job args via job.Args
    id := job.Args.SomeID
    
    // Access services via w.parent
    db := w.parent.Zed
    
    // Return nil for success
    // Return error to retry (unless MaxAttempts exhausted)
    // Return river.JobCancel(err) to permanently cancel
    return nil
}

// Optional: Custom retry timing
func (w *WorkerMyJob) NextRetry(job *river.Job[ArgsMyJob]) time.Time {
    return (&river.DefaultClientRetryPolicy{}).NextRetry(job.JobRow).Add(time.Minute)
}
```

### 3. Register the Worker

In `cmd/chronicled/main.go` (or wherever the queue is initialized):

```go
// Add worker to the queue before Start()
riverqueue.AddWorker(queues, chronicle.NewWorkerMyJob())
```

### 4. Enqueue Jobs

```go
func (c *Chronicle) EnqueueMyJob(ctx context.Context, id uuid.UUID) (*rivertype.JobInsertResult, error) {
    return c.queue.Insert(ctx, ArgsMyJob{
        SomeID: id,
    }, &river.InsertOpts{
        Tags: []string{
            fmt.Sprintf("owner_%s", ownerID.String()),  // Optional filtering tags
        },
    })
}
```

## Queue Configuration

### Queues

```go
const (
    QueueLogParsing = "log-parsing"  // Dedicated queue for log parsing
    // river.QueueDefault is also available
)
```

### Priorities

```go
const (
    PriorityHighest = 1
    PriorityHigh    = 2
    PriorityDefault = 3
    PriorityLow     = 4
)
```

### Queue Worker Limits

Set in `riverqueue.New()` or via `AddQueue()`:

```go
q.AddQueue("my-queue", river.QueueConfig{MaxWorkers: 10})
```

## Job Lifecycle

```
Available → Running → Completed
              │
              ├─(error)→ Retryable → Available (retry)
              │
              └─(JobCancel)→ Cancelled
```

### Handling Failures

```go
func (w *WorkerMyJob) Work(ctx context.Context, job *river.Job[ArgsMyJob]) error {
    // Permanent failure - won't retry
    if someUnrecoverableCondition {
        return river.JobCancel(fmt.Errorf("cannot process: %v", reason))
    }
    
    // Temporary failure - will retry per MaxAttempts
    if err := doWork(); err != nil {
        return fmt.Errorf("work failed: %w", err)
    }
    
    return nil
}
```

### Recording Output

Jobs can store structured output visible in River UI:

```go
func (w *WorkerMyJob) Work(ctx context.Context, job *river.Job[ArgsMyJob]) error {
    output := map[string]any{
        "processed_count": 42,
        "duration_ms":     1234,
    }
    _ = river.RecordOutput(ctx, output)
    return nil
}
```

## Querying Jobs

```go
// List jobs for a specific log group
func (c *Chronicle) ListLogGroupJobs(ctx context.Context, groupID uuid.UUID) (*river.JobListResult, error) {
    opts := river.NewJobListParams().
        Where(`args->>'log_group_id' = @group_id`, map[string]any{
            "group_id": groupID.String(),
        }).
        Queues(riverqueue.QueueLogParsing).
        Kinds(KindLogParse, KindLogReparse).
        OrderBy(river.JobListOrderByScheduledAt, river.SortOrderDesc)
    
    return c.queue.JobList(ctx, opts)
}

// Cancel a job
_, err := c.queue.JobCancel(ctx, jobID)

// Delete a job
_, err := c.queue.JobDelete(ctx, jobID)
```

## River UI

River includes a built-in web UI mounted at `/river`:

```go
// In riverqueue.go
func webUI(ctx context.Context, logger *slog.Logger, client *river.Client[pgx.Tx]) (http.Handler, error) {
    opts := &riverui.HandlerOpts{
        Prefix: "/river",
        // ...
    }
    srv, err := riverui.NewHandler(opts)
    // ...
}
```

The UI requires authentication (enforced in the handler wrapper).

## Panic Recovery

The `workerPanicMW` middleware logs panics with stack traces before re-panicking:

```go
func (w workerPanicMW) Work(ctx context.Context, job *rivertype.JobRow, doInner func(context.Context) error) error {
    defer func() {
        if r := recover(); r != nil && r != http.ErrAbortHandler {
            w.logger.Warn("panic serving with job (recovered)",
                slog.String("job_kind", job.Kind),
                slog.Any("panic", r),
                slog.String("stack", string(debug.Stack())),
            )
            panic(r)  // Re-panic for River to handle
        }
    }()
    return doInner(ctx)
}
```

## Configuration Options

```go
river.Config{
    Queues:  queues,
    Workers: workers,
    Middleware: []rivertype.Middleware{
        NewWorkerPanicMW(logger),
    },
    CompletedJobRetentionPeriod: -1,          // Keep completed jobs forever
    RescueStuckJobsAfter:        time.Hour,   // Rescue stuck jobs after 1 hour
    JobTimeout:                  time.Minute * 30,  // Default job timeout
}
```

## Insert-Only Mode

For processes that should only enqueue jobs (not process them):

```go
opts := riverqueue.Options{
    InsertOnly: true,  // Disables worker processing
}
```

## Example: Log Parsing Flow

```
1. User uploads logs → chronicle.UploadLogs()
2. Files saved to object storage
3. Database records created in transaction
4. Job enqueued: EnqueueParseLog()
   └─ ArgsLogParse{LogID: groupID}
5. Worker picks up job
   └─ WorkerLogParse.Work()
       ├─ Download files from storage
       ├─ Sort and merge log lines
       ├─ Parse encounters
       └─ Insert parsed data to DB
6. Job marked complete with output
```
