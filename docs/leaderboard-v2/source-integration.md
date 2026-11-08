# Normal source integration and enabled dispatch

D1/D2 dispatch is enabled by the `DispatchEnabled` code constant, following explicit user approval. Periodic scans run every 30 seconds against existing due dirty rows only. There is no automatic historical discovery/backfill, no UI/cache change, and no CLI/environment activation flag. Disable by changing the constant and redeploying. Existing worker limits remain 100 D2 scopes, 10-minute work deadline, 15-minute ownership lease; D1 repairs one run per invocation.

## Publication map

| Authoritative boundary | Leaderboard integration |
|---|---|
| `servicerankings.refreshRankingRunsTx` | Capture old/current logical identities before canonical delete/upsert; serialize direct publication; project available canonical evidence and enqueue D2 in that transaction |
| Parser raw rankings transaction in `chronicle/logparse.go` | Serialize before DPS/HPS writes, then project current canonical source and enqueue D2 before commit |
| `WorkerComputeTimeParseScores.Work` | Serialize immediately before replacing raw duration rows, then publish guild evidence before commit; normalized parse scoring/lookback remains unchanged |
| `InvalidateWoWLogGroup` / `ClearWoWLogGroupInvalidation` | Durable D1 obligation in the same transaction before eligibility/raw-source mutation |
| User group/instance deletion and retention hard instance deletion | Capture old identities and enqueue D1 before source deletion; evidence survives until repair |
| Reparse `advanceParseGeneration(clearParsed=true)` and `stageParseGeneration` | Enqueue D1 immediately before actual parsed-source deletion, after existing generation/global locks |
| Parser duplicate linking, API ungroup, unlisted duplicate reconciliation | Retain old/new logical-run obligations atomically with identity changes |
| API mark-unlisted | Source visibility mutation and D1 obligation share one transaction |

Artifact-only retention/file deletion does not change leaderboard evidence. Clearing invalidation restores eligibility but does not recreate deleted raw rankings/durations; later raw publication supplies those missing stages.

## Shared transaction and tenant contract

`PrepareDirectRunsTx` captures `(tenant,run)` keys from current source, canonical records and surviving evidence, sorts via SQL, and locks short D1 serialization rows before source mutations. `PublishDirectRunsTx` projects within the same transaction, captures current old evidence, writes old/new D2 obligations and evidence atomically, then removes only placeholders created by that direct transaction. Existing pending repair is preserved; overlapping active claims gain a revision without token invalidation. Normal settled publication leaves no new persistent D1 obligation.

The accepted eventual-consistency rule remains unchanged: an owned D1 snapshot may overwrite a newer direct projection, but its preserved newer revision forces another repair. Every source mutation must either publish evidence directly or commit a durable D1 obligation.

Root-domain actions resolve the nonnull source tenant before opening the mutation transaction. Existing privileged multi-tenant canonical operations retain their explicit admin bypass; all integration queries are still tenant/run-qualified. No tenant session is switched inside a transaction. Strict public D1 projection remains tenant-scoped. No source-generation table or projection advisory lock was added.

Group-mutating actions lock their existing group row before D1, matching raw/reparse group→D1 ordering. Existing canonical/global locks retain their previous purpose. Projection takes no additional source locks. The canonical transaction already holds its global lock while performing direct evidence publication; this cost is measured below, not hidden.

## Metric selection and canonical delivery caveats

The shared projector selects the greatest positive finite raw DPS/HPS candidate per player/boss fight, with DPS winning positive ties. Invalid candidates are excluded before comparison and cannot poison a valid counterpart. This is not role classification: both rates share the source ranking-duration denominator, and roles/class/spec do not choose the metric. No eligible positive candidate (including both zero) means neither player performance evidence nor player Renown kill credit. Eligible players receive one metric-free Renown fact per boss; guild credit is independent. Direct writers and D1 use this same policy, while generic storage/calculators continue to support both metrics independently.

Canonical-refresh jobs now use River `InsertTx` in the same source/action
transaction. Enqueue failure rolls back source changes and their evidence/D1/D2
writes. A missing queue fails closed when a tenant-backed leaderboard identity
exists; database-only legacy fixtures without such identities have no leaderboard
job obligation. D1 still does not reconstruct canonical membership. Normal
post-commit duplicate enqueueing was removed. Parser replacement completion and
failure reconciliation remain as idempotent compatibility/final-snapshot requests
for previously queued jobs; they are no longer the sole delivery guarantee for
new source mutations.

Migration351 adds leading run/source btree lookup indexes to each evidence family.
A combined five-index GIN array design was tested and rejected: forced-RLS plans
still scanned all 50000 unrelated rows (~13ms). The ten narrow btree indexes allow
BitmapOr lookup by either identity under the real policies; the same fixture
measured 0.200ms and asserts both indexes for every family. Existing tenant/run
indexes remain useful for tenant-scoped D1 projection. Tables were confirmed empty
for deployment, so this is ordinary index creation, not an existing-history rewrite.


## Verification and local cost

Tests exercise actual canonical refresh→evidence publication with no normal D1 residue, rollback of canonical/evidence/D2 changes, independent raw-duration publication and replacement, root-context action tenant resolution, real user instance deletion, invalidation/clear, reparse deletion, overlap with a stale D1 claim, and tenant isolation. Existing parser, unlisting, retention, API, and ranking suites remain part of validation. Source-action tests use isolated PostgreSQL and authorization fixtures, not production or preview data.

Opt-in `CHRONICLE_MEASURE_CANONICAL=1 go test ./database -run TestMeasureCanonicalLeaderboardPublication -v` measures one 40-player/12-boss canonical refresh with both player metrics and metric-free kills. Seven local samples were 78.711,123.934,109.681,111.486,113.007,109.401,114.296ms. This includes canonical refresh and evidence/D2 publication inside the existing global transaction; it is not a production latency guarantee or all-time D2 history measurement.

Final validation passed: all touched database/API/Chronicle/retention/rankings/ratings/River/CLI suites; three-repeat targeted race tests for direct/repair/source actions; changed-code lint; backend build; and `make gen/db`. The actual unlist-versus-reparse ordering regression uses two connections, a held group row, and PostgreSQL blocker metadata before testing D1 availability. Full `make gen` retains the known missing icon-assets blocker; no generated frontend files were changed.
