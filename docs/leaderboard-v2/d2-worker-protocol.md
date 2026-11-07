# Bounded D2 worker protocol

PR2 adds orchestration only. Source writers, D1 reconciliation, backfill, read/UI/cache integration and production enablement are deliberately absent. `serviceratings.DispatchEnabled` is false; workers are registered, but neither production worker does work and no periodic dispatcher is scheduled.

## Ownership and transactions

- Code constants: 100 scopes per page, 10-minute work deadline, 15-minute lease. No CLI/env tuning knob.
- One tenant and one of eight D2 families per drain. Claims use `FOR UPDATE SKIP LOCKED`, a random token, the claimed revision, and a database wall-clock lease in a short transaction.
- Computation uses generated `:batchone` methods, complete exact-scope evidence histories, and at most 100 typed results buffered in Go. There is no JSON staging table, scope-array aggregation, or server-side parallelism. Dirty rows are not locked during computation.
- Publication is a separate transaction, bounded to 30 seconds with a 5-second lock timeout. Generated `:batchexec` statements lock and recheck the token, claimed revision, and unexpired wall-clock lease before either upserting or deleting a result. PostgreSQL rechecks ownership after a concurrent row-lock wait.
- Matching current revision: publish and delete dirt atomically. Newer revision: publish the useful owned snapshot, clear ownership, preserve dirt and its due time. Requiring current revision equality would starve hot scopes.
- Expired/replaced owners cannot publish, erase, or acknowledge. Cancellation is not a substitute for fencing.
- Failures release only the matching token, with durable exponential retry (5 seconds to 5 minutes). Producer enqueue increments revision and retains the earliest due time without resetting claims or backoff. Cleanup survives cancellation with its own 5-second bound; if it fails, lease expiry recovers the scope.
- SQLSTATE data/constraint failures isolate individual scopes within the original work deadline. Network/timeout failures do not fan out into 100 immediate retries.

Legacy singleton calculator methods remain explicit **unfenced manual** wrappers over the same typed compute/publication queries. They are not worker entry points and must not be used by concurrent production writers.

## Fairness

Dispatcher discovery is paginated by `(tenant_id, family)` and schedules at most 100 tenant/family jobs plus one delayed continuation. Root periodic scans discover newly due scopes; continuations move past persistently hot prefixes. Future-only, leased, and backed-off scopes do not dispatch. River active-state uniqueness suppresses duplicate tenant/family jobs. A drain performs one bounded page and never spins waiting for future work.

## Validation and local measurements

Tests cover all eight families, non-sliding enqueue, 100+1 partial pages, newer revisions, stale-owner write/delete suppression, expired-owner takeover, PostgreSQL lock-wait ownership recheck, transactional rollback, retry preservation, cancellation cleanup, poison isolation, 101-tenant dispatcher pagination, future-only no-spin, and disabled production entry points.

A deterministic channel barrier holds a full 100-scope compute transaction open. Fifteen producer revisions complete before computation is released; all 100 results publish and exactly 15 newer dirty scopes remain. Local producer time was 6.46 ms. This verifies transaction boundaries, not an artificial SQL sort delay.

Opt-in `CHRONICLE_MEASURE_D2=1 go test ./internal/services/serviceratings -run TestMeasureD2Page -v` uses dedicated temporary databases and seven repetitions of a player-subject page:

| History per player/boss | Scopes | Median end-to-end | Maximum of seven |
|---|---:|---:|---:|
| 100 | 100 | 27.875 ms | 38.046 ms |
| 1,000 | 100 | 124.619 ms | 136.505 ms |

Times include claim, batched computation, fenced publication and acknowledgement; enqueue is outside the timer. Fixtures have no matching provenance hierarchy, so provenance remains null. These are local warm-cache observations, not production throughput guarantees or separate publication-tail measurements. Existing scoped EXPLAIN tests now target the maintained compute queries and also pass.

Targeted calculator/read/config/service/CLI tests, worker race tests (`-count=3`), and changed-code lint pass. Lint has a narrow exception for sqlc-generated deferred batch `Close` calls; handwritten callers explicitly drain and check `Close`. Unrestricted lint also reports pre-existing issues outside this change. Full `make gen` remains blocked by the absent `frontend/imagecache/turtle/icons` asset directory; database generation succeeds. No production databases, preview fixtures, or running servers were changed.
