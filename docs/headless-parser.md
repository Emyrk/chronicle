# Headless native parsing

The ordinary daemon owns authorization and publication. It consumes legacy parse,
native parse, and native finalize queues. The `chronicled parser` role consumes
only `native-log-parsing`; it connects to PostgreSQL, object storage, and the
primary compatibility HTTP endpoint. It does not run migrations or initialize
SpiceDB, the public API, billing, Discord, or the normal game-data HTTP service.
Deploy schema changes using the ordinary primary deployment before parser startup.

## Compatibility and recovery

Native enqueue captures `version.BinaryIdentity()`, not the display GitTag.
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
