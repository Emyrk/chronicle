# Parsernext salvage map

## Scope and source boundaries

This is an extraction index for an abandoned experiment, not a merge proposal.
The goal was lower hosting cost by using home hardware, with live progress and
an eventual battleground workflow. Raw parsing speed alone was not the goal.
The stack grew beyond a bounded change, and retained-type coverage exposed gaps.
A passing fixture or a useful local fix does not establish production readiness.

The comparisons below use two immutable source points:

- Main baseline: `c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903`.
- Committed experiment: `d4fc76ae63203152c5090c5f82b64a7334a4cb45`.
- Later local follow-ups preserved in archive: `f892a9b26cfd46b238fdaa419394cb3cd9afe423`.

“Not on main” means absent or different at that pinned main baseline, not forever.
The archive preserves the later local fixes separately from the committed tip.
Dirty files were read as evidence; their existing contents were not changed here.
No other checkout, live database, or private log was used for this comparison.
Commands below are proposed extraction checks, not a report of fresh test runs.

## Candidate 1: invalidate stale frontend stream requests

**Main status:** the extracted cache class and tests are absent on pinned main.
The main provider clears maps on ID change, but an older promise can still settle.
The experiment guards both result publication and in-flight request cleanup.

**Sources:**

- [Stream cache](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/hooks/instanceEvents/streamCache.ts).
- [Cache regression tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/hooks/instanceEvents/streamCache.test.ts).
- [Stream loader](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/hooks/instanceEvents/streamLoader.ts).
- [Provider integration](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/hooks/instanceEvents/InstanceEventsContext.tsx).
- [Main provider comparison](https://github.com/Emyrk/chronicle/blob/c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903/frontend/chronicle/src/hooks/instanceEvents/InstanceEventsContext.tsx).

**Bounded unit:** epoch plus request identity, abort on invalidation, and cleanup
that cannot delete a replacement request. Preserve shared-request deduplication.
The loader extraction is organizational, not a new stream protocol.

**Prerequisites:** current `CachedStream`/`StreamType` contracts and existing gzip,
header decoding, fetch cancellation, and provider subscription behavior.
No parsernext, database migration, headless role, or publication lease is needed.

**Tests:** port `streamCache.test.ts` with the provider wiring; cover an old loader
that ignores abort, clear followed by refetch, and failed-request cleanup.
Run targeted Vitest tests and frontend typecheck after adapting the provider.

**Risk:** changing cache ownership can accidentally duplicate requests or retain
old listeners. Cancellation alone does not prevent an ignored signal from racing.
**Extraction:** reimplement the small mechanism or extract these files together.
Do not cherry-pick `5b299f9f1`: it also introduces the durable parser handoff.

## Candidate 2: resolved instance ID as the frontend replacement boundary

**Main status:** the keyed runtime split and incremental epoch helper differ
from pinned main; the publication polling module is new to the experiment.

**Sources:**

- [Instance page boundary](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/InstancePage.tsx).
- [Publication/remount tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/InstancePage.publication.test.tsx).
- [Incremental epoch](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/EventsPanels/incrementalEpoch.ts).
- [Epoch tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/EventsPanels/incrementalEpoch.test.ts).
- [Worker aggregation integration](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/EventsPanels/usePanelAggregation.ts).
- [Polling policy](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/publicationPolling.ts).
- [Polling tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/publicationPolling.test.ts).

**Bounded unit:** treat the resolved database instance ID, not its stable route
slug, as the lifetime of encounter selections, stream providers, and panel work.
An old worker reply must not publish into a replacement instance's UI.

**Prerequisites:** route lookup must expose the resolved instance ID; coordinate
with Candidate 1 if the provider survives outside the keyed subtree.
The standalone epoch helper does not require a backend publication protocol.

**Tests:** distinguish a stable slug resolving to a new ID from an ordinary cursor
tick within one ID. Verify stale aggregation replies and encounter selections.
Verify YouTube metadata follows the resolved instance rather than the route token.

**Risk:** unconditional remounts reset legitimate UI state; use actual ID changes.
Do not equate polling activity with a new data revision.
The polling module additionally expects `publication_pending`; do not copy that
part without an independently designed backend signal and public-access tests.

**Extraction:** reimplement the ID boundary and epoch guard as a frontend fix.
Polling is optional follow-up, not a dependency that justifies the parser stack.
No standalone cherry-pick is established for this mixed feature commit.

## Candidate 3: initial root-upload publication tenant context

**Main status:** distinguish two cases. PR #2033 at pinned main
`c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903` fixes administrative root **reparses**
by recovering tenant context from prior rankings or existing log-group sources.
Do not port that fix a second time.

Initial root uploads have no source rows to discover before their first instance
publication transaction. Experiment commit
`e67fb6da1f8701e04d7c701250f9e499b031081b` adds a separate per-instance binding from
the finalized realm to its server tenant. Pinned main lacks that binding and
`parsePublicationContext`; this is a candidate for evaluation, not proof of a
current production incident. Reproduce the initial-upload case on main first.

**Sources:**

- [Initial-upload fix](https://github.com/Emyrk/chronicle/commit/e67fb6da1f8701e04d7c701250f9e499b031081b).
- [Realm-to-tenant helper](https://github.com/Emyrk/chronicle/blob/e67fb6da1f8701e04d7c701250f9e499b031081b/chronicle/logparse_realm.go).
- [Per-instance publication binding](https://github.com/Emyrk/chronicle/blob/e67fb6da1f8701e04d7c701250f9e499b031081b/chronicle/logparse.go).
- [Initial-upload RLS regression](https://github.com/Emyrk/chronicle/blob/e67fb6da1f8701e04d7c701250f9e499b031081b/chronicle/leaderboard_integration_test.go).
- [Main replacement/reparse context](https://github.com/Emyrk/chronicle/blob/c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903/chronicle/logparse.go).
- [Main prior-source context](https://github.com/Emyrk/chronicle/blob/c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903/internal/services/serviceratings/integration.go).

**Bounded unit:** after resolving an instance's realm, discover its server tenant
with administrative visibility only for discovery, then use ordinary tenant RLS
on the newly acquired publication connection. Preserve an already explicit tenant
or bypass context. Scope the binding per instance so it cannot leak to the next.

**Prerequisites:** existing realm/server queries, tenant connection hooks, and the
mainline instance-publication transaction. Main uses `db.InTx`; it does not have
the experiment's `parsePublicationTx`. Adapt the context binding directly to that
existing transaction entry point. No checkpoint, handoff fence, or new schema is
required, and none should be imported just to obtain this fix.

**Tests:** adapt `TestRootUploadPublicationScopesHighlightGeneration` using main's
APIs and isolated test databases, production connection hooks, and forced RLS.
Exercise an initial upload with no prior source identity, its first publication,
and highlight generation. Preserve #2033 reparse coverage and verify explicit
tenant/bypass behavior and isolation between instances.

**Risk:** indiscriminate administrative bypass would mask RLS failures rather
than fix context ownership. Copying the experiment's larger publication loop
would also import unrelated fences and dependencies. The historical regression
is useful evidence, not a fresh demonstration against current production.

**Extraction:** reimplement the small helper/binding on current main with the
adapted regression. Review the original three-file commit for intent, not as an
unconditional cherry-pick. Keep the already-landed reparse fix intact.

## Candidate 4: report finalization errors even when the result is nil/empty

**Main status:** still applicable at pinned main. Its instance loop skips a nil
or zero-encounter result before checking the error returned by `Finalize`.
The committed experiment has the same ordering; the later fix is preserved in the archive.

**Sources:**

- [Main instance finalization loop](https://github.com/Emyrk/chronicle/blob/c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903/chronicle/logparse.go).
- [Committed experiment loop, before fix](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/logparse.go).
- [Archived `recordInstanceFinalization` extraction](https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/chronicle/logparse.go).
- [Archived regression tests](https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/chronicle/logparse_finalization_test.go).

**Bounded unit:** distinguish empty success from failure before skipping results.
Record nil-result errors and empty-result errors in `InstanceFailures`, report
entries, and failure metrics. Empty successful results should remain skippable.

**Prerequisites:** existing instance report, timing metrics, and job-output types.
No checkpoint restore, native queue, lease, or catalogue schema is required.
The archived test uses existing metrics helpers; confirm those exist when porting.

**Tests:** preserve `TestRecordInstanceFinalization`'s four cases: nil/error,
empty/error, nil/success, empty/success. Add a populated success case if extracting
into a differently structured loop. Check timing observations and failure counts.

**Risk:** this fix reports per-instance errors; it does not by itself make every
partially successful parse fail the whole job or guarantee that an instance exists.
Do not change whole-job semantics accidentally while repairing the error ordering.

**Extraction:** reimplement the small mainline loop fix and its unit tests.
There is no original committed cherry-pick for this dirty follow-up.
Do not copy the archived `logparse.go` wholesale.

## Candidate 5: exclude the zero-GUID sentinel from active participants

**Main status:** missing at pinned main. The main activity callback admits every
active character; the experiment additionally rejects `c.ID().IsZero()`.
Original fix: `432d2650a69302beb7d212f362e49adcd1f6c5ee`.
That commit is not an ancestor of the pinned main baseline.

**Sources:**

- [Participant membership guard](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/common/participants/participants.go).
- [Environmental-source regression](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/common/participants/zero_actor_test.go).
- [Main participant tracker](https://github.com/Emyrk/chronicle/blob/c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903/combatlog/parser/common/participants/participants.go).

**Bounded unit:** environmental or unknown-source damage can retain an unknown
character for attribution, but an absent actor should not become a participant.
Preserve the zero sentinel in event/character evidence where it belongs.

**Prerequisites:** existing GUID zero predicate and activity callbacks.
The production condition is small. The experiment's test is not independently
portable: it also exercises parsernext CLEU decoding and ownergraph restoration.

**Tests:** recreate an active zero-GUID character using main's existing APIs;
assert it is absent from participants while the actual victim remains present.
Keep ordinary nonzero actor coverage and unknown-source damage attribution.
A later snapshot implementation would need its own round-trip invariant test.

**Risk:** deleting the sentinel from all state is a different, potentially lossy
change. This candidate is only about membership, not decoding or attribution.
**Extraction:** reimplement the guard and main-compatible test, or selectively
extract the production hunk from the original commit after reviewing its test deps.
Do not assume the two-file commit can be cherry-picked and tested unchanged.

## Candidate 6: a connect-only mode in the shared pgxpool service

**Main status:** `NewConnectOnly` and its tests are absent at pinned main.
Original refactor: `0e39ce7626d0c0500aeb99e87f7e82a90d9acc9e`.
The pinned experiment links below include that refactor.

**Sources:**

- [Shared service mode](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/internal/services/servicepgxpool/servicepgxpool.go).
- [Mode/lifecycle tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/internal/services/servicepgxpool/connect_only_test.go).
- [Headless caller example](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/cmd/chronicled/cli/parser_services.go).
- [Caller pool-hook tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/cmd/chronicled/cli/parser_services_test.go).
- [Main shared service](https://github.com/Emyrk/chronicle/blob/c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903/internal/services/servicepgxpool/servicepgxpool.go).

**Bounded unit:** retain the same broker identity, CLI/environment options,
connection limits, diagnostics, monitoring, role/type setup, and shutdown behavior;
allow a provisioned-schema caller to omit migrations and pubsub startup.

**Prerequisites:** a real caller that must not migrate and does not require pubsub.
`database.PoolConfig`'s ready hook must still enable application role/type setup.
Caller hooks apply after shared defaults; preserve `AfterConnect` rather than
replacing the role setup. Tenant context hooks remain the caller's responsibility.

**Tests:** retain option/identity parity, same broker lifecycle, bounded ping,
empty-schema remains unmigrated, no pubsub, hook execution, and pool shutdown.
Use isolated temporary databases. Keep tenant reset/reuse tests if tenant hooks
are part of the future caller; these are not evidence to bypass tenant services globally.

**Risk:** a consumer expecting pubsub can fail if handed the alternate mode.
Skipping migrations does not mean an unprovisioned database can serve queries.
**Extraction:** reimplement or extract service and tests only when a caller exists.
The whole refactor also deletes an earlier experimental helper and rewires parser
commands, so an unreviewed whole-commit cherry-pick is not a standalone solution.

## Candidate 7: identity catalogue taxonomy as a diagnostic concept

**Main status:** the experiment's catalogue types/schema are not a mainline feature
at the pinned baseline. Preserve the classification idea, not the whole feature.

**Sources:**

- [Wire taxonomy and provenance](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/api/chroniclesdk/identity_catalogue.go).
- [Collector persistence adapter](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/identity_catalogue.go).
- [Catalogue tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/identity_catalogue_test.go).
- [Review API authorization/tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/api/identity_catalogue_test.go).
- [Committed review UI](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Logs/IdentityCatalogue.tsx).
- [Archived disclosure/admin-only follow-up](https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/frontend/chronicle/src/pages/Logs/IdentityCatalogue.tsx).

**Bounded concept:** separate GUID kind, semantic category, affiliation, and
recognition rather than collapsing every unknown into one bucket.
Retain provenance, conflicting observations, bounded evidence, and the distinction
between an unresolved identity and an intentional zero-GUID sentinel.

**Prerequisites:** specify one concrete diagnostic question and its authorized
reader before choosing storage. A local report may be enough; persistence is not
inherent to the taxonomy. Names and related GUID evidence need access controls.

**Tests:** preserve classification/conflict cases, bounded evidence counters,
replacement-generation pagination, and admin-only behavior if a UI is rebuilt.
The archived lazy-disclosure UI is separate from the committed taxonomy contract.

**Risk:** the implemented feature spans parser collection, SDK generation, API,
SQL, migrations, and frontend. Copying the schema imports a publication lifecycle.
**Extraction:** re-design a smaller diagnostic consumer using the vocabulary.
Do not cherry-pick migration 388 or the full catalogue pipeline as a “small fix”.

## Candidate 8: owner-local codec methods as a future design pattern

**Main status:** the snapshot graph infrastructure these methods depend on is
absent at pinned main. The refactor is not a portable implementation.
Original refactor: `eaf37860eb908cb68400750cc209c27fd038c21a`.
Use pinned experiment files for browsing.

**Sources:**

- [Character owners](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/common/characters/graph.go).
- [Period owners](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/common/characters/period/graph.go).
- [Vanilla wrapper methods](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/vanilla/creatures/wrapper_graph_methods.go).
- [Wrath owner methods](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/wotlk/creatures/owners_graph_methods.go).
- [Archived retained-type inventory](https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/period/RETENTION.md).
- [Archived inventory tests](https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/period/retention_inventory_test.go).

**Bounded concept:** place capture/restore responsibilities with the state owner,
with explicit shared-reference identity and runtime reattachment boundaries.
Method locality can improve reviewability; it does not establish codec completeness.

**Prerequisites:** an independently approved serialization contract, registry,
versioning, reference graph rules, concrete retained-type inventory, and preflight.
Do not pull in ownergraph just to avoid rewriting a narrow helper.

**Tests:** enumerate reachable retained concrete types, preserve shared pointers,
cover aliasing and runtime hooks, then compare uninterrupted and restored behavior.
Round-trip tests for one synthetic fixture do not cover all retained message types.
The dirty inventory is investigative evidence, not a certified complete inventory.

**Risk:** the refactor spans eleven files and existing snapshot assumptions.
Retained-type omissions were part of the reason the experiment was abandoned.
**Extraction:** retain the design lesson only until a bounded serialization need
exists. Do not cherry-pick `eaf37860e` without its snapshot dependencies.

## Explicitly excluded from these candidates

- Migration 388 (`log_identity_catalogues`) is historical experiment evidence.
- Migration 389 (`parser_handoff`) is historical experiment evidence.
- Neither migration is an installation instruction or should be applied as salvage.
- Native parse/finalize/GC queues, durable handoff, identity overrides, and publication
  leases are not prerequisites for the small independent fixes above.
- Dirty log-detail kind/status fixes repair the experiment's new job contract;
  they are not automatically useful to main without those new job kinds.
- Do not copy generated SQL or SDK output independently of its source contract.

[Historical migration 388](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/database/migrations/000388_log_identity_catalogues.up.sql)
and [historical migration 389](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/database/migrations/000389_parser_handoff.up.sql)
are linked for explanation only, not execution.

## Extraction discipline and remaining uncertainty

Choose one bounded candidate and re-check it against the then-current main.
Compare behavior and imports, not just whether a patch applies cleanly.
Take its focused tests first; remove experimental test dependencies deliberately.
Record what remains out of scope, especially persistence and cross-process state.
Use the project build tags appropriate for the target server during validation.
Re-run lint/typecheck and focused tests on the extracted result, not this archive.

The original source commits describe provenance, not an endorsed merge order.
The later local follow-up set is preserved separately from the committed experiment
in archive `f892a9b26cfd46b238fdaa419394cb3cd9afe423`.
No claim is made here that its diagnostic tests close every retained-type gap.
These candidates preserve useful evidence while leaving the abandoned stack abandoned.
