# Complete-file session facade

`chronicle.CompleteFileSession` is a plain, serial-use parsing object. It does not
select a River worker, download input, publish database results, or expose a UI.
Its checkpoint is one ownergraph rooted in the actual retained native source,
ordered consumers, production encounter registry state, and optional identity
collector. It does not finalize a detached clone.

## Construction and continuation

The caller supplies `CompleteSessionOptions`, including resolved compatibility,
ordered immutable future `CompleteBundle` descriptors in `Bundles`, logger, game-data and gear
resolvers, the runtime registry, `registry.PreparedGraph`, and preloaded effective
spells. Prepare these dependencies using the same dataset revision, executable,
wire format, flavor, override policy, and registry recipe identity. Keep them
immutable for the lifetime of the session. The facade does not infer flavor from
wire headers.

For ordinary supported formats, prepare encounters with
`registry.Registry.PrepareGraph(format, modifiers, catalog, spells)`. For
`azerothcore-mod`, use
`azerothcore/encounters.PrepareGraph(registry, modifiers, catalog, spells)` instead.
The typed AzerothCore adapter supplies server-classification and unknown-zone
fallback recipes; direct `Registry.PrepareGraph` intentionally rejects that format.

1. Bind `parsectx` and `snapshot.Compatibility` to the construction context.
2. Call `NewCompleteFileSession(ctx, options)`.
3. Call `ProcessFiles(ctx, []FileBundle{...})` with each complete decompressed
   logical file and its explicitly associated ordered artifact readers. `FileBundle`
   supplies `File`, `Input`, and `Artifacts`; each `BundleArtifactInput` supplies
   its immutable `Artifact` descriptor and `Input`. Size and SHA256 must match
   consumed bytes. The facade does not close any input reader.
   `Files`/`ProcessFile` remain artifact-free convenience forms; do not set both
   `Files` and `Bundles`.
4. After successful whole-bundle EOF, optionally call `Snapshot(writer)` to serialize a checkpoint,
   or `SnapshotPath(path)` for the explicit atomic local-file helper. EOF is not
   terminal finalization.
5. Restore with `RestoreCompleteFileSession` or `RestoreCompleteFileSessionPath`.
   Supply only future bundle descriptors in the options, not the old prefix.
   Restore validates exact compatibility, the checkpoint's internal structure,
   and future replay protection before registering dependencies. It never looks
   up, revalidates, or reloads already processed files or artifacts.
6. Call `WireRuntime(ctx)` separately. Runtime preflight precedes attachment; no
   gameplay or dependency queries are performed during restore/wiring.
7. Continue with the suffix or call terminal `Finalize(ctx)`. Finalization closes
   that live graph to processing and snapshots. Previously saved checkpoints stay
   independently resumable.

A failed operation invalidates its session. Recover with a fresh restore or a
fresh complete parse, not by continuing partially mutated state.

## Authoritative checkpoints and suffix-only continuation

Restore options are always an explicit ordered suffix. There is no inference
between a complete manifest and a suffix, and no index derived from the number
of historical bundles is applied to that suffix. For example, after checkpoint A,
delete A and its artifacts, restore with descriptors for B only, wire runtime, and
supply B. An empty suffix is valid for immediate Finalize or reserialization.

The checkpoint stores cumulative completed provenance separately from the next
future-input cursor. A checkpoint after B contains A+B provenance; a fresh restore
with C-only starts its future cursor at zero. Exact executable, dataset revision,
format, flavor, and policy compatibility remain mandatory. Future bytes and
ordered descriptors are checked normally while processing.

To prevent silent replay, future file IDs cannot already appear in checkpoint
provenance. The existing globally unique artifact-ID contract also applies across
the checkpoint boundary. These are saved-metadata-only checks, not comparisons to
current historical contents or availability. Callers must use stable identities;
renaming an old input to evade replay protection is not supported.

## Artifact association and whole-bundle boundaries

Association is caller-owned. Each bundle is one complete logical file and the
ordered artifacts the caller explicitly associates with it. The facade never
queries storage, derives association from timestamps, applies safe-ready filters,
or treats append storage parts as complete files. The existing worker currently
requires one logical log per group and assembles its base/parts before parsing;
this API does not change that worker's selection policy.

Artifact descriptors contain ID, kind, schema version, byte size, and SHA256.
The current supported artifact kind is `sidekick-storage`, schemas 1, 2, and 3,
with the decoder's existing 8 MiB bound. File IDs and artifact IDs must each be
unique across their respective namespace. Checkpoint envelope version 2 records
the complete ordered history as provenance, including artifact metadata.
The checkpoint is authoritative for that history: old files/artifacts may be
changed, added, removed, or deleted without affecting continuation. Incorporating
those changes requires an explicit fresh parse, never an automatic replay.
Version 1 envelopes are explicitly rejected.

Only native 3.3.5a CC merges Sidekick messages, matching the worker. Artifacts are
decoded sequentially and merged with the existing `messagesource.Inserter`:
original log messages win timestamp ties; each source's order/regressions remain
unchanged; the artifact tail drains after native EOF. Other source families
verify declared artifact bytes but do not inject Sidekick gameplay messages.
This content/descriptor verification is additional validation for the facade's
immutable-input contract: the existing worker ignores those artifacts entirely.
A supplied non-3.3.5a artifact with a bad hash/read fails here even though that
worker branch would ignore it. No claim of identical error behavior is made.
Sidekick observations add resource/position capabilities, never native line counts.
Capabilities accumulated by earlier bundles survive artifact-free suffix bundles.

Checkpoint eligibility advances only after merged EOF and all content checks.
The decoder/inserter cursors are exhausted at that point and are not resumable
mid-bundle. Messages retained by consumers remain part of the shared ownergraph.
Artifact decode/schema/hash/read failures are terminal, not logged and ignored by
the generic nonfatal parser-error loop. Missing artifacts behind a checkpoint are irrelevant: no availability check
occurs. Missing-artifact policy for future supplied input remains a separate
pending decision; no missing/skip descriptor is currently defined.

## Wire admission and coverage

The facade admits these source families, subject to the prepared production
registry's exact format/flavor validation:

| Wire format | Retained source |
| --- | --- |
| `1.12a-cc-addon` | Vanilla `nextsource.Pipeline` |
| `2.4.3-cc-addon`, `3.3.5a-cc-addon` | `wotlk.NextPipeline`, selecting the native wire decoder |
| `v9-cleu`, `v22-cleu`, `hermesproxy_1_14_2_cc` | `modern.NextPipeline` |
| `azerothcore-mod` | `azerothcore.NextPipeline` with server-classification encounter recipes |

AzerothCore uses the complete production registry and its fixed, code-defined
unknown-zone fallback. Fallback state preserves observed zone metadata; archived
data does not supply executable matching logic or choose arbitrary recipes.
Known-zone server classifications and fallback classifiers share the canonical
encounter units. The optional identity collector keeps its separate units owner.

**Intentionally excluded:** `1.12a-superwow-addon` is obsolete and outside this
facade's supported scope, not an unfinished source requirement.

The deterministic expansion integration matrix is:

| Wire | Tested exact flavor sets |
| --- | --- |
| Native 2.4.3 | TBC |
| Native 3.3.5a | Wrath; Wrath + AzerothCore progression; Wrath + ChromieCraft; canonical AzerothCore (Wrath + AzerothCore); canonical Epoch (Wrath + Epoch) |
| Each of V9, V22, Hermes | Vanilla; TBC; Wrath; Wrath + AzerothCore progression; Wrath + ChromieCraft; Vanilla + WoW Forever; canonical AzerothCore; canonical Epoch |

These are 30 wire/flavor combinations, each tested with identity collection off
and on. The fixtures use production Molten Core, Karazhan, Obsidian Sanctum, and
progression and Epoch Onyxia encounter recipes, not reduced test-only instance roots.
All branches use the same complete-file boundaries. Comparisons cover full
finalized instance structures, every finalized protobuf event stream, identity
collector state, capabilities, and line counts. Only generated encounter/phase
IDs are normalized. Native/Hermes fixtures seed their supported source clock
input to avoid depending on the current year.

Tests additionally cover independent double disk restore, zero aura observers
before wiring, no-query restore/wiring, restored re-checkpointing, original
finalization followed by disk resume, future replay/fingerprint rejection,
reader/content failures preserving prior checkpoints, and terminal lifecycle.
V22 fixtures reverse records within both files and overlap their timestamp ranges.
A separate actual-consumer ordering probe verifies `[2s, 3s]` followed by
`[2.5s, 4s]`, rather than sorting across the file boundary.

The AzerothCore full-session matrix covers explicit Vanilla, explicit Wrath, and
the actual `ServerFlavor("azerothcore", Wrath)` mapping (Wrath + AzerothCore).
Each runs known/unknown-zone histories, identity collection off/on, and checkpoints
after either of two files: 24 cases. It compares both suffix continuation and
immediate terminal Finalize against fresh uninterrupted parses, including event
streams. Unknown-zone fixtures use distinct server instance IDs and preserve each
zone's observed map/name metadata. `CHRONICLE_UNIT_COMBAT` supplies authoritative
combat entry, rather than relying on ordinary damage to start server-side combat.

The registry admits additional combinations of known flavor tags. The matrix
above is the exact integration coverage, not an assertion that every arbitrary
tag combination or every encounter mechanic has been exercised. No real corpus,
River/UI integration, database publication, or whole-goal completion is claimed.

## Snapshot writer ownership

`Snapshot(io.Writer)` serializes a bounded, strict, versioned JSON checkpoint.
It does not compress, flush, close the writer, or commit storage. The caller owns
all of those operations. For gzip, pass a `gzip.Writer` to `Snapshot`, then close
that gzip writer yourself. Restore symmetrically accepts the decompressed reader,
such as a caller-created `gzip.Reader`.

Successful serialization leaves the session usable and acknowledges only that
bytes were written, not that a durable checkpoint was committed. A caller can
choose not to snapshot at all, or discard successfully serialized bytes and keep
processing. Serialization/write failures, including short writes, preserve the
existing session-invalidation policy. Snapshot never closes the writer on either
success or failure.

## Checkpoint replacement result

`SnapshotPath(path)` explicitly performs local-file persistence. Replacement uses
a sibling temporary file, file synchronization, atomic rename, then directory
synchronization. This assumes local Unix-style rename and fsync semantics; callers
must serialize publishers targeting the same path.

Pre-rename failures preserve previous checkpoint bytes. If directory sync fails
after rename, `SnapshotPath` returns `*CheckpointDurabilityError`. The new replacement
is visible, but its crash durability is unknown. Inspect and verify the path,
choose a recovery action, and restore into a fresh session. No rollback is
attempted and no durable-success claim is made for that outcome.
