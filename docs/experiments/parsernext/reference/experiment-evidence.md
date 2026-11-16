# Parsernext experiment evidence

## Decision and scope of this record

The owner stopped this parser stack as a merge candidate.
The decision does not reject all headless-compute or state-ownership ideas.
It rejects treating this implementation train as the next merge target.
Any salvage needs an independently scoped proposal against current main.

The intended benefits were lower hosted compute cost through home hardware,
then live logging and eventual battleground support.
Raw throughput alone was not the acceptance criterion.
No measured end-to-end hosted-cost reduction was established by this experiment.

This record separates code facts, test evidence, and private-case observations.
Private logs, player names, GUIDs, database URLs, and raw artifacts are omitted.
Case measurements below are historical observations supplied during the experiment;
they are not reproducible public benchmark fixtures bundled with this document.

## Source states

| State | Pinned revision | Meaning |
|---|---|---|
| Main comparison baseline | `c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903` | Main already included root-reparse tenant context fix #2033. |
| Last committed experiment tip | `d4fc76ae63203152c5090c5f82b64a7334a4cb45` | Includes development compatibility identity, not the later repair set. |
| Preserved experiment archive | `f892a9b26cfd46b238fdaa419394cb3cd9afe423` | Includes the later formerly uncommitted fixes; an archive, not a merge recommendation. |

[Main baseline](https://github.com/Emyrk/chronicle/tree/c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903)
and [committed experiment tip](https://github.com/Emyrk/chronicle/tree/d4fc76ae63203152c5090c5f82b64a7334a4cb45)
are distinct histories. The source archive branch is
`archive/parsernext-experiment-20261116T143102Z`. Do not infer that every experiment capability was absent
from main, or that every local repair existed at the committed tip.

The wider experiment occupied a large stacked-PR train, reported as 96 PRs.
That count describes review scope, not 96 independently supported features.
This documentation does not inventory or endorse every commit in that train.

### Selected timeline

| Commit | Change | Interpretation |
|---|---|---|
| [432d2650a](https://github.com/Emyrk/chronicle/commit/432d2650a69302beb7d212f362e49adcd1f6c5ee) | Exclude unknown-source sentinel from participants | Small correctness candidate, subject to a main comparison. |
| [ba278e70e](https://github.com/Emyrk/chronicle/commit/ba278e70e4a4ffeeb49bf3680b0f52301b199403) | Always-on per-log identity catalogues | Broader product/schema addition, not a free side effect of parsing. |
| [eaf37860e](https://github.com/Emyrk/chronicle/commit/eaf37860eb908cb68400750cc209c27fd038c21a) | Owner-method character graph codecs | Organizational lesson; depends on graph machinery. |
| [a7cd5f561](https://github.com/Emyrk/chronicle/commit/a7cd5f5617b8f8d0e00486cda779ca43cdd21f38) | Bound evidence for recognized identity histories | Reduced catalogue evidence work, not elimination of snapshot size. |
| [5b299f9f1](https://github.com/Emyrk/chronicle/commit/5b299f9f146033f9afd0d87be8e2a5fa710ab6ad) | Durable headless handoff | Compute/publication separation plus significant queue/storage scope. |
| [0e39ce762](https://github.com/Emyrk/chronicle/commit/0e39ce7626d0c0500aeb99e87f7e82a90d9acc9e) | Shared pgxpool connect-only service | Reused existing configuration/lifecycle instead of another pool abstraction. |
| [d4fc76ae6](https://github.com/Emyrk/chronicle/commit/d4fc76ae63203152c5090c5f82b64a7334a4cb45) | Explicit development compatibility identity | Local-build convenience, not evidence that differing builds are safe. |

### Later repair set

The following were uncommitted when investigated, then preserved in the archive:

- Primary parsing count zero omitted both parse consumers.
- Independent positive finalizer concurrency defaulted to one.
- `SpellStart`, `Cast`, `LegacyCast`, and `AuraCast` gained retained codecs.
- A bounded AST retention inventory covered 184 reviewed expressions.
- Nil/empty finalization results no longer hid accompanying errors.
- Backend status selection could recover same-generation publication output.
- Frontend finalizer output/timing visibility and handoff state were corrected.
- Identity catalogue sections were collapsed for usability.

These are separate from the previously committed headless implementation.
Use [the salvage map](salvage-map.md) for exact paths and prerequisites.

## Architecture actually exercised

The ordinary daemon owned authorization and authoritative publication.
The `chronicled parser` role consumed only the native parsing queue.
It used PostgreSQL, object storage, and the primary compatibility endpoint.
It did not initialize the ordinary HTTP/authentication/business-service graph.
This was not an offline parser with no shared infrastructure dependency.

The producer captured immutable input metadata, parsed a frozen logical input,
wrote an immutable gzip checkpoint, and accepted its pointer under lease fences.
Acceptance enqueued primary finalization in the same database transaction.
The primary restored that exact artifact before replacing serving output.
It reused existing publication, ranking, and related downstream behavior.

Useful implementation anchors at the committed tip:

- [Compute boundary](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/parse_compute.go)
- [Headless factory](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_parse_factory.go)
- [Producer](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_parse_worker.go)
- [Artifact envelope](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_parse_artifact.go)
- [Primary finalizer](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_finalize.go)
- [Handoff SQL contract](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/database/PARSER_HANDOFF.md)

Native parser selection made the full JSON handoff operationally required.
This differed from the original idea of an optional continuation cache whose
failure could simply fall back to parsing all input in memory.
A missing codec could fail the native worker even when raw parsing succeeded.
That difference is central to the decision to stop.

## Lifecycle distinctions that survived testing

### Logical EOF is not terminal finalization

A complete-file boundary drains file-local parsing and reordering.
It does not terminate open encounters using artificial end-of-log behavior.
`Finalize` is terminal and may drain state and produce final result builders.
Treating these operations as equivalent would invalidate continuation parity.

### Successful snapshot capture is non-consuming

A successful `Snapshot` leaves its live session usable.
The original session can continue or finalize independently of later restores.
A saved snapshot can be restored more than once into independent graphs.
This is not a guarantee that failed processing/capture operations are recoverable
in place: the session API invalidates failed operations as documented.

### Restore is future-input-only

The saved checkpoint carries completed provenance.
Restore options describe only future complete bundles, not a replayed old prefix.
Tests removed historical input before restore and continuation.
Runtime dependencies must be reconstructed with compatible identities.
Restore does not serialize executable callbacks or obtain authority from payloads.

### Uploaded storage chunks were not complete-file commits

Production storage parts can split lines and semantic input boundaries.
The worker concatenated the base and ready parts into a frozen logical prefix.
It replayed that whole prefix for append attempts.
It did not resume directly from arbitrary uploaded-part EOF.
The complete-file facade therefore did not deliver production live incremental
logging, despite supporting declared complete-bundle continuation in tests.

[Complete-file API contract and test matrix](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/docs/logparse-snapshots/complete-file-session.md)
contains the detailed historical implementation contract.
Older design documents calling snapshots optional describe an earlier proposal;
read them with the later mandatory native handoff distinction above.

## Size evidence: large-log case

The following measurements describe one inspected large artifact and input.
Decimal MB are used for the rounded figures; do not interpret them as MiB.
Compression comparisons used gzip level 6.
They do not measure peak memory, CPU time, network egress, or service cost.

| Component | Observed size |
|---|---:|
| Full snapshot JSON | 190,800,984 bytes |
| Raw log | 138,077,632 bytes |
| Gzipped snapshot | approximately 23.46 MB |
| Gzipped raw log | approximately 11.84 MB |
| Event payload binary before JSON base64 | 104,930,500 bytes |
| Event payload base64 text | 139,907,364 bytes |
| Everything outside that base64 payload | 50,893,620 bytes |
| Identity catalogue | approximately 13.60 MB |
| Shared damage state | approximately 9.37 MB |
| In-progress state | approximately 7.13 MB |

The inspected tree contained 124,137 nodes: 39,154 objects, 84,982 references,
and one directory node. These counts describe that archive representation.
They do not imply the same number of semantically independent gameplay objects.

Base64 explains substantial textual inflation, but not the whole problem.
The roughly 50.89 MB remainder was not a demonstrated minimal continuation state.
Catalogue and event payloads were useful outputs mixed into the live-state archive.
Compression reduced size substantially while leaving snapshot transfer larger
than compressed raw input in this case.

A future binary encoding might remove base64 overhead.
It would not by itself remove output accumulation or fix retained-type coverage.
A protobuf handoff was a possible future direction, not an implemented or
validated result format in this experiment.

## Parity evidence: BWL case

A real-log BWL comparison produced useful but bounded evidence.
The compared result reported 37 encounters, 21 players, and 968 units.
Do not generalize those counts to all formats, encounters, or retention paths.

For non-consume outputs, the available comparison established counts and sizes.
It was not a complete decoded-event semantic equality proof.
Equal byte lengths or event counts can hide different values or ordering.

Consume catalogue comparison was stronger: semantic comparison covered
1,448 identities, 4,835 observations, and 1,694 evidence entries, with equality.
This supports the tested consume-history path for that input and configuration.
It does not certify every catalogue category or a future dataset revision.

The private source input and measurement artifacts are not included here.
Future agents must not invent a public reproduction command for that exact case.
Use the committed deterministic tests to reproduce the public contract, then
obtain explicit permission for a new representative-data benchmark if needed.

## Executable test evidence and its limits

### Library lifecycle and continuation

[Complete-session tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/logparse_complete_session_test.go)
cover disk continuation, failed inputs, runtime preflight, and immediate finalize.
They establish behavior at declared complete-file boundaries.
They do not validate an arbitrary append-chunk cursor protocol.

### Independent processes

[Subprocess tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/logparse_checkpoint_subprocess_test.go)
run capture, wait for exit, remove historical input, and restore with fresh dependencies.
They compare canonical outputs and saved checkpoint stability.
They use the same test executable, not two independently compiled daemon releases.
The rejection case changes a valid asserted digest; it is not a second compiled build.
This is stronger than a same-process restore but narrower than deployed interoperability.

### Worker-to-publication

[Durable pipeline tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_worker_pipeline_test.go)
exercise actual worker construction, PostgreSQL handoff, accepted bytes, and publication.
The storage adapter is byte-real local storage with opaque-key adaptation.
These tests are not live primary and parser daemons communicating through S3.
They cover duplicate delivery, wrong identity, append replacement, and artifact lifecycle.
Later tests additionally ran the pipeline under an explicit development identity.

### Format coverage

[AzerothCore session tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/logparse_acore_session_test.go)
and [expansion tests](https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/logparse_expansion_session_test.go)
exercise prepared production registry recipes and normalized semantic outputs.
A format matrix is not a proof that every creature-specific retained event is present.
The later SpellStart failure is direct evidence of that distinction.

## Failure findings

### Repeated retained-message gaps

Earlier coverage included ResourceChange, Heal, Dispel, and SpellGo.
The reported failure was `unsupported resolved retained message *messages.SpellStart`.
Arugal can retain SpellStart as its last activity through actual production logic.
The subsequent audit also found Cast, LegacyCast, and AuraCast retention routes.

The repair set used explicit DTOs and graph owners, not reflection fallback.
It preserved canonical spell references and message base state.
It added production-shaped continuation tests and a reviewed AST inventory.

[Retention classification](https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/period/RETENTION.md)
and [inventory test](https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/period/retention_inventory_test.go)
are the detailed handoff for that audit.
The inventory freezes 184 reviewed expressions, not all possible runtime values.

Delayed evade confirmation, Sneed ejection, Thaddius previous-spawn cleanup,
timeout-linked deaths, and generic forwarding can retain arbitrary current messages.
A regression demonstrates an unsupported SpellFail retained through delayed evade.
The audit therefore did not make the snapshot vocabulary complete.

### Completed finalizers with apparently absent instances

Read-only local investigation found three completed finalizers with six published
instances in total and publication output metadata present.
That evidence did not support a lost-publication conclusion for those jobs.
A frontend legacy-only kind guard hid native finalization results.
Backend newest-job selection could also hide an earlier same-generation finalizer's output.
Both visibility paths were addressed in the later repair set.

Separately, publication checked nil/empty finalized results before their errors.
The repair recorded those errors while retaining benign empty-result skips.
This was an independent correctness finding, not the proven cause of the display incident.

## Operational boundaries and non-deliveries

- Exact executable identity was the production default.
- Explicit development labels deliberately weakened that one compatibility dimension.
- Dataset identity/revision, format/flavor, wire/schema, and lease fences stayed strict.
- Primary parsing count zero initially produced an invalid River queue configuration.
- The later fix separated finalizer concurrency from parser concurrency.
- Parse acceptance and publication progress were separately fenced.
- Final publication reused multiple transactions; it was not an atomic serving snapshot.
- Accepted obsolete checkpoints had bounded cleanup with a grace period.
- Unaccepted uploads left by crashes had no automatic orphan enumeration/sweep.
- Native CPU profiling was explicitly unsupported rather than silently accepted.
- No user-visible production live-incremental guarantee was established.

## Validation record, not certification

Historical suite totals changed as tests were added; earlier runs reported 6,307
and later totals. The final local backend integration run reported **6,454 tests,
24 skipped**, plus clean lint and a static AzerothCore build.
These are recorded historical results, not checks performed by this documentation PR.
Skipped private-fixture, browser, and opt-in workload tests remain limitations.
The count does not override the demonstrated arbitrary-message retention gap.

To inspect the archived implementation, a future maintainer can run its targeted
Go tests with its documented database prerequisites and `azerothcore` build tag.
Do not run old migrations against a current or user database to reproduce this report.
Migration numbers 388 (catalogue) and 389 (handoff) belong to the historical branch;
they may collide with main and are not migration instructions.

For next steps, use [the salvage map](salvage-map.md) and
[design notes](design-notes.md), not the old stack as a default implementation plan.
