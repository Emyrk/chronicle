# Parser lifecycle and semantics

Incremental parsing operates on complete immutable files. A file boundary is both an input commit boundary and a reorder boundary.

## Parser API concepts

The final parser-facing API should express these concepts, without requiring these exact Go signatures:

| Operation | Semantics |
|---|---|
| `ProcessFile` | Consume one complete immutable file. Flush all file-local parser and reorder output before returning success. Reject calls after terminal finalization. |
| `Snapshot` | Optionally encode current non-terminal mutable state after a successful file boundary. It may include accumulated event builders. |
| `Restore` | Reconstruct mutable state from a compatible archive plus runtime dependencies. |
| `Finalize` | Terminal cleanup and result construction. Prevent all later appends and repeated finalization. |

`Snapshot` is not a terminal operation. It must not run terminal cleanup, drain fights using artificial end-of-log time, finalize event builders, or produce authoritative database rows.

`Finalize` is terminal. Current `instances.Hookable.Finalize` drains open fights, finalizes hooks, builds ranking results, computes overview data, and returns a `FinalizedInstance`. The incremental API must preserve this distinction.

## Execution boundary and dependencies

Parser construction must declare every dependency at the initial callsite. Components must not discover database handles, global registries, callbacks, or write services through hidden package state.

Conceptually, dependencies fall into three classes:

| Class | Examples | Headless processing |
|---|---|---|
| Read dependencies | Read-only game database, spells, gear, duration modifiers, consumable catalog | Allowed |
| Runtime dependencies | Context, logger, registry, parser configuration | Allowed when declared explicitly |
| Write dependencies | Parsed-log tables, rankings, memberships, publication transactions | Forbidden |

A headless processor may use read-only database access for spell and game data. Parser construction must accept narrow read-only interfaces or an equivalent capability-restricted adapter, not a broad database handle that happens to be used only for reads. Publication stores and transaction handles must be unavailable to the headless process. Connection details are runtime configuration and do not belong in the snapshot fingerprint. Dataset identity, parser rules, and other compatibility-relevant semantics do.

The intended separation is:

```text
headless processor
  -> construct parser with explicit read-only dependencies
  -> ProcessFile for available immutable files
  -> produce portable snapshot

primary daemon
  -> validate snapshot and fingerprint
  -> restore with matching explicit dependencies
  -> Finalize
  -> publish authoritative database output
```

`Finalize` belongs to parser semantics and should construct final in-memory results. Database publication remains a separate daemon responsibility. A parser running in headless processing mode must have no capability to mutate authoritative Chronicle state.

## File boundary rules

Before `ProcessFile` returns success:

- The entire file has been consumed.
- All parser messages produced by the file have reached all consumers.
- The reorder buffer is empty.
- Parser, scanner, and message-source lookahead for the file is exhausted.
- No message from the next file has been observed.
- The processed-file manifest can advance atomically with parser state.

The current V22 path wraps a parser in `reorder.Processor`, whose EOF behavior flushes buffered messages. Incremental parsing should create or reset file-local reorder state per file. It must never carry the reorder heap, ordinal, watermark, or EOF state into the next file.

If a format needs lookahead beyond EOF to interpret a file, it does not satisfy this design until it defines an explicit file-local completion rule. Cross-file lookahead and reordering are forbidden.

## Lifecycle state machine

```text
Fresh
  | ProcessFile
  v
OpenAtBoundary <-------- Restore compatible snapshot
  |     |
  |     +-- Snapshot --> OpenAtBoundary
  |
  +-- ProcessFile ------> OpenAtBoundary
  |
  +-- Finalize ---------> Finalized

Finalized
  +-- ProcessFile, Snapshot, Restore, or Finalize again --> error
```

`OpenAtBoundary` means no file is partially consumed and no reorder state is pending.

## Incomplete workflow

For an incomplete log group:

1. List complete immutable files in authoritative order.
2. Try to load the current snapshot.
3. Verify its fingerprint and processed-file prefix.
4. If restore fails, discard the snapshot and start fresh.
5. Process each newly available complete file with `ProcessFile`.
6. Save one complete updated snapshot after all currently available files succeed.
7. Wait for more files.

Do not save one snapshot per newly observed file unless operational evidence later requires it. One save after the available batch reduces write amplification and still preserves file-boundary semantics.

A snapshot save failure does not invalidate successfully parsed in-memory state, but the incomplete workflow may simply wait and try again later. It must not publish partial authoritative outputs.

## Terminal workflow

On the terminal complete signal:

1. Reject any future append or replacement for that completed input generation.
2. Load a compatible snapshot, or start a full reparse from the first file.
3. Process all complete files not covered by the restored prefix.
4. Call `Finalize` exactly once.
5. Persist the existing authoritative outputs, rankings, and cross-log projections.
6. Mark the parse generation finalized using the existing publication fencing.
7. Delete or retire the optional snapshot as best-effort cleanup.

The current worker stages a parse generation before parsing, finalizes each `instances.Hookable`, inserts instance data and event streams, writes rankings in their existing transactions, and calls `finalizeParseGeneration`. The implementation should reuse this publication path rather than inventing partial snapshot publication.

## Failure and fallback

Snapshotting is an optimization. The allowed response to any snapshot problem is to discard the snapshot and parse complete files from the beginning. An incomplete workflow may immediately rebuild from all currently available files, or it may wait for the terminal signal and perform one final full parse.

Fallback applies to:

- missing or unreadable archives
- fingerprint mismatch
- unknown type or version
- decode, resolve, or validation failure
- missing reference target
- input prefix mismatch
- invalid graph or lifecycle state
- atomic pointer or storage failure

Crash recovery is not a goal. The system does not promise to resume from the last snapshot after process or host failure.

## Mutable state versus publication

Snapshots may contain any mutable state required for equivalence, including:

- parse-wide trackers
- current zone, realm, and version context
- discovered instance objects and open fight state
- consumer and hook state
- accumulated encounter event builders
- completed but not yet published encounter state
- ranking and overview trackers
- synthetic processor state

This proposal does not split event output into immutable event segments. Existing event builders may remain accumulated inside the snapshot until terminal finalization. Physical archive replacement prevents a partial new snapshot from replacing the previous complete one.

No snapshot record is authoritative user-visible output. Database events, instances, rankings, parse reports, and cross-log projections remain products of terminal finalization and the existing database publication flow.

## Equivalence tests

Tests should compare continuous and resumed parses at multiple file boundaries.

For each fixture split into files `A`, `B`, and optionally `C`:

1. Parse all files continuously, then finalize.
2. Parse `A`, snapshot, restore, parse the rest, then finalize.
3. Parse `A+B`, snapshot, restore, parse `C`, then finalize.
4. Compare semantic outputs.

Comparison must cover:

- event stream bytes or decoded event sequences
- encounter boundaries and identifiers
- instances and persisted metadata
- participants, guilds, loot, vehicles, raid groups, and consumes
- ranking inputs and final ranking results
- overview metrics
- synthetic events and derived state
- final database projection parameters

Additional tests should verify:

- snapshot attempts are rejected mid-file
- reorder state is empty at every snapshot boundary
- same-timestamp ordering does not cross a file boundary
- incompatible fingerprints trigger full reparse
- corrupted archives trigger full reparse
- a finalized parser rejects appends and repeated finalization
- stable paths and record ordering are deterministic
- two references restore to the same canonical runtime object
- ownership and reference conflicts fail restore
- debug metadata does not change semantic results

## Observability

Track optimization behavior separately from parse correctness:

- snapshot load, save, discard, and fallback counts
- bytes and node counts
- encode and restore duration
- processed files skipped by restore
- incompatibility reason
- validation failure category
- full-reparse fallback count

Do not report snapshot presence as completion or durability.

## Unresolved lifecycle questions

- Should incomplete parsing run in the existing River job or a separate coordinator that wakes on new complete files?
- How is the terminal complete signal fenced against an append racing with finalization?
- What file manifest fields prove a prefix is unchanged?
- Should terminal cleanup remove the current pointer immediately or retain the final snapshot briefly for debugging?
- How should parse timing reports distinguish replayed files, restored state, and newly processed files?
