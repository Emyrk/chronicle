# Parsernext: reference design notes

## Status, purpose, and evidence

The parser stack is abandoned as a merge candidate, not as a source of ideas.
This document preserves boundaries worth reconsidering without recommending
that the complete stack be merged, deployed, or automatically resumed.
The intended benefit was lower infrastructure cost through available home
hardware and eventual battleground support, not a parsing-speed claim.
No throughput, memory, bandwidth, or operating-cost improvement is asserted here.

**Established** means visible implementation behavior or narrowly exercised tests.
**Proposal** means a possible future direction that needs its own design decision.
A test proves its fixture and contract, not all combat-log shapes or graph owners.

Two source layers must remain distinguishable:
- **Committed baseline:** [d4fc76ae63203152c5090c5f82b64a7334a4cb45][baseline].
- **Later working-tree archive:** [f892a9b26cfd46b238fdaa419394cb3cd9afe423][archive].
  Later retention fixes and audit evidence must not be attributed to the baseline.

Historical migrations 388 (identity catalogues) and 389 (parser handoff) belong
to the archived experiment. **Do not apply them from these notes.** Any future
schema proposal requires current schema review and deployment-impact approval.

## 1. Reuse capabilities, not an entire server composition

**Established:** [parseCompute][compute] collects the plain parsing capability.
It accepts selected input and game-data dependencies and returns pre-finalize
state. It does not own HTTP routing, authorization, queue topology, or serving
publication. This is a useful seam independent of serializing that state.

[Native factories][factory] compose database, object storage, logger, dataset
resolution, registry selection, and per-job game-data acquisition around compute.
The headless process need not instantiate the full Chronicle application or Zed.
Primary publication still belongs to the ordinary service composition.
This is capability reuse, not evidence that every service should be extracted.

Constructor inputs should express the actual dependency boundary explicitly.
Per-job game-data resources need a release path; process-owned caches need a
separate lifecycle if a future design chooses to share them.
A wrapper should not hide optional interfaces used by its consumer: the spell
recorder had to forward Consumables in addition to the base GameDB interface.

**Proposal:** preserve the smallest useful plain compute interface first.
Only add broker-managed lifecycle when startup/shutdown, dependency ordering,
or background ownership requires it. A headless executable should select that
composition, not duplicate parser semantics or create a second service locator.
Cost offload can be investigated independently of resumable parser state.

## 2. Compute and publication are different authority boundaries

**Established:** [native producer][producer] computes an immutable attempt.
[Primary finalization][finalizer] restores the accepted artifact and uses the
existing publication machinery. A producer is not permission to write arbitrary
serving rows, clear prior output, or select a different finalization artifact.

Jobs identify the log, parse generation, parser engine, and producing identity.
Attempts identify immutable stored bytes and their digest, dependency identity,
input provenance, and predecessor. Publication addresses an exact attempt rather
than asking the worker to recompute whatever the newest upload contains.
Original parse options must travel with the artifact: tenant, replacement, and
other publication semantics cannot be reconstructed from an attempt ID alone.

The finalizer must validate and restore before destructive staging of output.
It must not silently recompute from raw logs when an artifact is missing,
incompatible, or corrupt. Such fallback would conceal a failed handoff contract.
Admission and queue separation are operational controls, not substitutes for
lease ownership, generation checks, or identity checks inside transactions.

**Proposal:** keep compute/publication separation even if the future handoff is
ordinary finalized output rather than a restorable parser graph. Those are
independent decisions with different payload and compatibility requirements.

## 3. Production-facing parsernext required the full handoff

**Established in this experiment:** the production-facing parsernext selection
routes through native checkpoint production and primary finalization.
The JSON graph handoff is mandatory on that route, not just a verbose attachment.
The [producer][producer] invokes the complete-session capture path and stores a
gzip envelope containing the full pre-finalize JSON snapshot.
[Artifact restoration][artifact] reconstructs parser state for publication.

The optional downloadable debug snapshot is a separate concern. Removing that
attachment does not remove the mandatory full graph serialization boundary.
A failure to encode a retained moment can therefore fail a real parsernext job.
The observed unsupported SpellStart failure exposed that distinction directly.

This design carries serialization, storage, transfer, restore, and schema costs.
Moving compute home does not establish that these costs are acceptable.
The archive contains implementation evidence, not a measured economic comparison.
A future cost study should compare simple offload with and without continuation.

## 4. EOF, snapshot, restoration, and Finalize are distinct operations

The [complete-session facade][session] defines complete logical-file boundaries.
A successful logical-file EOF is a checkpoint boundary; it does not finalize
encounters. More explicitly declared complete files may follow in that session.

Successful Snapshot serializes state without consuming the live graph.
The live session remains usable; capture does not secretly Finalize a clone.
The caller owns compression, closing, object upload, and durable acceptance.
Serialization success alone does not acknowledge durable publication.
A capture/write failure invalidates that session rather than promising safe reuse.

RestoreCompleteFileSession reconstructs saved owners and validates the archive.
It does not attach runtime callbacks or execute gameplay during decoding.
WireRuntime is a separate operation using current trusted dependencies.
Restoration options supply only **future** complete-file inputs, not historical
files to reread or compare against mutable current storage.
Saved completed bundles are authoritative historical provenance.

Finalize is terminal for the graph on which it runs. Previously captured disk
checkpoints remain independent artifacts. Publishing a view and preserving a
future continuation branch require deliberate ownership of those graph lifetimes.

## 5. Storage chunks are not complete logical files

**Established:** [producer input capture][producer] freezes file, ready-part,
and artifact metadata in a consistent database snapshot.
Raw loading uses those captured parts rather than listing the mutable latest
parts again during parsing. Ordering and complete-byte assembly matter.
An upload boundary can split a text line, timestamp, header, or parser context.

The native upload worker uses the conservative fallback: concatenate the frozen
logical prefix and replay it from the beginning for each attempt.
It does **not** resume arbitrary appended chunks from a prior COMPLETE snapshot.
A later part outside the manifest cannot enter an already selected attempt.
[Partial-line and subprocess fixtures][artifact-tests] exercise selected seams;
they are not evidence of a general live-incremental parser.

The complete-session API's declared-file continuation remains a different,
explicit contract. It must not be presented as continuation across arbitrary
storage parts, arbitrary byte offsets, or an unfinished logical file.
**Proposal:** any live-input design needs its own framing and parser-state proof.

## 6. Reference identity is not runtime wiring

[Ownergraph][ownergraph] represents explicitly registered owners and references.
Multiple moments can point to one retained message; multiple messages can share
one prepared spell owner. Capturing each as an independent value changes aliases.
Equality of JSON fields alone does not establish preservation of that identity.

Restoration must recover the canonical graph references, not merely equivalent
copies. It must also avoid aliasing restored mutable objects back to the live
source graph or to another independent restoration.
Trusted prepared game-data values are resolved under the expected compatibility
identity; the archive must not choose an arbitrary runtime resolver.

Runtime callbacks, loggers, registries, and hooks have a different lifecycle.
They are supplied or rebound after structural validation, not serialized as
executable behavior. A decoded graph can be pending wiring and unusable until
its trusted runtime dependencies have been checked and attached.

[Owner-method refactor eaf37860e][methods] made capture/restore methods easier to
locate with their owner types while keeping explicit registration and schemas.
The retained lesson is to separate **reference edges**, **local state**, and
**runtime wiring**, even when methods make the code easier to navigate.
Moving a function onto an owner does not remove the need for any of these layers.

## 7. Explicit retained DTOs solve a problem and create upkeep

The later [retention audit][retention] added explicit support for four reachable
types: SpellStart, Cast, LegacyCast, and AuraCast.
SpellStart retains base state, raw spell ID, canonical spell data, optional item
and target, caster, flags, cast time, channel duration, and spell type.
Cast preserves its legacy value spell descriptor rather than inventing a game DB
reference. AuraCast retains a canonical spell and all effect/timing/cap fields.

Primitive numeric enum fields were necessary for AuraCast: its public API JSON
marshalers produce display objects without matching state restore unmarshaling.
This illustrates why an output-oriented JSON shape is not automatically a safe
internal-state schema. Explicit DTOs need deliberate field-by-field review.

The later [184-site AST inventory][inventory] records retention calls, forwarding
calls, moment construction, and relevant retained-state writes in bounded
character directories. [Contract tests][contracts] map concrete known types to
codecs. Production-shaped tests use actual character factories and processing.
They cover Arugal, legacy CC, Object/Core Rager, and Mimiron self-repair paths.

This is still a second message taxonomy: source message types, retained DTO
variants, graph registrations, allowlists, and tests must evolve together.
A new field or reachable event can require updates in several places.
No universal reflection serializer was introduced to conceal missing ownership.

## 8. The retention audit does not establish universal safety

Current gameplay mark producers in the inspected parser code were bounded:
Core Rager marks AuraCast, Razorgore marks SpellGo, and Sartharion marks Aura.
ProcessCommonActivity checks marks before its concrete event switch, however.
Its interface permits future callers to mark other message types.

Other routes already accept arbitrary current messages:
- Delayed evade confirmation can complete on any later timestamped message.
- Sneed ejection can finish using the current message after a pending death.
- Thaddius previous-spawn cleanup uses the first current event.
- Linked death propagation can inherit arbitrary timeout-triggering input.
- Generic Start/Bump/Died/End and new-fight callbacks forward message interfaces.

The later [dynamic-boundary regression][dynamic] demonstrates unsupported
SpellFail retained after delayed evade. Unknown kinds still fail closed.
The inventory is useful review coverage, not a proof over dynamic interfaces.
**Unresolved:** broader explicit codecs versus changing what those routes retain.
Changing retention to a synthetic timestamp-only message would be a semantic
choice, not a serialization cleanup that can be assumed safe.

## 9. Immutable attempts, leases, and publication fences

[Handoff persistence][handoff] separates parse ownership from publication order.
A renewable parse lease protects one computation; token, expiry, generation,
and expected predecessor checks protect acceptance from stale workers.
An immutable object is uploaded before transactional acceptance and enqueue.
Acceptance and finalizer enqueue must commit together, not as independent writes.

A publication lease/fence protects serving writes for the selected attempt.
Generation and publication-token checks belong inside each write transaction,
including intermediate batches, not just at job start or after object download.
A newer accepted head need not invalidate a correctly leased older publication
unless the protocol explicitly says so; publication ordering is its own invariant.

Upload failure, compute failure, lease loss, and uncertain transaction commit
have different cleanup implications. Deleting an uploaded object after an
uncertain acceptance commit can destroy an artifact that was actually accepted.
Retaining such objects is safe for correctness but needs a bounded reconciliation
policy for operational sustainability. Do not confuse accepted-obsolete cleanup
with a complete policy for unaccepted orphans and uncertain commits.

**Proposal:** reuse these protocol lessons only with a fresh, smaller state
machine, explicit failure tests, and current database constraints. Historical
migration numbering and an archived implementation are not a rollout plan.

## 10. Per-log identity catalogue is orthogonal to taxonomy

[Identity catalogue collection][catalogue] records observations and context for
one log. It can expose unresolved identities, conflicting evidence, and ownership
questions without deciding a universal creature classification taxonomy.
Its usefulness does not depend on adopting parser continuation or home offload.

[Evidence retention policy][catalogue-policy] keeps observation counts/context
while bounding detailed evidence. Known routine identities and unresolved history
have different evidence budgets. This is diagnostic retention policy, not proof
that the retained evidence exhaustively explains every classification decision.
**Proposal:** evaluate the catalogue as an independently scoped capability.

## 11. Published output and continuation storage need different schemas

An event stream or finalized encounter report answers what the UI should display.
A continuation artifact must also retain future-affecting parser state, aliases,
ordering buffers, pending timers, partial decisions, and trusted recipes.
The existence of [protobuf output decoding][streams] does not establish a
protobuf continuation schema or conversion parity for the complete graph.

**Deferred proposal, not validated:** investigate a versioned protobuf handoff.
It might reduce representation overhead or improve tooling, but cannot by itself
solve object identity, dependency compatibility, pending work, or taxonomy upkeep.
No benchmark, schema migration, or parity conclusion for that replacement is
established by this archive. Do not describe it as the implemented next step.

## 12. UI epochs are independently reusable

[Stream cache][stream-cache] and [incremental epochs][epochs] address stale async
work after publication/context replacement. Aborting a request alone is not a
proof that a completed response or queued worker result cannot publish later.
An epoch captured when work starts can reject a result after its context changes.

Stream identity, cache invalidation, decoded worker state, and display state need
coordinated invalidation boundaries. A replaced publication must not combine old
stream bytes or aggregation state with a new encounter/metadata view.
This pattern is useful independently of parsernext, JSON graphs, or resumability.
It does not prove that the UI supports live incremental parser continuation.

## 13. Conditions for any future investigation

Begin from the current product and schema, not by restoring this stack wholesale.
Choose one goal: inexpensive offload, diagnostic catalogues, robust publication,
or continuation. State what is deliberately not being solved.
Distinguish published output correctness from continuation correctness in tests.
Measure serialization and transfer costs before asserting home-offload savings.
Resolve dynamic retention policy before claiming broadly reliable graph capture.
Require explicit input framing, dependency compatibility, resource lifecycle,
and orphan reconciliation decisions. Review UI publication races separately.
Any resumption or merge requires a new user decision; these notes grant neither.

## Pinned source index

[baseline]: https://github.com/Emyrk/chronicle/tree/d4fc76ae63203152c5090c5f82b64a7334a4cb45
[archive]: https://github.com/Emyrk/chronicle/tree/f892a9b26cfd46b238fdaa419394cb3cd9afe423
[compute]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/parse_compute.go
[factory]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_parse_factory.go
[producer]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_parse_worker.go
[finalizer]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_finalize.go
[artifact]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_parse_artifact.go
[artifact-tests]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/native_parse_artifact_test.go
[session]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/logparse_complete_session.go
[ownergraph]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/internal/stategraph/ownergraph/registry.go
[methods]: https://github.com/Emyrk/chronicle/commit/eaf37860eb908cb68400750cc209c27fd038c21a
[retention]: https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/period/RETENTION.md
[inventory]: https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/period/testdata/retention_sites.txt
[contracts]: https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/period/retained_cast_contract_test.go
[dynamic]: https://github.com/Emyrk/chronicle/blob/f892a9b26cfd46b238fdaa419394cb3cd9afe423/combatlog/parser/common/characters/dynamic_retention_contract_test.go
[handoff]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/chronicle/parse_handoff.go
[catalogue]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/common/identitycatalog/catalog.go
[catalogue-policy]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/combatlog/parser/common/identitycatalog/README.md
[streams]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/hooks/instanceEvents/streamLoader.ts
[stream-cache]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/hooks/instanceEvents/streamCache.ts
[epochs]: https://github.com/Emyrk/chronicle/blob/d4fc76ae63203152c5090c5f82b64a7334a4cb45/frontend/chronicle/src/pages/Instance/EventsPanels/incrementalEpoch.ts
