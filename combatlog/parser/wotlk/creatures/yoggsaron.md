# Yogg-Saron encounter phases and parser triggers

This note defines the encounter model before custom character activity is added.
It is based on AzerothCore's `boss_yoggsaron.cpp` state machine. Chronicle does
not receive server-side phase changes, so it must infer one continuous encounter
from combat-log-visible activity.

## Encounter identity

The complete encounter is named **Yogg-Saron**. Sara is the phase-one and
phase-two controller, not a separate encounter. AzerothCore logs Yogg-Saron
with a vehicle GUID, so its custom character factory must accept both creature
and vehicle GUID types. The encounter includes:

| Role | Creature entries | Encounter phase |
| --- | --- | --- |
| Sara | 33134, 34332 | Phases 1 and 2 |
| Guardian of Yogg-Saron | 33136 | Phase 1 |
| Yogg-Saron | 33288 | Phases 2 and 3 |
| Brain of Yogg-Saron | 33890 | Phase 2 transition |
| Crusher Tentacle | 33966 | Phase 2 |
| Constrictor Tentacle | 33983 | Phase 2 |
| Corruptor Tentacle | 33985 | Phase 2 |
| Influence Tentacle and vision variants | 33943 and transformed entries | Phase 2 |
| Immortal Guardian | 33988 | Phase 3 |

Passive scenery and helpers, such as Ominous Clouds, Death Rays, portals, and
keepers, must not independently start or prolong the encounter.

## Phase 1: Sara and the guardians

**Server trigger:** the encounter starts when a player enters Sara's activation
range. Sara summons Guardians of Yogg-Saron. A guardian's death casts Shadow
Nova, including a separate hit against Sara.

**Combat-log trigger:** a specialized Guardian of Yogg-Saron character starts
or bumps Sara whenever the Guardian starts or bumps. This includes periodic
damage that would normally only bump the Guardian. Guardian activity and Shadow
Nova damage against Sara therefore belong to the same Yogg-Saron fight.

**Transition to phase 2:** repeated guardian explosions reduce Sara to her
phase-transition threshold. Sara does not die. The server resets her health,
changes her faction, summons Yogg-Saron hidden, and runs an approximately
64-second transformation sequence before phase-two combat begins.

**Parser consequence:** Sara's last phase-one activity must survive at least the
transformation gap. A normal 60-second inactivity timeout can split a valid pull
just before Yogg-Saron appears.

## Phase 2: Sara, tentacles, and the brain

**Server trigger:** the transformation sequence completes. Yogg-Saron appears
with Shadowy Barrier, Sara begins phase-two spells, the Brain of Yogg-Saron is
spawned, and surface tentacles begin spawning.

**Combat-log triggers:** any combat activity involving Sara, Yogg-Saron, the
Brain of Yogg-Saron, or a phase-two tentacle belongs to and prolongs the same
encounter. This includes players in the illusion rooms while surface activity is
sparse.

**Server transition to phase 3:** the Brain of Yogg-Saron is exposed after all
Influence Tentacles in an illusion are killed. Damage that takes the brain below
30 percent triggers phase 3. The brain does not die. Sara is hidden, Yogg-Saron's
barrier is removed, and Yogg-Saron is set to 30 percent health.

**Observable parser trigger:** combat logs do not expose the brain's current
health percentage. During phase 2, Yogg-Saron's Shadowy Barrier makes incoming
attacks immune. The first damage event targeting Yogg-Saron that is not marked
immune or evade is therefore the phase-three trigger available to Chronicle.
Outgoing Yogg-Saron activity before this point can prolong phase 2, but it must
not trigger phase 3.

**Parser consequence:** brain and tentacle activity must overlap or explicitly
bridge to the encounter anchor. A missing slain event for the brain is expected
and must not be treated as a wipe.

## Phase 3: Yogg-Saron and Immortal Guardians

**Server trigger:** the brain crosses below 30 percent health.

**Combat-log trigger:** the first non-immune, non-evade damage event targeting
Yogg-Saron marks phase 3. Subsequent Yogg-Saron and Immortal Guardian activity
continues the existing encounter.

**Successful end:** Yogg-Saron is slain. Sara and the Brain do not produce
their own slain events in the combat log, so Chronicle closes all three encounter
anchors as slain at Yogg-Saron's death timestamp. Immortal Guardians, tentacles,
and other encounter adds despawn and close as resets rather than fabricated kills.

**Wipe or reset:** no living eligible players remain in the chamber or illusion
rooms. Chronicle does not observe that server condition directly, so normal
inactivity timeout behavior closes the fight.

## Implementation invariants

1. Chronicle emits one boss encounter named `Yogg-Saron`, never separate `Sara`,
   `Brain of Yogg-Saron`, or tentacle encounters for the same pull.
2. Phase-one guardian activity determines the pull start. The parser must not
   move the start forward to Sara's first Shadow Nova hit.
3. The approximately 64-second phase-one transformation does not split the pull.
4. Phase-two illusion-room activity can keep the pull alive.
5. The first non-immune, non-evade damage event targeting Yogg-Saron marks phase
   3. The parser does not infer the transition from brain health or brain death.
6. Only Yogg-Saron's death marks encounter completion. Sara, the Brain, and
   Yogg-Saron close together as slain encounter anchors.
7. Immortal Guardians and other adds close as non-slain encounter-completion resets.
8. Timeouts remain wipes or resets according to the existing encounter finalizer.
9. Activity from passive helpers does not create false pulls or keep a completed
   pull open.

## Validation scenarios

Tests should cover:

- a phase-one Guardian starting the encounter before Sara is damaged;
- Sara remaining active across a gap longer than 60 seconds, followed by
  phase-two Yogg-Saron or tentacle activity;
- phase-two Brain or tentacle activity prolonging the same pull;
- immune damage against Yogg-Saron remaining phase 2;
- the first non-immune, non-evade hit targeting Yogg-Saron marking phase 3;
- phase-three Immortal Guardian activity prolonging the pull until Yogg-Saron
  activity resumes;
- Yogg-Saron's slain event producing a clean `Yogg-Saron` kill;
- Sara, the Brain, and Yogg-Saron ending as slain at the same timestamp;
- Immortal Guardians and other adds ending in non-slain reset states;
- a phase-one or phase-two timeout producing a reset or wipe rather than a kill.

## Source

AzerothCore, `src/server/scripts/Northrend/Ulduar/Ulduar/boss_yoggsaron.cpp`,
particularly Sara's `DamageTaken`, the transformation timer, Brain of
Yogg-Saron's `DamageTaken`, and Yogg-Saron's `JustDied` handlers.
