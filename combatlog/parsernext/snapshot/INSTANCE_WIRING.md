# Instance restore wiring checklist

This inventory records current `parser/common/instances/NewHookable` behavior.
It is not a restore implementation or permission to omit unsupported owners.
Paths in this document are relative to `combatlog/`.

## Preserve two distinct hook lists

`NewHookable` currently registers character hooks in this order:

1. Participants tracker, also supplying `NoKnownParticipantsAlive`.
2. Classification emitter.
3. Combatant-info emitter.
4. Unit-telemetry emitter for V22 only.
5. Speedrun tracker when configured.

Its instance hook list is independently ordered:

1. Caller-provided `ExtraHooks`, in original order.
2. Participants, armory, classification, combatant-info, loot, engagement, overview.
3. Unit telemetry for V22.
4. Overhealing for Vanilla companion, SuperWoW, and TBC companion.
5. DPS, survivability, and speedrun when configured.

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

## Remaining aggregate state

Before exposing a process-safe Hookable restore, cover all actual fields,
including optional configurations rather than silently ignoring them:

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

Existing event/DPS and shared-tracker component snapshots are building blocks.
They do not assert that this aggregate inventory or runtime wiring is complete.
No first full-session real-log resume comparison should precede joint review of
that coverage and its deterministic restore tests.
