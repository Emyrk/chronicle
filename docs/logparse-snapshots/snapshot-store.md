# Path-addressed snapshot store

The snapshot store is a generic typed archive. It is not a parser-specific serializer. Parser components register typed codecs and write a logical tree rooted at `/root`.

A likely external location is:

```text
snapshots/log-groups/<log-id>/parse
```

That external key identifies the logical snapshot. The archive itself uses absolute internal paths such as `/root/parse-state`, `/root/shared/units`, and `/root/instances/0003/events/damage`.

## Archive records

Every record has:

- an absolute, normalized path
- one node kind
- a type identifier and version when required by the node kind
- kind-specific payload
- optional `json.RawMessage` debug metadata

Debug metadata is non-semantic. Restore correctness must not depend on its presence or contents.

### Node kinds

| Kind | Purpose | Required data | Constraints |
|---|---|---|---|
| Directory | Structural namespace for exploration and diffs | Path | May contain directory, value, or reference children. |
| Value | Canonical encoded object or owned value | Type, version, bytes | Defines one canonical runtime object identity when decoded as an object. |
| Reference | Typed symlink-like alias to a canonical value | Expected type, absolute target path | Target must be a value. No children. No reference chains. |

References should use absolute direct targets. For example:

```text
/root/shared/units                         value: common/unitdb.Units@1
/root/instances/0003/units                reference -> /root/shared/units
/root/instances/0003/characters           value: common/characters.Characters@1
```

## Ownership model

Use a hybrid ownership model:

- Owned child state may be nested in its parent's value codec or stored as a canonical child value node.
- Genuinely shared runtime objects use references to one canonical value path.
- Stable paths are object identities and directory structure for human exploration and snapshot diffs.

The choice between nested owned state and a child value node is an implementation detail only when it does not hide sharing, destabilize paths, or create ambiguous ownership.

Examples of likely shared objects include parse-wide unit, aura, vehicle, raid-group, and consumable trackers referenced by multiple instance objects. The preliminary inventory is in [dependency-inventory.md](dependency-inventory.md).

## Write invariants

The writer must reject the archive if any of these conditions occur:

- A path is written more than once.
- The same path is claimed with different node kinds.
- A path has both value semantics and children that its codec does not own.
- One runtime object claims more than one canonical value path.
- Distinct runtime objects claim the same canonical value path.
- A reference target is missing.
- A reference targets a directory or another reference.
- A reference's expected type does not match its target type.
- A reference has children.
- A type identifier or version is unknown.
- A declared dependency cannot be resolved.
- The object graph violates a codec or parser invariant.

Multiple reference paths may resolve to the same canonical value object. That is the intended representation of sharing.

Conflict handling is strict. The store must not guess, merge, silently overwrite, or pick a winner.

## Deterministic paths

Semantic objects need stable paths across equivalent parses. Paths should use deterministic identifiers such as:

- fixed singleton names for parse-wide state
- stable file sequence numbers
- stable instance ordinals derived from parse order
- stable encounter identifiers or ordinals where available
- stable tracker names within an owning object

Map iteration order, pointer values, process-local IDs, and random UUIDs must not determine archive paths.

## Reachability

A snapshot starts from one or more declared roots, normally `/root`. Only values reachable through owned children and references are written. Unreachable registered objects are omitted.

Reachability-based omission provides archive garbage collection without a second deletion protocol. It also makes logical save-in-place produce a complete replacement rather than an incremental patch.

## Restore phases

The initial restore pipeline has four phases:

| Phase | Responsibility | Forbidden work |
|---|---|---|
| Allocate | Create empty runtime objects for canonical value nodes. | Decoding owned state, assigning references, derived initialization. |
| Decode | Populate scalar fields and owned state from each value payload. | Resolving shared references, derived initialization. |
| Resolve | Assign references to already allocated canonical values. | Creating hidden canonical objects, derived initialization. |
| Validate | Check local invariants, graph invariants, required dependencies, and ready-to-process state. | Mutating semantic state to repair invalid input. |

Decode must populate owned state only. Resolve must assign references only. Derived initialization belongs after required dependencies are available, but it must not be smuggled into Resolve.

A codec may declare dependencies and the stage at which each dependency is required. The implementation must map the real dependency graph before adding more restore stages. Add a new stage only when an actual dependency cannot fit these phases. A true dependency cycle is fatal.

Runtime dependencies such as context, logger, game database access, registry factories, or callbacks are supplied by the restore caller. They are not assumed to be serialized objects. Their compatibility-relevant identity belongs in the fingerprint.

## Fingerprint

The archive header contains a fingerprint separate from the state tree. At minimum, investigate:

| Component | Examples |
|---|---|
| Store and snapshot schema | Archive format version, parser snapshot schema version |
| Parser implementation | Build or parser version |
| Input interpretation | Log format, flavor, relevant parse options |
| Game data | Dataset identity and game-data override identity |
| Factories and rules | Registry identity, encounter rules, ranking rules |
| Input prefix | Ordered identities of complete files already processed |

The input prefix manifest is required restore state. Each entry must identify the immutable file and its authoritative order, with enough information to reject replacements, gaps, or mutation. The inventory must select the exact tuple, likely including a file or object ID, sequence or ordering key, content hash or immutable object version, and size.

Compatibility is strict by default. Unknown fields, unknown types, unsupported versions, fingerprint mismatch, or an inconsistent input prefix may discard the snapshot and trigger a full reparse. No migration path is required initially.

## Portability and trust boundary

A snapshot may cross a machine and deployment boundary. Its encoding must not depend on process-local pointers, connection details, filesystem paths, or unavailable private runtime state.

The primary daemon treats a returned snapshot as an input artifact, not as authoritative state. Before restore or finalization it must validate:

- archive and snapshot schema versions
- fingerprint compatibility
- manifest and content hashes when present
- processed-file prefix identity
- allowed type identifiers and codec versions
- reference and ownership invariants
- configured archive, record, depth, and decoded-size limits

Successful validation allows restoration, but only terminal finalization and the existing publication fence make results authoritative. Invalid, incompatible, or unavailable snapshots may be discarded in favor of a full parse.

Read-only database connection details are not portable state. The restore caller supplies fresh read dependencies, and the fingerprint verifies the semantic dataset and rule identity those dependencies expose.

## Physical persistence

The parser performs a logical replacement of the current snapshot. The storage backend should implement it with atomic physical replacement:

1. Write a complete new archive under a fresh physical key.
2. Validate its manifest, record set, and content hashes if enabled.
3. Atomically switch a small current pointer, manifest pointer, or equivalent commit marker.
4. Delete older physical archives later as best-effort cleanup.

Readers must observe either the previous complete archive or the new complete archive. They must never observe a partially written archive.

This atomicity protects readers from torn writes. It does not make snapshots durable or part of crash recovery. If the archive or pointer is unavailable, Chronicle may discard it and reparse all files.

## Debug metadata and audit mode

Each record may contain optional `json.RawMessage` metadata. Suggested uses include:

- human label and component provenance
- encoded and decoded sizes
- content hash
- codec timing
- dependency list
- source file prefix
- runtime type name

Existing debug parse mode may add richer audit output:

- archive manifests and tree explorers
- per-node encode and restore timings
- change logs between snapshots
- snapshot diffs by stable path
- hashes and size deltas
- reference and ownership graphs

Debug metadata and audit files must not affect semantic restore. A snapshot without them must restore identically.

## Store API shape

Exact Go APIs remain an implementation decision. The conceptual operations are:

```text
BeginWrite(logicalKey, fingerprint)
Mkdir(path)
WriteValue(path, type, version, value, debugMetadata)
WriteReference(path, expectedType, absoluteTarget, debugMetadata)
ValidateArchive()
CommitAsCurrent() // permitted only after successful validation

OpenCurrent(logicalKey)
CheckFingerprint(expected)
Allocate()
Decode(runtimeDependencies)
Resolve()
Validate()
```

The store should remain usable by typed trees outside log parsing without importing parser packages.
