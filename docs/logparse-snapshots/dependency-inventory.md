# Preliminary dependency inventory and implementation roadmap

This is a preliminary repository inventory, not a complete serialization plan. Implementation must trace every concrete parser, consumer, hook, callback, shared pointer, and final projection before codecs are written.

The current production worker also assumes one file in `chronicle/logparse.go`. Incremental multi-file processing must replace that assumption without changing terminal publication semantics.

## Current top-level flow

| Area | Current symbol | Snapshot relevance |
|---|---|---|
| Worker orchestration | `chronicle/logparse.go`, `WorkerLogParse.work` | Resolves format, flavor, dataset, files, registry, parse generation, terminal finalization, and database publication. |
| Parse construction | `chronicle/logparse_parse.go`, `WorkerLogParse.parseCombatLog` | Constructs format parser, `encounters.State`, optional `creatures.Creatures`, `consumers.Consumers`, and optional reorder wrapper. |
| Publication fencing | `chronicle/parse_generation.go`, `stageParseGeneration`, `finalizeParseGeneration` | Existing authoritative generation boundary. Snapshot persistence must remain outside this authority. |
| Consumer fanout | `combatlog/consumers/consumers.go`, `Consumers`, `Advancer` | Delivers every parser message to ordered consumers. Timing fields are likely debug-only unless proven semantic. |
| Parse-wide state | `combatlog/parser/common/encounters/consumer.go`, `encounters.State` | Owns current location and metadata, parse-wide trackers, instance list, and current instance pointer. |
| Per-instance state | `combatlog/parser/common/instances/hookable.go`, `instances.Hookable` | Owns fight detection, hooks, event aggregation, rankings, overview tracking, and terminal finalization guards. |

## Preliminary object graph

```text
WorkerLogParse
  -> format-specific parser / message source
  -> consumers.Consumers
       -> encounters.State
            -> unitdb.Units                         shared
            -> vehicles.Tracker                    shared
            -> raidgroups.Tracker                  shared
            -> auras.Tracking                      shared
            -> consumeevidence.Tracker             shared
            -> CurrentZone / CurrentRealm / Versions
            -> Instances[]
                 -> instances.Hookable
                      -> shared parse-wide trackers by reference
                      -> characters.Characters
                      -> identifier.Identifier
                      -> current ongoingFight
                           -> encounterevents.EncounterEventsInProgress
                                -> typed event builders
                      -> completed fights
                      -> hooks and preprocessors
                      -> engagement, DPS, survivability, speedrun trackers
                      -> overviewmetrics.Tracker
                      -> participants, armory, loot
                      -> synthetic emitters and projections
       -> optional creatures.Creatures
```

`encounters.State.createInstance` explicitly attaches parse-wide vehicle, aura, consumable, and raid-group state to each `Hookable`. These are strong candidates for canonical values under `/root/shared` with per-instance references.

## Inventory categories

### Input and parser state

Relevant paths include:

- `combatlog/parser/vanilla/parserv2`
- `combatlog/parser/wotlk`
- `combatlog/parser/blizzard/modern`
- `combatlog/parser/azerothcore`
- `combatlog/parser/messagesource`
- `combatlog/parser/reorder/reorder.go`

Each format parser may hold scanner position, header state, clocks, caches, metrics, and format-specific interpretation state. Because snapshots occur only after EOF for a complete file, prefer constructing a fresh input reader and parser shell for each new file. This does not mean resetting semantic parse state. Persist and attach every cross-file clock, mapping, cache, synthetic correlator, companion state, or format context that the inventory proves necessary. Do not serialize reader or scanner position.

`reorder.Processor` contains a heap, ordinal, latest timestamp, and EOF flag. None may cross a file boundary. A valid snapshot must observe an empty reorder buffer and should not encode the processor.

### Parse-wide canonical state

`combatlog/parser/common/encounters.State` currently owns or points to:

- `CurrentZone`, `CurrentRealm`, and `CurrentVersions`
- `CurrentInstance` and `Instances`
- `Units`
- `Vehicles`
- `RaidGroups`
- `Auras`
- `ConsumeTracker`
- an `InstanceResolver` callback
- timing accumulators and per-instance timing maps

The resolver, context, logger, spell fetcher, and registry-derived factories are runtime dependencies. Their compatibility identity belongs in the fingerprint. Timing data should be classified as semantic or debug-only before encoding.

### Per-instance state

`combatlog/parser/common/instances.Hookable` contains:

- static factory results and zone identity
- realm, versions, and recorder identity
- preprocessors and ordered hooks
- shared parse-wide pointers
- characters and hostile identification
- current fight and completed fights
- accumulated events
- encounter boundary and timeout state
- ranking and overview trackers
- finalization guards
- participants, armory, loot, vehicle, and raid-group links

The ordered hook list is a dependency graph disguised as slice order. Restore must recreate the same canonical hook objects and ordering. It must not instantiate duplicate trackers for a hook field and a hook-list entry.

### Event builders

Relevant paths and symbols:

- `combatlog/parser/common/encounterevents/encounterevents.go`
- `EncounterEventsInProgress`
- generic `Builder`
- `PositionBuilder`
- `unitTelemetryDeduplicator`
- `combatlog/parser/common/encounterevents/eventsstate.go`, finalized `Events`

Builders contain accumulated mutable event data before terminal finalization. They belong in snapshot state. This proposal intentionally does not create an event segment system.

Builder codecs must preserve message order, zero timestamps, counters, buffered damage state, position runs, telemetry deduplication, and finalized guards. Exact fields require a deeper inventory.

### Synthetic and projection state

Known synthetic or derived paths include:

- `auras.Projection`, attached by `Hookable.AttachAuraProjection`
- `ClassificationEmitter`
- `CombatantInfoEmitter`
- `UnitTelemetryEmitter`
- overheal derivation in `instances.Overhealing`
- consume projection and collectors attached by `AttachConsumeCollector`
- encounter timeout and fight-ending processors
- character hooks under `combatlog/parser/common/characters`

Callbacks such as emitter functions should be recreated during restore after owned state is decoded and referenced objects are resolved. Resolve itself must only assign references. Callback wiring may require an explicit post-Resolve initialization stage, but only after the dependency graph proves it is necessary.

### Rankings, trackers, and final projections

Relevant paths include:

- `combatlog/parser/common/instances/rankings`
- `DPSTracker`
- `EngagementTracker`
- `SpeedrunTracker`
- `SurvivabilityTracker`
- `combatlog/parser/common/instances/overviewmetrics`
- `participants.Tracker`
- `armory.Tracker`
- `loot.LootTracker`

`Hookable.Finalize` finalizes hooks, reads ranking tracker results, summarizes overview metrics, derives vehicle and raid-group metadata, and returns `FinalizedInstance`. Snapshot restore must reproduce all inputs to that terminal operation. It should not persist the final result as a substitute for mutable state.

`chronicle/logparse.go` then persists instances, encounters, event streams, rankings, and related projections. These writes remain terminal and authoritative.

## Candidate archive layout

This layout is illustrative. The inventory phase may refine names while preserving deterministic identity.

```text
/root
/root/parser-context
/root/processed-files
/root/shared
/root/shared/units
/root/shared/vehicles
/root/shared/raid-groups
/root/shared/auras
/root/shared/consume-tracker
/root/encounters-state
/root/instances
/root/instances/0000
/root/instances/0000/units                    -> /root/shared/units
/root/instances/0000/auras                    -> /root/shared/auras
/root/instances/0000/vehicles                 -> /root/shared/vehicles
/root/instances/0000/raid-groups              -> /root/shared/raid-groups
/root/instances/0000/characters
/root/instances/0000/current-fight
/root/instances/0000/completed-fights
/root/instances/0000/events
/root/instances/0000/hooks
/root/instances/0000/rankings
/root/instances/0000/overview
/root/identity-consumer
```

Instance ordinals must be stable parse-order identities. A path must not depend on pointer values or map iteration.

## Dependency questions to resolve before codecs

1. Which fields are semantic mutable state, derived state, runtime dependencies, or debug-only data?
2. Which pointers are true sharing and which are convenience aliases to owned children?
3. Which objects appear both as named fields and entries in hook or observer lists?
4. Which constructors register observers or callbacks as side effects?
5. Which callbacks can be recreated deterministically after Resolve?
6. Which maps use pointer keys, such as per-instance timing maps, and whether they are semantic?
7. Which concrete character, hook, preprocessor, registry, and ranking rule types can appear for every format and flavor?
8. Which final outputs depend on process-local random identifiers, clocks, or iteration order?
9. Which parser capabilities and metrics must survive between files?
10. Which state is only needed within one file and can be discarded at the boundary?

A true cycle in required stage dependencies is fatal. Object reference cycles are acceptable only when allocation followed by reference resolution can represent them without a dependency cycle in initialization.

## Implementation roadmap

### 1. Establish file lifecycle

- Define complete-file identity and ordering.
- Refactor parsing around `ProcessFile` without snapshotting.
- Use a fresh format parser and reorder processor per file.
- Prove continuous multi-file parsing equals concatenated parsing under the no-cross-file-reorder contract.
- Reject appends after terminal completion.

### 2. Complete the state inventory

- Enumerate every concrete object reachable from parser roots for each format and flavor.
- Classify every field as owned, shared reference, runtime dependency, derived, debug-only, or forbidden.
- Record constructor side effects and hook ordering.
- Produce the real restore dependency graph.

### 3. Build the generic store

- Implement directory, value, and reference records.
- Enforce deterministic paths and strict conflicts.
- Implement fingerprints, manifests, reachability, and optional debug metadata.
- Implement atomic physical replacement behind a logical current key.
- Test the store independently of combat log packages.

### 4. Add parser codecs in dependency order

- Start with leaf value types and parse-wide trackers.
- Add per-instance owned state and canonical shared references.
- Add builders, current fights, hooks, synthetic processors, rankings, and overview trackers.
- Implement Allocate, Decode, Resolve, and Validate.
- Add another phase only if the mapped dependency graph requires it.

### 5. Integrate optional snapshots

- Load only compatible snapshots with matching file prefixes.
- Process newly available complete files.
- Save one replacement snapshot per available batch.
- Fall back to full parse on every snapshot failure.
- Keep terminal publication on the existing parse-generation path.

### 6. Prove equivalence and operability

- Add boundary-split golden fixtures for all supported formats.
- Compare event output and final database projection inputs.
- Add deterministic archive and conflict tests.
- Add explorer, metrics, and optional debug diffs.
- Measure archive size, restore time, and saved replay work before considering lazy loading.

## Future partial loading

Logs with many instances may later benefit from per-instance or lazy snapshots. The first implementation should restore one logical archive eagerly. Stable `/root/shared` and `/root/instances/<stable-id>` subtrees preserve a path toward sharding, selective fetch, or lazy decoding without committing to those mechanisms now.

## Implementation non-goals

- Snapshotting arbitrary Go memory by reflection.
- Serializing contexts, loggers, readers, database handles, or closures.
- Hiding object identity conflicts with deduplication heuristics.
- Migrating unknown snapshot schemas.
- Introducing partial authoritative writes.
- Designing event segments.
