# Instance restore wiring checklist

This inventory records the production `NewHookable` behavior and the implemented
`HookableGraphRecipe` restore/wiring contract. It is not permission to omit
unsupported owners or evidence of completed production rollout. The durable
`chronicle.CompleteFileSession` composes this aggregate with sources and consumers.
See [session status](STATUS.md) and the
[complete-file facade](../../../docs/logparse-snapshots/complete-file-session.md).
Paths in this document are relative to `combatlog/`.

## Preserve two distinct hook lists

`NewHookable` currently registers character hooks in this order:

1. Participants tracker, also supplying `NoKnownParticipantsAlive`.
2. Classification emitter.
3. Combatant-info emitter.
4. Unit-telemetry emitter for V22 only.
5. Speedrun tracker when configured.
6. Derived-instance speedrun trackers in the trusted recipe order.

Its instance hook list is independently ordered:

1. Caller-provided `ExtraHooks`, in original order, represented by trusted prefix
   hook recipes in the graph path.
2. Participants, armory, classification, combatant-info, loot, engagement, overview.
3. Unit telemetry for V22.
4. Overhealing for Vanilla companion, SuperWoW, and TBC companion.
5. DPS, survivability, and speedrun when configured.
6. Derived-instance ranking trackers, followed by trusted suffix hooks.

AzerothCore uses its typed hook as a suffix for known production instances and a
prefix for the approved unknown-zone fallback. The fallback retains observed zone
metadata under a fixed code-defined recipe. Archive input cannot supply matching
functions or executable constructors. SuperWoW appears in historical hook logic
but is intentionally excluded from `CompleteFileSession`.

After parse-wide trackers are attached, aura projection is prepended to the
instance list and appended to the character hook list. The consume collector is
appended to the instance list after suffix hooks. `graphHooks` validates these
canonical dependencies and exact orders as well as the construction-time hooks.

The ordering is semantic. Overhealing mutates the message and must precede DPS,
which reads effective healing. Restoring a set of owners is not sufficient if
wiring changes the order or registers an owner twice.

## Runtime edges are not historical observations

- Classification emitter references canonical Units, Characters, and Identifier.
- Combatant-info emitter references canonical armory, Characters, and Units, plus
  the explicit emit strategy. AzerothCore selects all players; other formats
  select active players.
- Both emit callbacks route to the current active fight's event buffer. They must
  close over the restored Hookable, not the original instance or a stale fight.
- V22 telemetry emission uses the same active-fight routing rule, but additionally
  has owner-local retained state. Replacing it with a newly empty emitter would
  lose that state.
- Character factories are selected from explicit format/flavor context. Runtime
  wiring must retain the trusted supported recipe and must not replay observed
  characters or gameplay to rebuild indexes.

Load canonical owners first. Validate the candidate. Only then install runtime
callbacks and hook lists in a distinct wiring phase. Do not call `NewHookable`
as a shortcut during semantic restoration; it constructs new trackers, hooks,
characters, and callbacks rather than connecting the restored owners.

## Persisted checkpoint lifecycle

A continuation checkpoint is in-flight state persisted to disk or a database
before Finalize, including any open fight. Restore that persisted state to
continue complete files or to Finalize immediately before writing authoritative
output, then discard the terminal finalized instance. There is no `.Clone()` or
in-memory detached-copy Finalize path. Finalized output is not resumable parser
state. A terminal parse without planned continuation may Finalize without a
checkpoint; continued prefix publication must preserve the durable pre-Finalize
checkpoint first.

## Implemented aggregate coverage

`parser/common/instances/hookable_graph.go`,
`parser/common/instances/hookable_graph_runtime.go`, and
`parser/common/encounters/graph.go` now cover the aggregate. The explicit prepared registry
admits supported recipes; unsupported owners/configurations fail closed rather
than being silently omitted. Review these invariants when extending coverage:

- Current and completed fights, encounter boundary/deferred-end state, activity
  timestamps, ignored ends, and finalization flags.
- `ongoingFight`: difficulty metadata, encounter/map IDs, active hostiles,
  canonical event buffer, retained player-death messages, phases and staged phase
  transitions, authoritative metadata, and shared start/end Moments.
- Loot's Units reference and retained `FinalLoot` observations. Its `Finalize`
  resolves names into GUIDs, so replaying finalization during restore changes
  semantic state. `Insert` belongs to publication and must never run on load.
- Ranking rules and derived-instance rankings/speedrun trackers, preprocessors,
  extra hooks, zone matching, realm/header metadata, and derived names.
- All concrete character types reachable under the chosen factory recipe.
- Parse-wide shared trackers attached by `encounters.State`, then the State's
  current-instance/list references and instance resolver.

`registry.PreparedGraph.RegisterOwners` composes the common, character/period,
creature, ranking, phase, metadata, and selected preprocessor codecs. Session
composition adds the retained source, ordered consumer set, optional identity
collector, and root. Configured aura/consume/spell dependencies are bound to the
session compatibility identity rather than recreated from archive data.

`encounters.GraphRecipe.Resolve` binds the fresh context/logger only at new-state
construction or runtime wiring. Semantic restoration loads existing owners and
leaves observers absent. Runtime wiring reconnects those owners once, preserving
both hook lists and active-fight callbacks; it does not rerun constructors,
process messages, finalize, publish, or query services.

Production-registry and source adapter tests, plus deterministic Vanilla and
expansion session tests, exercise this composition beyond the smaller component
roots. AzerothCore implementation is complete for its admitted recipes, and the
original 16 full-session scenarios passed. Targeted race validation of the expanded
24-scenario AzerothCore and 60-scenario expansion matrices also passed in Chronicle.
Full real-corpus session comparison and production DB/River/UI selection remain
review gates. No first real-log resume comparison should precede joint review of
the concrete coverage and deterministic restore tests.
