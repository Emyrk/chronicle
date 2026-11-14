# Session composition status

This is a review checkpoint, not a full-session snapshot contract. Owner-local
state codecs and bounded graph tests do not establish production-session resume.

## Implemented building blocks

- `internal/stategraph/ownergraph` explicitly registers owner codecs, interns
  shared pointers, allocates all objects before loading, resolves references, and
  validates the restored graph. Its generated owner IDs are internal references,
  not stable semantic identities across independent snapshots.
- `parser/common/characters/graph.go` composes the bounded character graph with
  units, identifiers, periods, retained messages, rooms, and shared references.
  `parser/vanilla/creatures/graph.go` supplies the bounded Nefarian adapter.
  Character runtime wiring is a separate operation after semantic restoration.
- `parser/common/instances.EncounterRankingGraph` is a bounded downstream
  component root connecting in-progress event buffers, optional finalized event
  bytes, and DPS tracking. Leaf adapters reuse the existing owner codecs and
  share canonical Damage, Units, and Identifier references. Disk JSON roundtrip
  tests restore fresh independent objects and compare suffix processing, eager
  bytes, and ranking output. This is not a Hookable or full-session checkpoint.
  Callers register trusted dependency codecs explicitly and quiesce the owners
  together; missing registrations or malformed references fail closed. Static
  Identifier configuration uses its existing trusted recipe, once per canonical
  owner. No gameplay or hook registration is performed by these adapters.
- `parser/common/instances.EncounterComponentGraph` connects that event/DPS
  component to shared Units, aura tracking/projection, vehicles, raid groups,
  participants, armory, and consume evidence tracking/collection. It validates
  required canonical aliases at capture and restore. Restored observers and
  emitters remain absent until a separate, once-only `WireGraphRuntime` call.
  Disk roundtrip and suffix tests cover shared spell identity, detached armory
  history, independent restores, and aura/consume output equivalence.
  **Current configuration limit:** graph adapters reject non-nil aura duration
  modifiers and consumable catalogs at registration and capture. Their existing
  leaf codecs rely on a compatible session fingerprint, which this component
  does not yet supply. Do not disable production configuration to work around
  this restriction. Full-session compatibility binding must precede support.
- Owner-local state APIs also exist for auras, vehicles, raid groups, armory,
  encounter event builders, telemetry, participants, consumables, overview,
  overhealing, phases, rankings, and numerous creature implementations. Their
  presence does not mean that all these objects are registered in one graph.
- Vanilla `parser/vanilla/nextsource` retains decoding and synthetic state across
  complete files and has source-pipeline snapshot tests. Those snapshots do not
  include the downstream consumer graph.
- Native TBC/Wrath `parser/wotlk.NewNextPipeline` retains its decoder and synthetic
  composition across serial `OpenFile` calls. `NewNext` remains the single-reader
  compatibility constructor. This pipeline has no snapshot API or consumer
  ownership; it does not enable multiple files in the production worker.

Paths above are relative to `combatlog/`, except `internal/stategraph/ownergraph`.

## Lifecycle boundaries

`chronicle/logparse_parse.go:newParseState` constructs the encounter and consumer
graph. `Consumers.ConsumeAll` drives messages through those existing consumers.
A clean file EOF is not encounter finalization. `WorkerLogParse.work` finalizes
instance hooks separately, then performs authoritative publication.

The Vanilla complete-file session is tooling-only. Its fatal source or consumer
failure invalidates the session. Consumers may already have mutated provisional
state; failure does not promise rollback. The caller must discard that graph or
explicitly restore a prior supported snapshot.

The native source's cancellation check happens before reading a record, so a
caller can retry that active source with a valid context. This lower-level retry
contract is distinct from a consumer session's invalidation policy. Fatal source
and synthetic failures are terminal; they must propagate through the consumer
loop rather than being logged and retried or accepted as clean EOF.

## Strict compatibility infrastructure

The approved compatibility identity is dataset UUID + positive monotonic dataset
revision + exact `chronicled` executable identity + explicit format/flavor.
`nextsource` source snapshots now use version 2 and require this identity to be
bound at pipeline construction. Old snapshots and mismatched identities are
rejected before restoration. Ordinary parsing without snapshots remains allowed.
The shared identity value lives in this package; it does not obtain database or
runtime dependencies itself.

`internal/version.BinaryIdentity` hashes the running Linux executable through
`/proc/self/exe`, once per process. This distinguishes dirty builds and build-tag
changes that a release label or short Git commit cannot. Missing executable
access or unsupported platforms fail closed, without a display-version fallback.

The accepted lifecycle is **Input → Parse → optional Snapshot → explicit
Finalize/publication**. Parsing performs no database writes. Each explicit
Finalize may publish a successfully parsed complete-file prefix, which remains
viewable while later linked files are processed. Do not redesign this as whole-log
atomic publication or hide an earlier finalized prefix pending all later files.
A snapshot is optional transferable state, including for a headless thin daemon;
it is not a prerequisite for publication. EOF remains distinct from Finalize.

A checkpoint identifies a successfully parsed ordered prefix. Resume must verify
that prefix and allow only append-only continuation; a changed, removed, or
reordered earlier file requires parsing again from the first file. Storage append
chunks must not be assumed to be complete input files. Re-resolve dataset/flavor
at acceptance boundaries: changed dataset selection, dataset revision, flavor,
or executable identity likewise requires restart from the first file.

Revision SQL, isolated parse-local GameDB acquisition, and transaction-owned
revision fences must be connected to orchestration, not decoder processing.
Fences protect each publication transaction without promising rollback of
previous successful Finalize publications. Configured graph restoration remains
disabled until fully bound orchestration exists.

## Runtime integration and prefix-manifest limits

The production worker now uses an authoritative transaction-bound resolver,
fresh parse-local game-data caches, and construction-bound compatibility.
Resolution locks contributing realm, server, tenant, and dataset rows. Identity
is checked after dependency acquisition and parsing, and inside each publication
transaction alongside the existing parse-generation fence. This does not make
separate Finalize/publication commits one atomic whole-log transaction.

Strict attempts preserve `wow_log_groups.flavor` as input instead of replacing
it with resolved defaults or tenant additions. A retry with empty input therefore
re-resolves current defaults. Historical nonempty values remain treated as
explicit input because their provenance cannot be reconstructed safely. Views
that only expose the input field may show empty/unaugmented flavor; effective
flavor remains in the parse context/report and ranking computations. Legacy and
offline callers without the production resolver retain their previous behavior.
Unexpected realm lookup errors fail rather than silently selecting Unknown;
Unknown fallback requires its existing database row. A strict publication cannot
switch to a different realm than the one used to resolve its dependencies.

`chronicle.BuildLogparsePrefixManifest` and `ValidateLogparsePrefix` are pure
metadata helpers, not wired checkpoint/resume processing. They require one
consistent database view containing the base, safe-ready parts, and all finalized
parts. The base row's sizes are aggregate totals, so all finalized sizes must be
subtracted to recover the stable base size, including finalized parts hidden
behind a pending upload. Only safe-ready parts become accepted input. The helper
trusts recorded hashes and does not download or verify object bytes. Sparse source
sequences remain valid; storage-part boundaries are not parser-file boundaries.

## Still required for full-session resume

See [instance wiring checklist](INSTANCE_WIRING.md) for the existing hook order,
runtime callback dependencies, and remaining aggregate fields. Component restore
must not be mistaken for a process-safe `Hookable` restore.

1. Graph adapters and an explicit composition root for `encounters.State`,
   `instances.Hookable`, the consumer set, optional identity collection, and
   their shared parse-wide state. Reuse owner-local codecs rather than flattening
   or duplicating their state.
2. Registration of every concrete character type reachable under a supported
   trusted factory recipe. The declarative state catalog is not codec coverage.
   Unsupported concrete owners must fail closed.
3. Composition of decoder/synthetic state and downstream owners with a common
   reference context wherever they share mutable objects. Separate snapshots
   must not silently clone a shared Damage or other mutable reference.
4. Native and modern format snapshot coverage, plus modern/AzerothCore
   complete-file pipeline lifecycles. Reordering is explicitly file-local: drain
   the V22 buffer at EOF and create a fresh buffer for the next file. Do not
   reorder across file boundaries, even if timestamps overlap. Validate resume
   against uninterrupted processing with the same file boundaries, not against
   concatenated input that permits cross-boundary reordering.
5. Explicit fresh-runtime dependency injection and hook wiring after all semantic
   owners are restored. Restore must not replay factories, process gameplay,
   register external observers, query services, finalize, or publish.
6. Session-level compatibility checks, successful-file progress, and terminal
   lifecycle handling. No production resume or queued replacement is enabled.

## Review and validation gate

Before the first full-session real-log resume comparison, review the concrete
root, supported-owner inventory, identity links, restore/wiring phases, and
failure policy together. Deterministic tests should first establish:

- fresh-object restoration and isolation between independent restores;
- canonical aliases and cycles, including retained mutable Damage references;
- detached historical observations and preservation of already-encoded bytes;
- uninterrupted versus split-file processing with stateful synthetic events;
- source/consumer failure invalidation without an implicit rollback promise;
- no restore-time gameplay, finalization, external callbacks, or publication.

Keep strict corpus comparisons separate from semantic diagnostics. Existing
format parity evidence is not evidence of full-session resume. Production keeps
legacy routing until a separately reviewed opt-in replacement is implemented.
