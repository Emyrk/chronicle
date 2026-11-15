# Durable parser handoff SQL contract

This is schema and query scaffolding only. No queue, worker, serving write, or
frontend behavior switches to it yet. Migration 000389 creates empty metadata
tables and their indexes/FKs. It performs no historical scan or backfill.

## Identity and ordering

`parser_handoffs.log_group_id` references `wow_log_groups.id` (UUID). Deleting a
log cascades its handoff and checkpoint metadata. Blob deletion is separate.
The predecessor and head FKs retain immutable checkpoint metadata: individual
metadata deletion is not currently supported. Object GC may remove obsolete
blobs according to retention/resume/publication policy without deleting the
metadata chain. The policy must keep objects needed by resumable heads or
active/pending finalizers; metadata existence alone does not promise blob retention.

A handoff begins at the existing log's current parse generation, head iteration 0,
and published iteration 0.
Iterations are **monotonic per log across generations**, not reset on reparse.
Generation advancement invalidates both parse and publication tokens. It retains
the accepted head, its predecessor chain, published iteration, and publication
authority. A fresh/manual reparse must atomically coordinate the existing
`wow_log_groups.parse_generation` and handoff generation in the same transaction.
Callers must establish matching generations when lazily creating a handoff for
an existing log and maintain them together afterward. These must not become
independent, unsynchronized authorities. This slice does not wire that coordination
or retrofit legacy writers.

Checkpoint attempt IDs and both lease tokens must be fresh caller-generated UUIDs.
Never reuse tokens, including when reclaiming an expired claim. Each accepted
attempt records generation, iteration, predecessor attempt, producing binary
identity, parser engine, dataset identity JSON object, input identity JSON object,
object key, and digest. Use content/build identity, not a mutable binary path.
JSON payload structure and digest algorithm/verification belong to the artifact
format contract. SQL only requires object-shaped JSON and nonempty identity fields.

Accepted attempts are append-only through this query API: there is no update or
individual delete operation. The schema does not prevent a privileged raw SQL
writer from editing them. It also cannot prove the referenced object exists.
Upload and verify immutable, uniquely keyed objects before acceptance; collect
unreferenced uploads after a retention period. Compatibility checks must compare
the stored engine, producing binary, dataset, and input identities before resume.

## Acceptance transaction

1. Lock the `wow_log_groups` row and read its current `parse_generation`.
   In that same transaction, call `EnsureParserHandoff(log_group_id,
   initial_generation)` with that value to create the lazy state row idempotently.
   An existing handoff is not reset or changed by Ensure; verify its generation
   matches the locked log row before proceeding. Initial adoption does not require
   repeated generation increments.
2. `ClaimParserHandoffLease(log_group_id, generation, lease_token, lease_duration)`
   claims only a free or expired lease. Duration is a positive SQL interval.
   `RenewParserHandoffLease` requires that generation/token still owns an unexpired
   lease. `ReleaseParserHandoffLease` requires the same generation/token, even if
   expired. Reclaim uses Claim with a fresh token.
3. Upload the immutable checkpoint outside a database transaction.
4. In **one transaction**, call `LockParserHandoffForAcceptance`,
   `InsertParserCheckpointAttempt`, `AdvanceParserHandoffHead`, and River's
   transactional finalize enqueue. Commit only if all succeed. Roll back on any
   no-row result, enqueue failure, or SQL error. The three SQL operations require
   the same log, generation, lease token, predecessor iteration and nullable
   predecessor attempt ID. Insert also takes the artifact/provenance fields and
   fresh attempt ID. Advance takes that same attempt ID.

The lock serializes acceptance with lease reclaim and publication. Insert and
advance recheck expiry using `clock_timestamp()`, not transaction-start `now()`.
The new iteration is exactly head + 1. Unique log/iteration and composite FKs
prevent duplicate iterations, cross-log predecessors and mismatched head IDs.
Calling Insert alone or committing after a failed Advance violates the protocol;
SQL constraints cannot enforce the River enqueue or transaction choreography.
An acceptance retry after an ambiguous commit must inspect
`GetParserCheckpointAttempt(log_group_id, attempt_id)` and `GetParserHandoff`;
never blindly create a second attempt or infer failure from a lost response.

`AdvanceParserHandoffGeneration(log_group_id, expected_generation)` performs a
compare-and-swap generation increment and clears both parse and publication
tokens/expiries while retaining iteration authority. Use it only
for an intentional new parse generation, not routine retry/lease reclaim.
It revokes finalizers from prior generations, including active reservations.
Advancing only the parse head within the same generation does not revoke them.

## Publication transactions

`published_iteration` is serving progress. `publication_iteration` is a retained
high-water authority. The latter never decreases, including after expiry,
release, generation change, or failure. A reservation stores this iteration,
a fresh token, and expiry separately from durable parse progress.

`ClaimParserPublication(log_group_id, attempt_id, publication_token, lease_duration)`:

- Resolves the exact accepted attempt, requires its generation to match the
  current handoff generation, and requires iteration above published.
- Requires iteration at least the retained reservation high-water mark.
- Claims only when the previous token is absent or expired, even for a newer
  checkpoint. Newer work cannot preempt a live publisher.
- Can reclaim the same reserved iteration with a fresh token after expiry.

A new parse head or lease alone **does not** invalidate publication within the
same generation. There is intentionally no current-head equality predicate.
An explicit fresh/manual reparse generation invalidates prior-generation
publication. Every publication fence checks the expected generation in addition
to iteration, token, and expiry.

Every transaction that writes serving data, including intermediate/batched
transactions, must start with `LockParserPublication(log_group_id, generation, iteration,
publication_token)`. Hold that row lock through all writes. At its end call
`CheckParserPublication` and roll back on no rows. The final publication transaction
instead calls `CompleteParserPublication` after all serving writes. Complete
checks the token/iteration/expiry, advances published iteration, and clears the
token/expiry without clearing authority. Roll back all writes on fence failure.
The lock prevents a reclaim or newer claim from racing database writes; the final
check rejects work that expired while the transaction was running.

`RenewParserPublication` accepts only a matching generation, unexpired token,
and positive duration. `ReleaseParserPublication` clears only a matching
generation/iteration/token and
preserves authority, whether expired or live. Lock, Check, Renew, Complete, and
Release all require the expected generation. Old workers cannot release a
replacement token. Do not renew an expired token; reclaim with a fresh UUID.
Successful Complete makes further claims for that published iteration no-ops
(no rows). Callers must distinguish already published from superseded work by
reading state. All fenced `:one` operations report rejection as no rows, not as
an authorization exception.

## Integration limitations

- This protocol does not make arbitrary existing writers safe. All publication
  transactions must adopt the fence, including deletes and downstream metadata.
- Database row locks do not fence object storage writes. Upload immutable keys,
  and publish references only under the database fence. Never overwrite a shared
  serving object using an unfenced external write.
- Multi-transaction publication can expose partial updates. Atomic visible
  snapshots require staging/versioned serving rows and a final pointer switch,
  or one serving transaction. This slice does not introduce such a serving model.
- Retaining newer authority after a failed publisher intentionally prevents an
  older checkpoint from overwriting it. Retry that attempt or publish a newer
  one. There is no automatic authority rollback/recovery escape hatch.
- Keep transactions short. PostgreSQL cannot atomically check wall-clock expiry
  at commit, so the last check is the authorization point while the lock remains
  held. Do not perform external work between that check and commit.
- River job arguments, deduplication, retry/reconciliation, checkpoint format,
  object retention, runtime leases, and legacy generation adoption are not wired.
- Generated Go interfaces and dump.sql are generated from a fresh disposable
  full-schema PostgreSQL database. Queue and worker adoption remains separate.

## Validation

Run `python3 database/tests/parser_handoff_contract.py`. It starts and stops its
own temporary Unix-socket PostgreSQL cluster with TCP disabled. It never connects
to a developer database. It uses a minimal UUID parent-table fixture and executes
the actual migration/query files. Coverage includes acceptance, stale predecessor,
generation and token fencing, lease expiry/reclaim, same-generation newer-head-safe publication,
reservation serialization, retained authority after expiry/release, FK cascade,
and the down migration. No sleeps are used; expiry is forced in test-only SQL.
It is a protocol smoke test, not a concurrent-worker or River integration test.

For sqlc validation without modifying generated repository files, concatenate
`database/dump.sql` and the up migration into a temporary schema, copy the query
file, and run `sqlc generate` using a temporary config/output directory. This
checks the new queries against real existing identifiers and PostgreSQL types.

## Typed persistence helper API

`chronicle.NewParseHandoffStore(db database.Store) *ParseHandoffStore` takes a
plain Store, without an authz dependency. It owns transactions and accepts a
transaction Store for composition inside an existing transaction. In that case
successful return is provisional until the outer transaction commits.

Exact exported methods:

```go
Ensure(ctx context.Context, logID uuid.UUID) (database.ParserHandoff, error)
AdvanceGeneration(ctx context.Context, logID uuid.UUID, expected int64) (database.ParserHandoff, error)
Accept(ctx context.Context, arg database.InsertParserCheckpointAttemptParams, enqueue ParseFinalizeEnqueue) (database.ParserCheckpointAttempt, error)
Publish(ctx context.Context, fence ParsePublicationFence, complete bool, write func(context.Context, database.Store) error) error
ClaimLease(ctx context.Context, arg database.ClaimParserHandoffLeaseParams) (database.ParserHandoff, error)
RenewLease(ctx context.Context, arg database.RenewParserHandoffLeaseParams) (database.ParserHandoff, error)
ReleaseLease(ctx context.Context, arg database.ReleaseParserHandoffLeaseParams) (database.ParserHandoff, error)
ClaimPublication(ctx context.Context, generation int64, arg database.ClaimParserPublicationParams) (database.ParserHandoff, error)
RenewPublication(ctx context.Context, arg database.RenewParserPublicationParams) (database.ParserHandoff, error)
ReleasePublication(ctx context.Context, arg database.ReleaseParserPublicationParams) (database.ParserHandoff, error)
```

`ParseFinalizeEnqueue` is
`func(context.Context, database.Store, database.ParserCheckpointAttempt) error`.
Use `database.PGXTx(tx)` to obtain River's transaction handle inside this callback
and call River `InsertTx`; never enqueue through the base pool. Acceptance requires
a non-nil callback. Any callback error rolls back the metadata, head, and queue
writes together. A commit error may be ambiguous: no object cleanup is performed.
Reconcile by immutable attempt ID before retrying or scheduling object cleanup.

`ParsePublicationFence` has `LogGroupID uuid.UUID`, `Generation int64`,
`Iteration int64`, and `Token uuid.UUID`. Publish requires a non-nil write callback.
It locks and checks the existing log generation before locking the reservation,
runs the callback on that same transaction, then checks the fence again or
completes publication. Every batch must use this helper or equivalent fences.
Callback error, expiration, or generation/token mismatch rolls back all writes.

All helpers acquire the log-generation row before the handoff row. Operations
that need the ranking-refresh lock must acquire it in an outer transaction
**before** calling the helper: ranking refresh, log generation, handoff is the
required lock order. Do not acquire ranking locks inside a Publish callback
unless the outer transaction already holds them. AdvanceGeneration increments
both authorities atomically and invalidates both tokens; it does not clear
serving data, perform ranking repair, or enqueue reparse jobs.

Database tests in `chronicle/parse_handoff_test.go` exercise real River enqueue
rollback, competing acceptance, publication exit-fence rollback, same-generation
head advancement, and publication/generation lock serialization with NOWAIT
checks and channels instead of sleeps. Run them against a disposable PostgreSQL
container with `CHRONICLE_TEST_POSTGRES_PORT` set to its dynamically assigned
port and `DB_FROM`/`CODER_PG_CONNECTION_URL` unset.

## Durable engine selection

`parser_handoffs.native_enabled` defaults to true on adoption, before any accepted
checkpoint. `SetParserHandoffNativeEnabled(log_group_id, native_enabled)` changes
this durable selection. Integration sets false on an explicit legacy manual
reparse and true on a native enqueue; automatic append reads this field rather
than inferring engine choice from checkpoint existence. Ensure the handoff exists
first: the setter is an `:exec` update and a missing row is not an error. Coordinate
selection changes with generation invalidation and queue enqueue in the same
log-row-locked transaction so active work cannot outlive an explicit mode switch.
