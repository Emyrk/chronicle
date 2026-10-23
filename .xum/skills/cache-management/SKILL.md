---
name: cache-management
description: Maintains Chronicle's process-local and cross-replica caches safely. Use when adding a cache, changing cache invalidation, publishing cache generations, integrating cache-relevant mutations, deleting datasets, or reviewing cache code for deadlocks and stale-data behavior.
metadata:
  type: gate
  binding: mandatory
---

# Cache Management

Chronicle treats cache freshness as recoverable and service availability as the stronger invariant. A stale cache is undesirable, but a deadlock, connection-pool stall, or request path that waits indefinitely is unacceptable. Design invalidation so durable data remains correct, stale entries heal, and cache coordination never becomes a blocking distributed lock.

## Safety priorities

Apply these priorities in order:

1. **No deadlocks or unbounded waits.** Cache invalidation must not create lock cycles, hold database resources during callbacks, or depend on notification delivery.
2. **Durable writes remain authoritative.** A cache failure must never roll back, corrupt, or ambiguously report a write that already committed.
3. **Eventual freshness.** PostgreSQL generations and reconciliation repair missed or failed invalidations.
4. **Cache efficiency.** Preserve warm entries only after the first three properties are satisfied.

If preserving freshness conflicts with avoiding a deadlock, prefer a temporarily stale cache and record enough durable state to repair it.

## Architecture

Key files:

- `internal/services/servicecache/servicecache.go` — cache registry, invalidator registry, generation publication, PostgreSQL notification handling, reconciliation, and lifecycle.
- `database/queries/cache_generations.sql` — durable generation increment and transactional `pg_notify`.
- `database/migrations/*cache_generations*` — generation schema.
- `database/gamedb/wowdb.go` — dataset and global game-data invalidators.
- `docs/distributed-cache-invalidation.md` — rollout and deletion behavior.

The correctness model is:

1. A mutation and its generation increment commit in the same PostgreSQL transaction.
2. `NOTIFY` is a low-latency hint only.
3. Receivers read the durable generation row before invalidating locally.
4. Startup, listener uncertainty, and periodic scans repair missed hints.
5. An observed generation advances only after the corresponding local handler succeeds.

Never make correctness depend on receiving every notification.

## Deadlock invariants

These are hard requirements.

### Locks

- Never call an invalidator while holding `Service.mu` or a cache's internal mutex.
- Copy registered handlers under `Service.mu`, release it, then invoke handlers.
- Generation application holds `reconcileMu` while invoking handlers. Handlers are therefore leaf callbacks: they must not call `RegisterInvalidator`, `ApplyPublished`, reconciliation methods, or any operation that reacquires `reconcileMu` or `Service.mu`.
- Prefer local eviction in handlers. If a handler must query PostgreSQL (the tenant slug reload does), give that query a short context deadline **inside the handler** so every caller, including notifications, startup, and periodic reconciliation, releases `reconcileMu` promptly on failure. Do not rely on the post-commit best-effort timeout to protect other callers.
- Never hold a cache mutex while querying PostgreSQL, publishing notifications, logging through a potentially blocking sink, or invoking user-provided code.
- Document any new lock and its ordering relative to `Service.mu`, `reconcileMu`, cache locks, pubsub locks, and database transactions.

Default lock order when more than one is unavoidable:

```text
reconcileMu -> Service.mu -> individual cache mutex
```

Prefer taking only one lock at a time. Do not add a reverse edge.

### PostgreSQL and transactions

- Never hold a PostgreSQL transaction or acquired connection while running local invalidator handlers.
- `PublishTx` may only update the generation row and queue transactional `NOTIFY`; it must not invalidate locally.
- Invoke local invalidation only after the transaction returns successfully.
- Never perform S3, HTTP, compression, file processing, or other slow external work inside a generation-publishing transaction.
- Keep targeted generation lookups indexed to one row. Full reconciliation intentionally scans all generation rows, so namespace and scoped-row growth must remain controlled or the scan must be paginated.

### Pubsub

- Never call PostgreSQL listener `Listen`, `Unlisten`, or subscription methods while holding pubsub queue locks.
- Notification callbacks run outside pubsub queue locks. Keep their database work cancellable and deadline-bounded where possible; do not add external I/O.
- Listener uncertainty, queue overflow, malformed payloads, and shutdown teardown must degrade to later reconciliation and must not make request or shutdown paths wait indefinitely.
- `Close` must mark the service as closing and cancel reconciliation before subscription teardown. Teardown and callback waits must honor a deadline without holding a lock active callbacks need.

### Cross-service calls

- Invalidators are leaf operations. They should evict, purge, or atomically replace local state and return.
- Do not call an HTTP handler, service mutation, River job, S3 operation, or another distributed coordinator from an invalidator.
- Do not wait for acknowledgements from other replicas. PostgreSQL generations provide eventual convergence, not a synchronous barrier.

## Adding or changing a cache

### 1. Define ownership and scope

Choose exactly one namespace and supported scope:

- `ScopeGlobal` for process-wide state such as tenant slug resolution.
- `ScopeDataset` for data partitioned by dataset UUID.

If dataset deletion can leave entries in the cache, also register a global purge handler for the namespace.

Use `servicecache.NewCache` so metrics, capacity, TTL, and admin introspection remain centralized. Include `DatasetOf` for dataset-partitioned caches.

### 2. Register leaf invalidators

A dataset invalidator should only remove entries for the requested dataset:

```go
cacheSvc.RegisterInvalidator(namespace, servicecache.ScopeDataset, "component_dataset", func(_ context.Context, req servicecache.Invalidation) error {
  cache.RemoveFunc(func(key cacheKey) bool {
    return key.DatasetID == req.DatasetID
  })
  return nil
})
```

A global invalidator should purge the namespace's local caches:

```go
cacheSvc.RegisterInvalidator(namespace, servicecache.ScopeGlobal, "component_global", func(context.Context, servicecache.Invalidation) error {
  cache.Purge()
  return nil
})
```

Handlers run in registration order. Names must be stable and unique because observed generations are tracked per handler.

### 3. Publish with the mutation

For a caller that owns a transaction:

```go
var published servicecache.PublishedGeneration
err := store.InTx(ctx, func(tx database.Store) error {
  if err := mutate(ctx, tx); err != nil {
    return err
  }
  var err error
  published, err = cacheSvc.PublishTx(ctx, tx, invalidation)
  return err
}, nil)
if err != nil {
  return err
}
cacheSvc.ApplyPublishedBestEffort(published)
return nil
```

`ApplyPublishedBestEffort` schedules bounded local work and returns immediately; notification or periodic reconciliation remains the fallback. Use synchronous `ApplyPublished` or `Service.Publish` only in tests, maintenance tools, or callers that explicitly want cache-application errors and can tolerate callback latency. Request mutations must not return a generic failure after the durable write committed merely because local eviction failed.

### 4. Cover every committing stage

If a workflow has multiple independently committing transactions, publish the relevant generation in each transaction that changes cache-visible data. Do not attach all publication to a later derivation transaction: an earlier committed write would otherwise remain invisible if the later stage fails.

### 5. Handle deletion conservatively

Dataset deletion must leave a durable signal that disconnected replicas can observe. Chronicle publishes a persistent global generation for every dataset-backed namespace before removing dataset-scoped rows in the same transaction.

After a successful global purge, clear in-memory dataset-scoped observations for that namespace so recreation with the same UUID can restart at generation 1. Do not clear observations if any matching global handler fails.

Global purges are intentionally broad. Dataset deletion is rare, and evicting unrelated warm entries is safer than retaining stale deleted-dataset entries.

## Freshness and failure policy

Expected recoverable conditions:

- A `NOTIFY` is dropped.
- A replica is disconnected or restarting.
- A local invalidator temporarily fails.
- A malformed or unknown notification arrives.
- A cache entry remains stale until the next reconciliation or TTL expiry.

For these conditions:

- Log and measure the problem.
- Leave the observed generation unchanged when local invalidation fails.
- Retry through notification, periodic reconciliation, or startup reconciliation.
- Avoid panic, process termination, global request blocking, or synchronous cross-replica waits.

A cache may be stale for the reconciliation interval. Durable database reads and writes must remain correct independently of cache state.

## Review procedure

When reviewing cache-related code, trace these paths explicitly.

### Lock graph

Write down every lock edge introduced by the change:

```text
caller-held lock -> newly acquired lock
```

Reject the change if the graph contains a cycle or if an invalidator is invoked while a registry, pubsub, database, or cache lock is held.

### Transaction lifetime

For each transaction, identify:

- The mutation queries.
- The generation publication.
- The point where commit occurs.
- Everything called before commit returns.

Reject external I/O, callback invocation, local invalidation, or unbounded work inside the transaction.

### Commit/error semantics

Ask: “If local eviction fails after commit, what does the caller observe?” The response must not imply the durable mutation rolled back. Prefer logging and eventual repair over returning a misleading write failure.

### Notification independence

Verify that deleting or dropping every notification still converges through startup or periodic reconciliation.

### Shutdown

Verify callback admission cannot race `WaitGroup.Wait`, reconciliation exits on cancellation, and shutdown does not hold a mutex required by an active callback. Subscription cancellation must not indefinitely block shutdown or startup-error reporting. A failed startup reconciliation must begin subscription cleanup without waiting indefinitely for PostgreSQL `UNLISTEN`.

## Required tests

Add focused tests appropriate to the change. Use channels and explicit lifecycle signals rather than `time.Sleep`.

Minimum coverage for distributed invalidation changes:

- Mutation and generation publication commit atomically.
- Rollback publishes nothing and performs no local invalidation.
- Two service instances converge through PostgreSQL.
- Missed notification is repaired by reconciliation.
- Local invalidator failure does not advance its observed generation and retries.
- A late-registered handler catches up even when another handler already observed the generation.
- Targeted reconciliation does not touch unrelated namespaces or dataset IDs.
- Notification plus periodic reconciliation does not double-apply a generation.
- Dataset deletion leaves a durable global purge signal.
- Recreating a deleted dataset UUID can restart dataset generations.
- `Close` waits for in-flight callbacks and does not deadlock.

Run at least:

```bash
go test -race ./internal/services/servicecache ./database/gamedb
```

For transaction integrations, also run the affected service or API package tests and a repeated failure-path test.

## Deployment gate

Generation publication is not backward-compatible with old writers that do not publish. When introducing a new namespace or newly covering a mutation path:

1. Apply additive schema changes.
2. Pause affected admin mutations and imports.
3. Drain old mutation-capable replicas.
4. Deploy replicas that publish the required generations.
5. Resume mutations only after all writers are compatible.

Rolling deployment is safe only when both versions publish a conservative compatible invalidation.

## Self-check

Before finishing cache work, verify:

- [ ] No callbacks run under registry, pubsub, database, or cache locks.
- [ ] The lock graph is acyclic and documented for new locks.
- [ ] No transaction spans external I/O or local invalidation.
- [ ] Committed writes are not reported as rolled back because eviction failed.
- [ ] Notifications are hints; reconciliation is the correctness path.
- [ ] Failed invalidation leaves the observed generation unchanged.
- [ ] Dataset deletion and UUID reuse remain safe.
- [ ] Shutdown joins callbacks and reconciliation without a lock cycle or unbounded listener teardown.
- [ ] Startup failure unregisters any subscription it created.
- [ ] Race tests and affected integration tests pass.
