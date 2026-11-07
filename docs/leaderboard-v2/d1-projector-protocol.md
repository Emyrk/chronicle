# Shared canonical projector and D1 repair

## Scope and activation

PR3 adds an explicit repair capability and reusable computation/publication helpers. Normal ingestion/action hooks (PR4), discovery/backfill (PR5), and UI/cache changes are absent. Both D1 and D2 production entry points remain guarded by the false `DispatchEnabled` code constant. Worker registration alone performs no repair. A later separately reviewed integration deploy changes that constant; there is no CLI/environment override or startup backfill.

## Source projection

`ComputeProjection` calls one `ProjectLeaderboardRun` SQL statement. Its CTEs share one PostgreSQL statement snapshot and take no dirty-row/source/global/advisory locks. It reads only one logical run's representative, requiring canonical instance/realm/variant agreement, a listed log group, no invalidation, and the requested tenant via server/realm identity. Source absence produces empty evidence, not an error or cross-tenant bypass.

The shared statement produces five typed evidence families:

- Player observations use raw DPS and HPS separately, with finite nonnegative values and exact source encounter/realm/variant agreement. Both metrics remain supported; no future writer-selection policy is invented here. Repeated exact player/cohort/boss observations select highest raw value, then encounter/ranking UUID for deterministic ties.
- Guild boss/clear observations use raw positive millisecond durations in `time_parse_scores`/`time_parse_boss_scores`, never normalized parse-score columns. Source run, tenant, realm and authoritative instance guild must agree; guild must belong to that realm. Repeated boss evidence selects fastest duration deterministically.
- Player Renown is deduplicated by canonical player/boss independently of metric and spec, from qualifying raw ranking participation even if performance values are invalid. Guild Renown comes from authoritative clean boss encounters and guild identity independently of time-score publication.

Unavailable stages contribute no evidence for that stage; later source completion must invoke direct publication in PR4. The projector neither refreshes canonical membership nor assumes all raw stages were published when a canonical row appeared.

## Eventual consistency and ownership

D1 claims one due `(tenant, run)` per drain in a short transaction using `SKIP LOCKED`, a random token, claimed revision and a 15-minute database-clock lease. Work is bounded to 10 minutes. Projection occurs after the claim transaction has committed.

Publication has a separate 30-second deadline/5-second lock timeout. It locks and rechecks the D1 token/revision/lease, captures old evidence **at publication time**, enqueues its D2 scopes, replaces all five evidence families using batches of at most 100 typed rows, enqueues new scopes, and acknowledges D1 in the same transaction. Failure anywhere rolls everything back. A second lease check before acknowledgment also rolls back publication that outlives its lease.

An owned snapshot is allowed to be stale. If current revision equals claimed revision, publication deletes D1. If it advanced, publication clears the claim but leaves pending dirt and the original due time. Expired/replaced workers cannot publish or delete. No global canonical lock, per-run source advisory lock, source fingerprint or generation table is used.

Failure releases only the matching token and applies the same 5-second-to-5-minute durable retry backoff as D2. Bounded cleanup survives cancellation; lease expiry recovers failed cleanup. Tenant discovery pages at 100 tenants and schedules a delayed continuation, never waits/spins on future-only or leased/backed-off work.

## Required PR4 direct-writer transaction contract

These helpers are available but **no current source writer is changed by PR3**:

1. Start a tenant-scoped transaction. Before relevant source mutations, call `LockLeaderboardDirectPublication` for every affected `(tenant,run)` identity in deterministic sorted order. It creates/locks a serialization row; if a claim exists, it increments revision without changing the owner's token or claimed revision. Existing pending repair obligations are retained.
2. Apply source changes and call `ComputeProjection` on that same transaction so it sees those writes. Call `PublishProjectionTx` with those rows. The helper does not commit or enqueue D1; it records publication-time old/new D2 and replaces evidence atomically. Roll back the entire transaction on any error.
3. If the locking query returned `created=true`, remove that placeholder using `RemoveLeaderboardDirectPlaceholder` after successful publication. Do not remove an existing pending/claimed row. Thus normal settled uploads require no D1 queue hop.
4. Deletion or other paths unable to publish evidence must enqueue durable D1 before destructive changes. Capture old logical-run/tenant identities first. Merge/unlink and tenant movement require obligations for every old/new identity; do not infer old tenant from the post-change source. Multi-tenant action orchestration must retain tenant-scoped calls rather than weakening projector RLS.

An overlapping repair may subsequently overwrite fresh direct evidence; its preserved newer dirty revision guarantees another repair. The accepted sequence is A snapshot → direct B plus revision bump → stale owned A with pending revision → next repair B. Old evidence must be read during publication so B's cohorts are dirtied when A replaces it.

The exported publication helper requires its caller's open transaction and dirty-row serialization. It must never be used as an untransactional sequence or with projections captured before the direct writer acquired its serialization row.

## Local verification and measurements

Integration tests cover all five evidence families, metric-free deduplication, missing stages, repeated publication, tenant movement, canonical merge/unlink, representative replacement, guild/spec movement, invalidated/unlisted/mismatched sources, source deletion, rollback, expired/stale ownership, newer revisions, dispatch pagination/backoff, and D2→existing leaderboard read/provenance. A channel barrier proves a direct producer completes while D1 is paused after snapshot computation. Local producer transaction time was 9.93ms; no correctness assertion depends on that timing.

Opt-in `CHRONICLE_MEASURE_D1=1 go test ./internal/services/serviceratings -run TestMeasureRunProjection -v` uses one dedicated local 40-player/12-boss raid, two metrics, one guild, yielding 1465 evidence rows. Seven runs measured computation 5.10–8.95ms and publication 67.37–110.57ms (first publication inserts; subsequent publications replace). Publication includes old/new D2 obligations, typed inserts and commit. This measures one-run replacement, not player all-time history, production throughput, or a guaranteed latency bound.

Validation passed: targeted database/read/ratings/rankings/River/CLI suites; existing Chronicle unlisted/ranking-run lifecycle tests; ratings race tests with three repetitions; changed-code lint; and `make build-backend`. `make gen/db` succeeds. Full `make gen` remains blocked by the missing local `frontend/imagecache/turtle/icons` assets; generated D1 constraint metadata is included. No production or preview data was queried or modified, and no servers were restarted.
