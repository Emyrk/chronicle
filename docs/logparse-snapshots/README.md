# Incremental log parsing snapshots

Status: accepted design, implementation inventory still preliminary.

This document set defines an optional snapshot optimization for incomplete, ongoing log groups. A snapshot preserves mutable parser state after one or more complete immutable files have been processed. It lets Chronicle resume from the next file without replaying earlier files.

Snapshotting does not change the authoritative result. Chronicle publishes events, instances, rankings, and cross-log projections only after a terminal complete signal and terminal finalization.

## Documents

- [Parser lifecycle and semantics](parser-lifecycle.md)
- [Path-addressed snapshot store](snapshot-store.md)
- [Preliminary dependency inventory and roadmap](dependency-inventory.md)

## Core contract

The design has four hard boundaries:

1. Chronicle processes input only at complete immutable file boundaries.
2. Chronicle never snapshots in the middle of a file.
3. Reordering never crosses a file boundary. Any reorder buffer must be fully flushed before the file is committed to parser state or a snapshot is valid.
4. A snapshot is optional mutable state, not an authoritative publication.

The central equivalence requirement is:

```text
ProcessFile(A) -> ProcessFile(B) -> Finalize
=
ProcessFile(A) -> Snapshot -> Restore -> ProcessFile(B) -> Finalize
```

Equality is defined under the accepted file-boundary ordering contract. It includes emitted event payloads, finalized instances, rankings, overview data, and every database projection derived from the completed parse.

## Terms

| Term | Meaning |
|---|---|
| Snapshot | Mutable parser state saved after complete files. It may include accumulated event builders. |
| Fingerprint | Compatibility identity used to decide whether a snapshot can be restored. |
| Archive | One logical path-addressed tree containing a snapshot. |
| Finalize | Terminal parser operation that drains open state, produces final results, and prevents more input. |
| Publication | Existing authoritative database writes for events, instances, rankings, and cross-log projections. |
| Logical replacement | Saving a new complete snapshot at the same logical location. |
| Atomic physical replacement | Writing a new physical archive and atomically switching a current pointer or equivalent commit marker. |

A fingerprint is not parser state. It should cover the snapshot schema, parser version, log format, flavor, dataset, registry and rule identity, and relevant parse options. A strict mismatch may discard the snapshot and rebuild from all files. Initial versions do not require migrations.

## High-level flow

```text
incomplete log group
  |
  +-> load compatible snapshot, or start fresh
  |
  +-> process every newly available complete file in order
  |     flush file-local reorder state at every boundary
  |
  +-> save one complete updated snapshot
  |
  +-> wait for more files

terminal complete signal
  |
  +-> load compatible snapshot, or parse all files from the beginning
  |
  +-> process remaining complete files
  |
  +-> Finalize exactly once
  |
  +-> persist existing authoritative outputs
  |
  +-> reject later appends
```

Any snapshot load, compatibility, validation, or save failure may fall back to waiting for all files and parsing from the beginning. Crash recovery is not a goal.

## Non-goals

- Crash recovery or guaranteed snapshot durability.
- Mid-file checkpoints.
- Mutable or partially uploaded input files.
- Reordering messages across file boundaries.
- An event segment storage system.
- Publishing partial instances, events, rankings, or cross-log projections.
- Snapshot schema migration in the initial implementation.
- Lazy or per-instance restore in the initial implementation.
- Making every in-memory field part of the semantic archive. Derived and runtime-only state should be reconstructed explicitly.

## Future direction

The initial design restores one logical archive eagerly. Stable subtree paths should still preserve the option to shard or lazily load per-instance state later. The generic store could also represent unrelated typed trees, for example `/rankings/dps/mage/frost`, but this proposal does not require those uses.

## Unresolved questions

- What exact signal marks a file immutable and complete for every upload path?
- What stable file identity and ordering key should the snapshot record to detect replacement, gaps, or mutation?
- Which parser and registry build identifiers belong in the fingerprint?
- Which existing debug parse features should emit snapshot audit logs and diffs first?
- Where should physical archives and the atomic current pointer live for each storage backend?
- Which runtime dependencies must be supplied during restore, and which need explicit fingerprint entries?
