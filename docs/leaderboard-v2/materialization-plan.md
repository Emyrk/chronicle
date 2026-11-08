# Leaderboard v2: real-data materialization plan

## Durable handoff

This is a docs-only next PR above
[read preview #1639](https://github.com/Emyrk/chronicle/pull/1639), based on
`090a4d262d28c60839f91f9efaf49acdd0c42840`. It does not install workers or
change the accepted read API/UI. Track remaining work against
[architecture issue #1637](https://github.com/Emyrk/chronicle/issues/1637).

- Stack: configuration -> [schema #1638](https://github.com/Emyrk/chronicle/pull/1638)
  -> read preview #1639 -> this materialization plan.
- Implemented: configuration resolution, migration 344's 22 tables, migration
  345's player read index, migration 346's nullable peak provenance, and the
  isolated `/leaderboard-v2` UI / `GET /api/v1/leaderboards-v2` read path.
- Missing: canonical evidence writers, D1 reconciliation, D2 calculations and
  dispatch, real-history bootstrap, progress/repair operations, and real-data
  rollout validation. Schema comments are not running workers.
- Estimate: **six implementation PRs after this plan**, described below. The D1
  prerequisite intentionally precedes enabling normal ingestion so deletion and
  canonical replacement cannot strand summaries.
- Accepted follow-up decision: PR 2 will batch existing D2 calculations through
  sqlc/pgx, with a code constant of 100 scopes per tenant/result family, a 10-minute
  work timeout, and a 15-minute ownership lease. No CLI/environment batch setting
  is authorized. See the PR 2 contract below; rating equations are unchanged.
- Current synthetic ten-boss all-class Mastery warm median is **1,234.7ms**,
  roughly 1.23s, not the 200ms target. This is accepted as a starting point.
  **Caching is deferred**; do not add a cache or bosswise best-spec projection.
  See [measured context](read-preview.md#measured-local-performance), including
  fixture cardinalities and the distinction from production/end-to-end latency.

The [specification](spec.tex), [behavior](behavior.md), and
[functional table map](table-relationships.md) remain the semantics contract.
This plan supersedes the old implementation guide's future-tense schema/read
status, not its rating math. Nothing here authorizes seasons, portfolios,
retention exceptions, triggers, or a replacement read design.

## Existing integration points

| Area | Verified starting point |
| --- | --- |
| Raw schema/tests | `database/leaderboard_raw_evidence_test.go` |
| Raw SQL | `database/queries/leaderboard_raw_evidence.sql` |
| Current reads | `database/queries/leaderboard_read.sql` |
| Selection and cursors | `internal/leaderboardread/selection.go` |
| HTTP entry | `api/leaderboard_v2.go`, `API.LeaderboardV2` |
| Configuration | `internal/leaderboardconfig.Resolve` |
| Raw ranking write | `chronicle/logparse.go`, `insertDPSRankings` |
| Duplicate linking | `chronicle/logparse.go`, `detectAndLinkDuplicate` |
| Canonical queries | `database/queries/ranking_runs.sql` |
| User deletion | `Chronicle.DeleteWoWLogGroup`, `DeleteWoWLogInstance` |
| Retention deletion | `chronicle/retention/worker.go` |
| Worker registration | `internal/services/serviceriver/serviceriver.go` |
| Queue extension API | `chronicle/riverqueue`, `AddWorker`, `AddPeriodicJob` |

Raw SQL currently exposes only `ListLeaderboardPlayerObservations`,
`ListLeaderboardPlayerBossSubjects`, and `ListLeaderboardDirtyRuns`: no mutation
or calculation API exists. Add SQL through sqlc, not ad hoc SQL in Go. New
leaderboard orchestration belongs in the planned `internal/services/serviceratings/`
package; that package is a proposed addition, not an existing implementation.

`insertDPSRankings` commits supplementary rankings separately from parsed-instance
insertion. `detectAndLinkDuplicate` changes duplicate groups inside the parse
transaction. Neither alone establishes that canonical player and guild evidence
is ready. Integrate at the authoritative canonical/raw-source publication
boundaries, retaining retries for independently completed source stages.

`servicerankings.RefreshRankingRuns` / `refreshRankingRunsTx` in
`internal/services/servicerankings/worker_ranking_runs.go` resolves
`RankingRunSources` and writes `UpsertRankingRun` under `store.InTx` and
`AcquireRankingRunRefreshLock`. This is the canonical publication anchor, not
permission to run full-history D2 calculations while holding its advisory lock.

Guild raw durations are published separately by
`WorkerComputeTimeParseScores.Work` in
`internal/services/servicerankings/worker_compute_time_parse_scores.go`, using
`InsertTimeParseScore` and `InsertTimeParseBossScore` in its transaction.
Membership refresh is not itself publication of these source rows. Hook both
canonical and raw-duration completion with idempotent **direct** evidence writes
plus D2; do not make routine guild source completion a mandatory D1 repair job.
Keep the source service's existing parse-score lookback separate from the new
all-time leaderboard evidence contract.

User and retention deletion already capture ranking run identities and refresh
existing parse/ranking outputs. Extend those same transaction boundaries with
D1 obligations before destructive source changes. Preserve parse scoring. Use
`RankingRunIdentitiesByInstanceIDs` and other `RankingRunIdentities*` queries
before deletion/group movement; post-delete lookup cannot recover old run IDs.
`DeleteWoWLogGroupFiles` removes artifacts, not instance/ranking evidence: do not
mistake artifact retention for an encounter deletion.

## Non-negotiable calculation and write invariants

1. Normal ingestion/actions write canonical evidence **and enqueue D2 atomically**.
   Do not route every upload through D1. Writers enforce exact tenant/source/
   canonical agreement; there are no integrity triggers or source FKs.
2. D1 is rare coarse canonical-run repair for historical data and corrections.
   Source deletion enqueues D1 and leaves evidence intact. D1 captures old keys,
   reconstructs authoritative evidence, enqueues the old/new D2 union, then
   replaces/removes evidence in that transaction. Less efficient repair is fine;
   losing old scopes or blocking source deletion is not.
3. D2 independently computes shared benchmarks, raw subject summaries, and
   Renown counts from evidence. Benchmark-only changes never fan out subject
   dirt. Award-only changes never force recounts. Eligibility/projection changes
   can require evidence and dependent-summary repair.
4. All-time only. Every scope retains difficulty **and** raid size. Tenant owns
   benchmarks; realm qualifies subjects but does not partition benchmarks.
   Player performance keeps class/spec/subspec and DPS/HPS separate.
5. For each changed player subject, read its complete eligible history in that
   exact cohort, sort, and recompute the exact existing bands. A bounded dirty
   page is not permission to truncate one subject's history or average partial
   band means. Guild Form/Floor use means of reciprocal milliseconds, not
   reciprocals of mean durations. Empty bands are zero; no evidence removes rows.
6. Benchmarks use indexed exact-cohort MAX(raw metric)/MIN(positive duration).
   Plan and measure the scope/value access paths; migration 345 is a summary
   read index, not evidence MAX/MIN or per-subject history acceleration.
7. Metric-free canonical kill facts produce one count per subject/exact boss and
   variant. DPS/HPS or specialization changes must not double-credit the kill.
   Renown reads sum selected-boss counts times current awards. An empty default
   set returns an empty selection, not a ban on optional boss Renown evidence.
8. `projection_version` and `algorithm_version` are repair metadata. Reads ignore
   them, including mixed benchmark/subject versions. Repair in place, with an
   explicit user-visible notice that scores may change during repair; no version
   snapshot or legacy-rating fallback.
9. Preserve the accepted overview: each performance row uses its own cohort
   benchmark across all classes. Renown companion Peak and Mastery independently
   choose the best **whole selected view**; never blend bosswise spec maxima.
10. Peak provenance belongs to the observation supplying `raw_peak`, not the
    fastest kill. Carry `peak_encounter_id` and `peak_duration_ms` together;
    equal peaks choose the smallest source encounter UUID. Migration 346 allows
    both null until repair. Derive duration from authoritative encounter data;
    never invent it. Records/details must continue identifying the actual peak.

## PR 1: D2 SQL calculations and evidence access paths

**Red:** database fixtures for player, guild boss, guild clear, and Renown cover
0/1/2/3 and larger histories, ties, nonuniform durations, empty bands, zero player
benchmarks, out-of-order evidence, deletion, and changed spec/realm/variant.
Compare results to a simple independent full-history oracle, including Mastery
ceilings 30/80/100. Test count deduplication across metrics/spec movement and
peak provenance tie selection. Existing legacy-null provenance stays readable.

**Green:** add bounded-scope SQL calculation/upsert/delete entry points for all
eight result families and their sqlc calls. Benchmark and subject calculation
remain separate. Populate raw compatibility metadata and provenance, not current
normalized scores or frozen awards. Add only measured missing indexes through
new migrations; never edit migrations 344-346.

**Refactor/acceptance:** scoped `EXPLAIN (ANALYZE, BUFFERS, WAL)` must demonstrate
that work does not scan unrelated tenants/cohorts. Record history sizes, sort
spill, p50/p95 time, WAL, and source/index reads at increasing history sizes.
Empty scopes remove stale results. Full-history work may be expensive; isolate
that cost instead of silently capping evidence. Deploy callable calculations
without any automatic producer or dispatcher.

## PR 2: D2 queue orchestration and bounded scheduling

**Red:** deterministic two-connection tests for repeated enqueue, two consumers,
producer-during-compute, failure/retry, stale result publication, and revision-safe
acknowledgement. A producer must not wait behind a full-history aggregation lock.
Continuous writes must not defer a scope forever. Test tenant fairness and that
future-due rows do not create a tight dispatch loop.

**Green:** add coalesced exact-scope enqueue/claim/publication/ack SQL and thin
River orchestration through `AddWorker`/`AddPeriodicJob` and central registration.
Respect transaction-local tenant access, bounded pages, and a per-invocation time
budget. Process due scopes on a bounded period: repeated dirt cannot indefinitely
slide the original due deadline. This is not mandatory D1 upload debounce.

### Accepted batching and ownership contract

Use code constants: **100 scopes per tenant/result family**, **10-minute work
timeout**, and **15-minute claim lease** measured by the database wall clock.
There is no batch-size CLI flag, environment variable, or runtime option. The
scope cap never truncates a subject's complete history.

Use three distinct phases:

1. A short claim transaction selects due scopes with `FOR UPDATE SKIP LOCKED`,
   assigning a fresh ownership token, claimed revision, and lease expiration.
2. Generated sqlc `:batchone` calls compute full exact-scope histories and buffer
   at most 100 typed results in Go. **No dirty-row locks are held during any
   computation**, including the remaining items in a batch. No JSON staging or
   replacement server-side scope-array query is authorized.
3. A separate short publication transaction uses generated `:batchexec` calls to
   lock and recheck token, claimed revision, and unexpired ownership before
   upserting/deleting and acknowledging atomically. Current revision equal to
   claimed revision removes dirt. A newer revision still permits the useful owned
   snapshot to publish, then clears ownership while preserving pending dirt and
   its due time. Requiring current revision equality would starve hot scopes.
   Expired or replaced owners may neither publish nor delete nor acknowledge.

Keep `database/queries/leaderboard_materialize.sql` as the single maintained
calculation source; experimental duplicate calculation SQL must not ship.
Flush partial pages immediately when available work is exhausted; never wait
for 100 scopes to accumulate. Stop scheduling on cancellation and use bounded
retry/backoff rather than an unbounded drain loop. The shorter work deadline is
not proof a paused process or database statement has stopped: tokens and
publication-time ownership fencing remain necessary despite the longer lease.

Consume/drain batch results and close them on every path, explicitly handling
execution, result-drain, close, and transaction/commit errors. Failed publication
must not acknowledge work, even if earlier batch statements succeeded. Cleanup
must be bounded and ownership-checked; lease expiry recovers failed cleanup.

Test fixed constants/no runtime setting, per-family caps, partial flush,
cancellation, failure rollback, tenant fairness and future-due no-spin. Explicitly
test a full 100-scope compute phase with 15 concurrently bumped revisions: all
100 owned snapshots may publish while exactly those 15 newer obligations remain.
Verify replaced-token rejection after an actual PostgreSQL row-lock wait, and
stale-owner suppression for both result writes and empty-result deletion.

**Refactor/acceptance:** demonstrate producer latency stays bounded while a large
subject recomputes, newer dirt survives, no stale overwrite occurs, and each
active tenant progresses under sustained load. Document the bounded dispatcher
period, measured compute budget, and retry/backoff behavior; do not imply that the
period is a guaranteed end-to-end freshness bound. Keep production dispatch
code-disabled until integration checks pass. Later enablement is a separately
reviewed change to `serviceratings.DispatchEnabled`, followed by deployment—not
a CLI/environment setting or an implicit historical backfill. See
[detailed protocol and measurements](d2-worker-protocol.md).

## PR 3: shared canonical projector and rare D1 reconciliation

**Red:** replay duplicate uploads, deleted representatives, run merge/unlink,
invalidated/unlisted sources, guild/spec/tenant movement, missing source stages,
and a run deleted after capture. Inject failure between D2 enqueue and evidence
replacement: both must roll back. Repeating repair must be idempotent.

**Green:** implement a shared canonical projection boundary used by D1 and later
normal writers. Read authoritative `ranking_runs`, raw DPS/HPS, and raw guild
boss/clear durations, not persisted parse scores. Reconcile metric-free kill
facts independently. D1 uses `leaderboard_dirty_runs`, retains old evidence keys,
and enqueues all affected old/new D2 scopes before replacement in one transaction.
Register bounded rare repair processing with fairness and retries. Repair can
rescan a whole run; it must not hold unrelated tenant/work-queue locks.

### Accepted D1 eventual-consistency contract

Reuse the 10-minute work deadline and 15-minute database-clock ownership lease.
A short transaction claims one due run. Compute its canonical projection from a
single consistent SQL snapshot outside dirty-row, source, and global locks.
There is no source-generation table or per-run advisory lock.

A separate bounded publication transaction locks/rechecks D1 token, claimed
revision, and lease, captures the **current** old evidence keys, enqueues old/new
D2 obligations, and replaces/removes evidence atomically. An owned stale snapshot
may publish after the dirty revision advances: delete D1 only for an exact
claimed/current revision match; otherwise clear ownership and preserve pending
work. Expired/replaced owners may not publish. This deliberately accepts delayed
convergence while a run is still receiving uploads.

PR4 direct writers must serialize on the same dirty-run row in their source/
evidence transaction and increment an overlapping claim's revision **without
invalidating its token**. Ordinary direct publication needs no persistent D1
obligation when no repair/claim exists. Deletion, merge/unlink, and tenant movement
must retain obligations for every old/new logical identity. No source hook is
activated in PR3. See [shared projector contract](d1-projector-protocol.md).

**Refactor/acceptance:** preserve `database/ranking_runs_test.go` and
`chronicle/log_unlisted_test.go` coverage; add D1 evidence/summary obligations to
those fixtures. Repair absent source rows to empty evidence without a source FK.
Keep discovery/backfill and normal ingestion activation out of this PR. Deploy
as an explicit repair capability, ready before normal writers can be enabled.

## PR 4: normal writers and source-action integration

**Implementation status:** normal canonical/player/duration publication and
source-action D1 obligations are integrated. `DispatchEnabled` is true by explicit
user approval; D1/D2 periodic scans process existing dirt only, with no historical
discovery or backfill. See [integration map](source-integration.md).


**Red:** end-to-end source-to-evidence tests at parse/ranking publication, canonical
representative change, user delete, retention delete, visibility/invalidation,
and reparse. Capture both old and new identities. Failure at any transaction
boundary must leave either committed evidence plus D2 or a durable repair
obligation, never untracked partial state. Test concurrent source replacement
against D1 and D2. No per-upload D1 delay or duplicate Renown credit is allowed.

**Green:** call the shared projector from authoritative normal source completion
and action boundaries, atomically writing evidence plus D2. Add D1 enqueue to
source deletion transactions before rows disappear, leaving evidence intact.
Wire `Chronicle.DeleteWoWLogGroup`, `DeleteWoWLogInstance`, and retention hard
deletes; audit invalidation, unlisting, duplicate merge/unlink, and reparse paths
rather than assuming API deletion covers every mutation. Resolve non-null source
tenant before deletion and retain old run IDs even when the representative moves.

**Refactor/acceptance:** fresh canonical uploads converge through direct evidence
writes and D2 without D1. Deleted runs converge through D1 then D2. Parse-scoring
failures/retries retain current behavior, and no integrity trigger or deletion
cascade is introduced. Enable only a bounded pilot with a reviewed disable path;
retain repair obligations if normal production is paused.

## PR 5: resumable historical bootstrap and repair operations

Implementation protocol and API: [operations.md](operations.md).

**Red:** checkpoint/resume after crashes, bounded discovery pages, tenant fairness,
source mutation during scan, cutoff completion, and version repair of already
existing evidence/results. Validate progress across both discovery and queue
drain; an empty queue before discovery finishes is not completion.

**Green:** add administrative D1 discovery with a fixed source cutoff and durable
progress, then drain D1 and D2 through the same tested pipeline. Keep bootstrap
outside service-start migrations. Normal direct writers handle later mutations.
Add an observer surface and metrics for discovered/remaining runs, D1/D2 backlog,
oldest due age, revision retries, failures, rows recomputed, worker duration,
lock waits, and per-tenant last progress. Operator pause/resume must preserve work.

Repair metadata changes in place without filtering reads. Show an explicit
repair/bootstrap notice before dispatch and clear it only after scoped discovery
and drain complete. Distinguish partial coverage from mixed algorithm versions.
Notice wording/surface and progress storage are implementation choices to review,
not a reason to silently expose repaired scores as final coverage.

**Refactor/acceptance:** resume a stopped representative-scale scan without lost
or duplicated work; verify nullable peak provenance fills where source data is
available and remains honestly unavailable otherwise. Publish measured throughput,
backlog age, WAL/lock impact, and estimated completion from observed rate. No
historical source rewrite or blocking startup backfill.

## PR 6: real-data parity and production rollout validation

**Red:** retain `TestAllCohortsNormalizeIndependently`, `TestSelectedRenownSums`,
`TestPageBossDetails`, `TestIndependentWholeSelectionCompanions`, and mixed-version
read tests in `internal/leaderboardread/read_test.go`. Add source -> evidence ->
summary -> existing API fixtures and UI checks for repair notices, unavailable
provenance, empty selection, zero values, and completed real histories.

**Green:** compare hand-selected player/guild histories with the full-history
oracle, including deletions and old/new scope corrections. Measure read latency
and refresh cost on actively written summaries, not only vacuumed synthetic
fixtures. Complete tenant-by-tenant bootstrap/drain and prove observability and
pause/retry procedures before replacing existing boards. Keep the accepted
preview layout and API; caching stays deferred.

**Refactor/acceptance:** no unexplained score/count/provenance differences; no
cross-tenant or difficulty/size leakage; no lost dirty revisions; no subject
fan-out from benchmark-only changes. Exercise feature disable/revert without
restoring removed legacy ratings. Record the accepted latency/freshness budget
with measurements and operator sign-off, not a claim that 1.23s meets 200ms.

## Validation and open implementation gates

- Use `dbtestutil.NewDB`, parallel isolated fixtures, explicit synchronization
  rather than sleeps for races, and existing tenant/RLS helpers.
- Regenerate with `make gen/db` for SQL changes; run targeted database, new
  orchestration, canonical/source, API, and read tests per PR. Preserve generation,
  backend/frontend build, lint, and full integration checks before rollout.
- Re-run [mock read benchmarks](../../scripts/leaderboardmock/README.md) for read
  regressions, but add raw-evidence histories for D2/D1 benchmarks: synthetic
  summary-only fixtures cannot measure materialization cost.
- Migration 345's covering index helps exact-cohort reads, not all-class aggregate
  latency or raw-history sorts. Its write/storage costs and visibility-map gains
  must be remeasured under churn. Additional indexes need production cardinality
  and startup/build-impact review before deployment.
- Migration 346 only adds nullable fields and a NOT VALID completeness CHECK;
  it does not backfill provenance or validate old rows by scanning at startup.
  Do not infer populated duration from the mere presence of these columns.
- Before PR 2 ships: settle claim/publication fencing and the bounded scheduling
  period through concurrency tests, including multi-replica behavior.
- Before PR 4 activates: confirm transaction boundaries for independently produced
  canonical/player/guild sources, every destructive/visibility action, and source
  duration availability. No guessed hook should ship without its source fixture.
- Before PR 5: choose durable progress storage and notice surface; before rollout,
  approve operational freshness and latency limits from measured production-like
  workloads. These are bounded implementation gates, not new rating policy.

### Source metric selection policy

The shared direct/D1 projector compares raw DPS and HPS per player/boss fight,
not roles or normalized scores. Both rates use the same source ranking duration.
Filter to positive finite candidates before comparing; the greatest value wins,
with DPS winning positive ties. An invalid counterpart does not suppress a valid
positive candidate. With no eligible positive candidate, especially 0/0, omit both
player performance and player Renown kill evidence. Guild credit is independent.
Renown remains once per player/boss regardless of selected metric or spec. Repair
retracts old observations/facts and enqueues both old and new D2 scopes. The generic
storage and calculation engine retain independent support for both metrics.
