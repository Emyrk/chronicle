# Turtle WoW Onyxia's Lair 1.18.1 research

Research date: 2026-10-20

This note separates facts supported by patch/database data from tactics reported by players. The live encounter script is not public, so exact timers, threat rules, and ability triggers still need verification from Chronicle logs.

## Confirmed additions

Patch 1.18.1 added:

- Onyxian Inciter, NPC 49016.
- Onyxian Flamespawn, NPC 49017.
- An optional boss and new section, Broodcommander Axelus, NPC 49018.
- Unspecified new mechanics for Onyxia.

Sources:

- [Patch 1.18.1 summary](https://turtle-wow.fandom.com/wiki/Patch_1.18.1)
- [Broodcommander Axelus](https://octowow.st/db/?npc=49018)
- [Onyxian Inciter](https://octowow.st/db/?npc=49016)
- [Onyxian Flamespawn](https://octowow.st/db/?npc=49017)

### Creature templates

| Creature | Level | Template health | Template damage | Notes |
| --- | ---: | ---: | ---: | --- |
| Broodcommander Axelus | 63 boss | 822,001 | 2,846-3,284 | 4,201 armor, 285 fire resistance |
| Onyxian Inciter | 62 elite | 88,856 | 878-959 | Has a mana pool |
| Onyxian Flamespawn | 62 elite | 90,445 | 905-981 | Dragonkin |

Template values establish relative size, not live encounter scaling or scripted modifiers.

## Reworked Onyxia: strong community consensus

The following is repeated across successful raid reports, but remains community-sourced rather than official documentation.

### Phase 1, 100% to 65%

- The classic north-wall tanking and flank positioning remains valid.
- No consistently reported new mechanic occurs in this phase.

### Phase 2, 65% to 40%

- A large additional drake/dragonkin must be tanked.
- Successful groups assign one off-tank to it and have melee kill it while ranged continue damaging Onyxia.
- The add should die before Onyxia reaches 40% and lands. Groups report stopping damage on Onyxia if necessary.
- Whelps and Deep Breath remain active concerns.

### Phase 3, 40% to kill

- Two large adds, commonly called hatchers by players, join the landing phase.
- Reports consistently recommend one off-tank per hatcher, with the adds moved away from the raid and usually away from one another.
- Hatchers hit hard and cast Rain of Fire. Rain of Fire is repeatedly identified as the main source of raid damage and wipes.
- Whelps continue spawning and need a dedicated tank or immediate ranged control.
- The stable progression strategy is adds first, usually one hatcher at a time, then Onyxia.
- Successful reports commonly use three or four tanks total: Onyxia main tank, phase-two drake/off-tank, two phase-three hatcher assignments, with one tank sometimes covering multiple jobs.
- Fire Resistance aura/totem, Tremor Totem, Fear Ward, and strong visual/debuff tracking for Rain of Fire are repeatedly recommended.

Primary community thread: [Any guide on how to beat new Onyxia?](https://www.reddit.com/r/turtlewow/comments/1scj9g2/any_guide_on_how_to_beat_new_onyxia/)

### Claims that still need log verification

- Whether the two phase-three adds gain a proximity damage buff and its exact range. One report says they do; others only recommend separation for cleaner damage control.
- Whether the adds can currently be hibernated. Reports conflict and suggest this may have changed after launch.
- Whether Deep Breath route selection changed, as opposed to the new adds making old routes harder to read.
- Exact spawn times, cast intervals, Rain of Fire spell IDs, and threat-selection rules.
- Which new template name corresponds to the phase-two drake versus the phase-three hatchers.

## Broodcommander Axelus

### Confirmed

- Axelus is an optional level-63 boss in the new Onyxia's Lair section.
- He is a black dragonspawn and has a full boss loot table.
- Database spell records exist for:
  - Burning Chains, spell 47411: raw 400 fire damage with a 5-yard area.
  - Melted Chains, spell 48312: raw 5,000 fire damage in a 100-yard area plus a 50% movement slow for 8 seconds.

### Probable mechanic, not yet proven

A player report associates Burning Chains with Axelus and says the raid must repeatedly "proceed" or pass the chain mechanic. Failure may trigger Melted Chains, a raid-wide wipe-level pulse. The available report does not establish:

- who receives the chain;
- how it transfers;
- whether players move together, apart, or through a sequence;
- how many successful transfers are required;
- the timer or failure condition;
- other Axelus abilities or phases.

Source: [Broodcommander Axelus forum investigation](https://octowow.st/forum/viewtopic.php?t=993)

This is not safe to publish as a prescriptive guide until a clean combat log or POV recording is analyzed.

## Chronicle capture plan

For the next live clear, capture and inspect:

1. A full Axelus attempt with unit positions, casts, auras, damage, deaths, and target changes.
2. Every event involving spell IDs 47411 and 48312.
3. Aura application/removal order and affected GUIDs for Burning Chains.
4. Player distances when the chain transfers or fails.
5. Axelus health thresholds, cast cadence, summons, and enrage behavior.
6. Onyxia add GUID entry IDs, exact spawn timestamps, and phase thresholds.
7. Rain of Fire spell IDs, source NPC, target selection, duration, radius, and tick damage.
8. Whether phase-three adds gain an aura when near each other.
9. Whether Hibernate or other crowd control succeeds on either new add type.

## Guide changes supported now

The interactive guide can safely teach:

- bring three to four tank assignments;
- phase 2: tank and kill the additional drake before forcing the landing;
- phase 3: isolate both hatchers, move out of Rain of Fire, control whelps, kill adds before returning to Onyxia;
- preserve the classic north-wall and flank formation for Onyxia herself.

Axelus should remain a clearly labeled field-research chapter until a Chronicle log resolves the chain mechanic.
