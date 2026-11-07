# Historical backfill and repair operations

Operations are explicitly requested by an authorized administrator; service startup
only resumes already-persisted operations. Migration 352 creates an empty audit table
and indexes on that new table. It performs no source rewrite or historical scan.

## Scope and dates

The UI must label the scope **runs completed before YYYY-MM-DD 00:00 UTC**.
`before_date` is exclusive and defaults to today's UTC midnight. Canonical discovery
walks each tenant realm in `(end_time, run_id)` order, using the existing
`ranking_runs_realm_end_time_idx`. The run UUID breaks equal-date ties. This is the
canonical representative's completion date, not its start date, upload date, or
mutable `updated_at`. Duplicate instances are represented once by `ranking_runs`.
Null completion dates are excluded and reported as `missing_dates`; explicit
`scope: run` repair does not require a date. This is not a promise of full coverage
for undated sources.

`cutoff` records operation creation for audit. It is **not an MVCC snapshot or
immutable ingestion cutoff**. No mutable `source_updated_at` filter is applied.
New historical rows or changed dates behind the cursor are handled by normal source
publication and subsequent backfills. Deleting the cursor row does not invalidate
the persisted date/UUID cursor. Moving a source ahead of it can cause harmless
reconciliation again. The fixed event upper boundary never moves on resume.

## Phases and transaction boundaries

Each transaction handles one page (at most 100) or one phase transition. A job
processes up to 10 pages promptly, within its shared 10-minute timeout. It yields
the same River job for 1 second when discovery remains ready, avoiding self-insert
deduplication. It checks pause/state at every transaction and stops when draining
is blocked; a final completion check does not loop on pending work. Canonical discovery
is chronological. Separate repair phases walk already-held evidence by indexed
run UUID and eight result families by their full primary keys. These repair phases
reconcile all-time existing data, including orphan rows, rather than discover new
historical source inclusion. Evidence observed and results computed after operation
creation are excluded from these repair sweeps because normal publication already
refreshed them; this is a freshness fence, not an ingestion snapshot. Consequently `discovered` counts queued identities
and result scopes, **not unique runs or a percentage**. A single run operation
only enqueues its D1 obligation; normal D1 fans out old/new D2 scopes.

An operation row lock serializes each page against pause/resume. All page enqueues
and its checkpoint commit together. A crash commits both or neither; retried pages
cannot advance past lost work. Projection and calculation continue to use existing
D1/D2 ownership fences. Operation failure records an error/retry and retries after
30 seconds; pending D1/D2 failures retain their independent backoff.

Pause stops discovery/checkpoint processing, not shared D1/D2 workers or direct
source publication. Resume retains the fixed event boundary and cursor. Completed
records remain queryable audit history; one unfinished operation per tenant avoids
competing coverage notices. Dispatch pages tenants and queues one bounded job per
operation, without a hot-tenant drain loop.

Completion requires all discovery phases exhausted AND a single snapshot showing
all nine tenant D1/D2 queues empty, including leased, delayed, and retrying rows.
It is deliberately conservative: unrelated normal tenant work may delay completion.
There is no claim that future source mutations will never dirty the tenant again.

## API

Admin routes use the existing `CanAdmin_users_User` permission:

- `POST /api/v1/admin/leaderboard-operations`: `{tenant_id,purpose,scope,before_date?,run_id?}`.
  Purpose is `bootstrap` or `repair`; scope is `tenant` or `run`.
- `GET /api/v1/admin/leaderboard-operations?tenant_id=...`: latest 50 retained records.
- `GET /api/v1/admin/leaderboard-operations/{id}`: record plus current tenant backlog.
- `POST /api/v1/admin/leaderboard-operations/{id}/pause` and `/resume`.

`GET /api/v1/leaderboards-v2/maintenance` returns `{maintenance:null|notice}` for
the current tenant; root requests are rejected. The same notice is included in
board responses. Notice creation precedes any discovery dispatch. Paused/retrying
operations retain notices. Bootstrap communicates partial historical coverage;
repair communicates potentially mixed calculation versions. No version filters
are added to reads.

Status exposes durable history, errors/retries, last progress, missing dates, and
live D1/D2 pending counts, oldest pending timestamp, and pending-row retry totals.
These retry totals are not lifetime failures. Existing D2 River output reports
processed/failed scopes. Exact remaining runs, completion ETA, production WAL,
lock waits and throughput are not fabricated: measure them on an explicitly
approved pilot. Local indexed-plan tests are not production capacity estimates.

### Local access-path check

A local PostgreSQL fixture with 20,000 canonical runs used
`ranking_runs_realm_end_time_idx` for a 100-row chronological page. One observed
execution was 0.262ms (1,229 index rows visited due to planner sort choice). The
existing index lacks the UUID tie-breaker, so equal-date buckets can require extra
sorting; LIMIT bounds returned/enqueued work, not every examined index tuple.
No populated-source index was added. These figures are not production throughput,
WAL estimates, or guarantees. Application operation pages also have a 30-second
context deadline.


## Prompt continuation and recovery

D1 and D2 jobs also process up to 10 pages per invocation using separate existing
claim/compute/publication transactions. D1 pages contain one run; D2 pages contain
at most 100 scopes. After a productive cap, an indexed due-work probe determines
whether to snooze the SAME job for 1 second. River snooze does not consume an attempt
or create another same-args job. Empty, leased-only, future-only, and retry-backed-off
queues stop immediately. The shared job context bounds the whole burst; existing
per-page transaction deadlines and ownership fences remain unchanged.

Dispatcher cursor pages are enqueued promptly rather than waiting 30 seconds per
page. The 30-second periodic scans remain recovery/newly-due-work discovery, not a
batch throttle. Discovery nudges tenant D1/D2 workers, and productive D1 nudges D2.
Nudges are best effort after commit: failures are exposed through
`events_total{phase="dispatch_nudge",outcome="failed"}` and never undo committed
work or counters. Active-job uniqueness may coalesce a nudge; workers' due probes
and periodic scans recover races where work arrives just after an idle check.

This improves queue utilization without a single unbounded drain transaction or
continuous busy-spin. Fixed burst limits and a 1-second River yield provide chances
for other tenants/jobs to run; they do not guarantee a particular completion rate.
