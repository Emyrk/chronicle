# Session composition status

The durable `chronicle.CompleteFileSession` facade and its production owner graph
are implemented. This remains a review checkpoint, not a claim of production
rollout or real-corpus full-session validation. See the
[complete-file session contract](../../../docs/logparse-snapshots/complete-file-session.md)
for construction, exact integration coverage, and checkpoint durability behavior.

## Revised input and serialization API

`ProcessFiles(ctx, []FileBundle)` accepts explicitly caller-associated complete
logical files plus ordered artifacts. It never queries storage, infers group/part
association, or applies new safe-ready filters. Envelope v2 retains completed
bundle metadata as authoritative provenance, not a historical availability gate. Native 3.3.5a merges Sidekick
through the existing inserter and drains its tail before advancing the prefix;
consumer-retained references remain in the shared graph. Mid-bundle checkpoints
are forbidden. Missing-artifact policy remains pending explicit user direction.

`Snapshot(io.Writer)` only serializes and never closes, compresses, flushes, or
commits the caller's destination. Successful serialization is not a durable-store
acknowledgment. `SnapshotPath(path)` is the separate local atomic-file helper with
pre-rename preservation and typed post-rename durability uncertainty. Restoring
from an `io.Reader` supports caller-owned decompression, including gzip.

## Implemented composition

- `internal/stategraph/ownergraph` explicitly registers owner codecs, interns
  shared pointers, allocates all objects before loading, resolves references, and
  validates the restored graph. Generated owner IDs are internal references, not
  stable semantic identities across independently captured snapshots.
- `chronicle/logparse_checkpoint_graph.go` supplies the full session root: retained
  source, ordered consumers, `encounters.State`, optional identity collection,
  capabilities, and line count. All use one reference context. The identity
  collector intentionally retains its own Units owner, separate from encounters.
- `parser/common/registry/graph.go` prepares the actual registered production
  factories and registers their explicit owner closure. `encounters.State` and
  `instances.Hookable` have aggregate graph codecs, including current/completed
  fights, derived names/rankings, phase and ranking state, realm/header metadata,
  and shared parse-wide trackers. Unsupported opaque recipes fail closed.
- Character/period and Vanilla/TBC/Wrath creature codecs preserve canonical
  references, retained messages, rooms, wrapper owners, and custom periods.
  Named factory recipes preserve production ordering. Typed preprocessors and
  AzerothCore hooks have explicit recipes rather than archive-selected functions.
- Aura duration modifiers, consumable catalogs, and prepared effective spells are
  supported with explicit compatibility-bound dependencies. They are not disabled
  to obtain snapshot support. Callers preload and retain compatible dependencies;
  semantic restoration does not query services or execute gameplay factories.
- Event/DPS and shared-tracker component roots remain useful focused test fixtures,
  but are no longer the only supported graph roots. Component tests alone still
  do not establish full-session correctness.

Paths above are repository-relative for `chronicle/` and `internal/`; `parser/`
paths are relative to `combatlog/`.

## Source and validation coverage

The complete-file facade admits Vanilla CC (`1.12a-cc-addon`), native TBC/Wrath
companion formats, modern V9/V22/Hermes, and AzerothCore mod sources. Each has a
retained pipeline and graph adapter. Source and registry adapter tests exist;
native pipelines are no longer limited to snapshot-free construction.

Vanilla and expansion deterministic session fixtures exercise disk continuation
with production encounter recipes and identity collection on/off. Refer to the
session contract for the exact matrix, rather than assuming all admitted tag
combinations or encounter mechanics have been exercised. AzerothCore session
implementation includes the approved full unknown-zone fallback and known-zone
server classification. Its original 16 deterministic full-session scenarios have
passed; the expanded matrix has 24 scenarios including canonical AzerothCore
Wrath. The expansion matrix now has 30 wire/flavor tuples with identity collection
off/on, or 60 scenarios, including AzerothCore and Epoch flavor coverage. The
Epoch fixture checks the Onyxia entry 45133 boss/name selector. The expanded matrices passed targeted race validation in Chronicle.

V22 reordering is file-local: drain at EOF, then start a fresh reorder buffer for
the next file. Compare resumed and uninterrupted runs with identical file
boundaries, never with concatenated input permitting cross-file reordering.

SuperWoW (`1.12a-superwow-addon`) is intentionally retired from the complete-file
facade, not pending source coverage. Lower-level historical adapters do not
change that admission policy.

## Lifecycle boundaries

`chronicle/logparse_parse.go:newParseState` constructs the encounter and consumer
graph. `Consumers.ConsumeAll` drives messages through those existing consumers.
A clean file EOF is not encounter finalization. `WorkerLogParse.work` finalizes
instance hooks separately, then performs authoritative publication.

The complete-file facade is not selected by the production worker. Its fatal
source or consumer failure invalidates the session. Consumers may already have mutated provisional
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

For continued prefix publication, serialize the in-flight **pre-Finalize**
checkpoint to disk or a database first; fights may remain open. Restore that
persisted checkpoint either to consume later complete files or to Finalize
immediately before authoritative output publication. Discard the terminal
finalized instance. Do not add a `.Clone()` or in-memory detached-copy Finalize
path. Only in-flight parser checkpoints are serializable/resumable parser state;
finalized output is never a checkpoint. An ordinary terminal parse may still
Finalize without taking a checkpoint when no continuation is required.

A checkpoint is authoritative for its successfully processed history. Resume takes
only explicitly ordered future bundles and never looks up, revalidates, or reloads
historical files/artifacts. Historical additions, changes, or deletions are ignored;
incorporating them requires an explicit fresh parse. Saved file/artifact IDs prevent
silent replay, without checking historical availability. Cumulative provenance is
separate from the future cursor, which starts at zero on each restore. An empty
suffix can restore and Finalize immediately. Storage append chunks must not be
assumed to be complete input files. Re-resolve dataset/flavor
at acceptance boundaries: changed dataset selection, dataset revision, flavor,
or executable identity likewise requires restart from the first file.

Revision SQL, isolated parse-local GameDB acquisition, and transaction-owned
revision fences must be connected to orchestration, not decoder processing.
Fences protect each publication transaction without promising rollback of
previous successful Finalize publications. The facade accepts preloaded,
compatibility-bound configured graphs; connecting checkpoint/resume orchestration
to production publication remains separate work.

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
metadata helpers for the separate worker utility, not a gate on authoritative
checkpoint continuation. They require one
consistent database view containing the base, safe-ready parts, and all finalized
parts. The base row's sizes are aggregate totals, so all finalized sizes must be
subtracted to recover the stable base size, including finalized parts hidden
behind a pending upload. Only safe-ready parts become accepted input. The helper
trusts recorded hashes and does not download or verify object bytes. Sparse source
sequences remain valid; storage-part boundaries are not parser-file boundaries.

## Remaining integration and review work

See the [instance wiring contract](INSTANCE_WIRING.md) for hook order, callback
ownership, and aggregate coverage. Semantic restoration and runtime attachment
are separate phases. `CompleteFileSession.WireRuntime` preflights dependencies
before attachment; restored graphs cannot process input before wiring.

The facade validates a strict checkpoint envelope, exact runtime compatibility,
and future-input replay protection before restoring owners. Completed descriptors
are provenance only. Successful whole-bundle EOF advances progress;
source/consumer failures invalidate the session without rollback. Checkpoint
replacement uses a synchronized temporary file and atomic rename. A post-rename
directory-sync failure reports uncertain durability, not successful publication
or rollback. Terminal Finalize forbids later processing or snapshots of that live
graph; prior persisted checkpoints remain independently resumable.

Independent review of the expanded facade and deterministic matrices, including
AzerothCore known zones, unknown-zone fallback, and identity collection, found no
remaining concrete blockers. The integrated affected-package race suite passed.
This does not replace the real-corpus and production integration gates below.

Still required:

1. Jointly review the concrete root, supported-owner inventory, aliases, runtime
   wiring, and failure policy before the first real-corpus full-session comparison.
2. Run separately approved real-corpus resume comparisons. Synthetic integration
   coverage and existing format parity are not substitutes.
3. Separately design and review production checkpoint storage/acceptance,
   database publication, River selection, and UI exposure. None is selected by
   this facade, and no queued production replacement is enabled.

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
