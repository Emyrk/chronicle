# Headless native parsing

The ordinary daemon owns authorization and publication. It consumes legacy parse,
native parse, and native finalize queues. The `chronicled parser` role consumes
only `native-log-parsing`; it connects to PostgreSQL, object storage, and the
primary compatibility HTTP endpoint. It does not run migrations or initialize
SpiceDB, the public API, billing, Discord, or the normal game-data HTTP service.
It registers the existing `servicepgxpool` in connect-only mode, reusing its
configuration, diagnostics, health monitor, and broker-managed shutdown. Only
migration execution and pubsub startup are skipped; connection role and tenant
prepare/reset hooks remain active.
Deploy schema changes using the ordinary primary deployment before parser startup.

Database flags/environment are the same as the ordinary daemon:
`--postgres-url` / `CHRONICLE_POSTGRES_URL` and `--db-max-conns` /
`CHRONICLE_DB_MAX_CONNS` (default 20; a URL `pool_max_conns` takes precedence).
The inherited development URL uses localhost:5433, database `chronicle` for the
`turtle` build and the build's server name otherwise. Production deployments must
set the existing database URL explicitly to avoid selecting that local default.
No new database environment variable is needed. `--primary-url` /
`CHRONICLE_PRIMARY_URL` remains required. Exact compatibility is checked before
starting the broker or connecting to PostgreSQL.

## Primary offload configuration

On the primary, `CHRONICLE_LOG_PARSING_WORKERS=0` (or
`--log-parse-worker-count=0`) omits both legacy `log-parsing` and native
`native-log-parsing` consumers without disabling enqueueing or other queues.
`CHRONICLE_LOG_FINALIZING_WORKERS` / `--log-finalize-worker-count` independently
controls native publication workers and defaults to 1; it must be positive.
Parsing workers default to 1 per queue and may not be negative.

The headless parser still requires a positive `CHRONICLE_LOG_PARSING_WORKERS`
(or `--log-parsing-workers`). Set values per process, not a shared export of zero.
It consumes native jobs only: legacy parse/reparse jobs remain queued until an
ordinary daemon with parsing workers enabled consumes them. Native reparses are
enqueued directly and remain available to the headless parser.

## Compatibility and recovery

Native enqueue captures `version.ParserCompatibilityIdentity()`, not the display
GitTag. By default this is the exact executable `version.BinaryIdentity()`.
Retries never retag jobs. The headless admission gate requires an exact identity
match from the unauthenticated, no-store primary compatibility endpoint. It checks
at startup and worker entry, periodically checks while running, removes only its
local queue admission on mismatch/unavailability, and cancels owned work contexts.
Primary finalization also requires the exact producing identity.

Use a consistent primary target during rolling deployments. Polling a load-balanced
replica does not establish a global deployment epoch and cannot prove all primary
replicas run the same executable. Immutable job identity still prevents wrong-build
execution. No startup arbitration or global epoch is implemented.

Old-build native jobs are rejected with an operational error. Explicitly enqueue a
new native reparse on the current build to recover. Never edit the identity of an
existing job or artifact. Historical native jobs without immutable identity likewise
require explicit reparse. Explicit legacy selection stays on the legacy path and
is not silently upgraded by later appends.

## Separate local development builds

`go run` and debugger builds can differ byte-for-byte even from the same source.
To deliberately allow them to cooperate, set the same explicit nonsecret label
on **both** primary and parser (in separate terminals, with the usual shared
PostgreSQL and object-storage configuration):

```sh
CHRONICLE_LOG_PARSING_WORKERS=0 CHRONICLE_LOG_FINALIZING_WORKERS=1 CHRONICLE_PARSER_DEV_IDENTITY=local-parser-v1 go run ./cmd/chronicled server
CHRONICLE_LOG_PARSING_WORKERS=1 CHRONICLE_PARSER_DEV_IDENTITY=local-parser-v1 go run ./cmd/chronicled parser --primary-url http://localhost:4000
```

For a debugger, add `CHRONICLE_PARSER_DEV_IDENTITY=local-parser-v1` to the debug
process environment as well. This is not enabled by `--dev-auth`. Labels must
match `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`; empty/unset preserves exact executable
identity, and malformed labels fail startup without logging their contents.

Both roles warn at startup. `/api/v1/parser-compatibility` reports
`development_override: true` and a typed `dev-sha256:` digest, never the raw
label. The same identity is captured in jobs, checkpoint envelopes, restoration,
finalization, and catalogue provenance. Different labels, one-sided opt-in,
and an unreachable primary still fail closed. Dataset ID/revision, format,
flavor, snapshot schema/wire versions, authorization, and lease fences remain
strict.

**Never use this override in production or share a label across incompatible
parser/schema changes.** A shared label is an operator assertion of compatibility,
not proof from executable bytes. Change it and explicitly reparse when code
changes are incompatible. Unset it on both roles to return to exact matching;
previous development jobs/artifacts then require an explicit fresh reparse.

## Durable handoff

See `database/PARSER_HANDOFF.md` for SQL contracts. The producer freezes input
metadata in one repeatable-read transaction, parses without serving writes, saves
an immutable gzip COMPLETE/preFinalize artifact, then atomically accepts its
metadata/head and enqueues finalization. Generation, renewable lease token, lease
expiry, and predecessor head are checked in that transaction. Unknown commit
outcomes retain the object; they must not trigger speculative deletion.

The primary restores that exact artifact before deleting/replacing serving output.
Publication has its own serialized, renewable claim and monotonic authority. Newer
parse heads do not invalidate an active same-generation finalizer. Every serving
transaction checks its publication token, generation, iteration, and expiry. A
newer publication reservation or explicit manual reparse prevents stale commits.
Existing multi-transaction replacement semantics remain; this is not an atomic
serving-snapshot redesign. Existing ranking and dirty-queue behavior is retained.

`publication_pending` on the log-group state remains true after native parse
completion while an accepted head is unpublished. It also covers queued/running
current-generation native work. The frontend must discover replacement instance
IDs through the stable slug rather than keep the old instance-ID cache.

## Append boundaries and checkpoint limits

Arbitrary uploaded storage parts are NOT complete logical files. The native worker
concatenates the immutable base and captured ready parts before decoding and replays
the entire frozen logical prefix for each append. This preserves lines split across
objects without inventing a semantic EOF between parts. It does not claim native
incremental continuation for arbitrary chunk boundaries.

Declared complete logical file/bundle session APIs continue to support checkpoint
continuation. Subprocess tests restore complete snapshots in a separate process.
Production artifact restoration is strict and bounded; incomplete or incompatible
artifacts cannot be published. Missing/corrupt accepted artifacts require explicit
raw reparse rather than substitution under the old finalize identity.

## Debug requests

Verbose native requests propagate parser verbosity and publish the existing
user-downloadable `parser_snapshot` attachment on the primary. Its bytes are the
verified accepted preFinalize snapshot, not a second capture after finalization.
The debug attachment uses separate immutable storage keys and its existing
replacement lifecycle; it never replaces the durable handoff object. Generation
and publication-token fences protect the attachment metadata transaction.

CPU profiling is not supported by the native checkpoint worker in this milestone.
Native profile requests are rejected explicitly before enqueue/state changes, and
workers reject durable profile requests rather than silently ignoring them. Select
the legacy engine when requesting CPU profiling. Native finalization must not
profile restoration or overwrite a shared per-log CPU profile.

## Retention and timing

Default parse lease: 2 minutes, renewed every 30 seconds. Default publication lease:
2 minutes, renewed every 20 seconds. Worker option structs permit tuning. Renewal
must be shorter than lease TTL. Lost leases cancel work, and commit fences still
reject stale execution even if cancellation is delayed.

Successful publication schedules bounded obsolete-checkpoint cleanup after a
24-hour grace. Cleanup retains the latest head and never removes an artifact at
or above published progress. Immutable predecessor metadata remains for audit and
commit reconciliation. The cleanup worker accepts a grace override and has an
injectable clock for deterministic tests.

Explicit whole-log deletion, including account purge, removes all accepted
checkpoint objects in batches before cascading their metadata. The final deletion
transaction holds the log-generation lock across storage removal, so acceptance
cannot race the last batch. Storage failure aborts metadata deletion and permits
an idempotent retry. This deliberately holds a transaction during external I/O
for explicit deletion only. Ordinary raw-file retention does not run this cleanup
and preserves the durable continuation head.

Unaccepted uploads from crashes or ambiguous failures are deliberately retained.
There is not yet an automated orphan-object enumeration/reconciliation sweep.
Do not apply an indiscriminate bucket lifecycle to checkpoint objects: the latest
append head must survive even when it is old. Reconcile orphan keys against accepted
metadata and active attempts before any operational cleanup.
