---
name: dps-sim
description: >
  DPS simulation engine for Vanilla WoW (Turtle WoW) in TypeScript. Runs entirely
  in the browser. Covers combat formulas, spell/melee resolution, aura tracking,
  event-driven engine, the ApiDataProvider pattern, and EventsPanels integration.
  Use when: adding spells/rotations, modifying combat formulas, debugging sim output,
  building the sim UI page, or working with the panel bridge.
advertise: true
---

# DPS Simulation Engine (TypeScript)

Browser-based DPS simulation engine for Vanilla WoW (Turtle WoW). Fetches game data
from Chronicle's existing APIs. Produces events that feed directly into EventsPanels
processors for results display.

## Quick Reference

```bash
# Typecheck
cd frontend/chronicle && pnpm exec tsc --noEmit

# The sim has no separate build step — it's part of the frontend bundle
```

## Architecture

```
frontend/chronicle/src/sim/
├── types.ts          # Constants (schools, power types, aura types), interfaces
│                     # (SpellData, CreatureData, CombatUnit, DamageResult)
├── formulas.ts       # Pure math: armor, spell hit, resist, glancing, melee outcome
├── resolve.ts        # resolveSpellDamage, resolveMeleeDamage pipelines
├── aura.ts           # AuraTracker: addAura, removeAura, tickAuras, getModifier
├── spellmod.ts       # SpellMod system (flat + pct, filtered by SpellFamilyFlags)
├── character.ts      # CharacterConfig interface, buildCombatUnit (stats from gear)
├── dataProvider.ts   # ApiDataProvider class (fetches spells, items, bosses, base stats)
├── engine.ts         # Engine class: event queue (min-heap), step/run/cast/autoattack
├── results.ts        # SimResults, SpellBreakdown, recordDamage
├── panelBridge.ts    # Converts StepResults → ProcessorEvents for EventsPanels
└── index.ts          # Barrel exports

frontend/chronicle/src/pages/Sim/
├── SimPage.tsx           # Main page: race/class/target/duration config + results
├── SimResultsPanel.tsx   # DPS summary cards + spell breakdown table
├── RotationBuilder.tsx   # Spell priority list editor (add/remove/reorder)
├── PriorityRotation.ts   # Implements Rotation interface from priority list
├── useSimRunner.ts       # React hook: loads data, creates Engine, runs sim
└── index.ts
```

## Key Interfaces

### Engine

```typescript
class Engine {
  constructor(config: CharacterConfig, target: CreatureData,
              baseStats: PlayerBaseStats | null, spells: Map<number, SpellData>)
  reset(): void
  setRotation(r: Rotation | null): void
  setSeed(seed: number): void
  step(): { result: StepResult; ok: boolean }
  run(durationMs: number): SimResults
  castSpell(spellID: number): string | null
  startAutoAttack(): void
  isSpellReady(spellID: number): { ready: boolean; remainingMs: number }
  getState(): SimState
  getResults(): SimResults
}
```

### CharacterConfig

```typescript
interface CharacterConfig {
  race: number;       // 1=Human, 2=Orc, ..., 8=Troll
  classId: number;    // 1=Warrior, 2=Paladin, ..., 11=Druid
  level: number;
  gear: Map<number, SimItem>;      // slot → item
  talents: Map<number, number>;    // talentSpellID → points
  buffs: number[];                 // buff spell IDs
}
```

### Rotation

```typescript
interface Rotation {
  nextAction(state: SimState): { type: "cast"; spellID: number } | null;
}
```

### ApiDataProvider

```typescript
class ApiDataProvider {
  async getSpell(id: number): Promise<SpellData | null>
  async getItem(id: number): Promise<SimItem | null>
  async getBossPresets(): Promise<Record<string, CreatureData>>
  async getPlayerBaseStats(race: number, classId: number): Promise<PlayerBaseStats | null>
}
```

## Data Sources (Backend APIs)

| Data | Endpoint | Format |
|------|----------|--------|
| Spells | `GET /api/v1/wowdb/spell/{id}` | WoWSpell (180+ fields) |
| Items (sim) | `GET /api/v1/internal/gamedata/sim/item/{id}` | SimItem with PPM, cooldowns |
| Boss presets | `GET /api/v1/assets/boss-presets.json` | Static JSON |
| Player base stats | `GET /api/v1/assets/player-base-stats.json` | Key: `{raceId}_{classId}` |
| Class spells | `GET /api/v1/assets/class-spells.json` | Key: classId → spell list |

## EventsPanels Bridge

The sim produces `StepResult` objects. `panelBridge.ts` converts these to
`ProcessorEvent` objects (DamageProcessorEvent, CastProcessorEvent, AuraProcessorEvent)
with proper school/hittype mapping, then feeds them into any processor in-memory:

```typescript
import { collectSimSteps, runSimWithProcessor } from "../../sim/panelBridge";
import { damageDoneProcessor } from "../Instance/EventsPanels/processors";

const steps = collectSimSteps(engine);
const result = runSimWithProcessor(engine, steps, spells, damageDoneProcessor, "Mage", "mage");
```

Key conversions:
- WoW school bitmask (Physical=1, Fire=4) → chronicleproto.School enum (Physical=2, Fire=4)
- Sim `Outcome` → HitType bitmask (HitTypeCrit, HitTypeMiss, HitTypeGlancing, etc.)
- Fake GUIDs: player=`0x0000000000000001`, target=`0xF130000000000001`

## Combat Formulas (Turtle WoW)

All in `formulas.ts`, ported from vmangos with Turtle WoW modifications.

### Armor Mitigation
`0.1 * armor / (8.5 * attackerLevel + 40)`, capped at 75%.

### Spell Hit
Base 96% same level, -1% per level diff (first 2), then -11% per level PvE.

### Melee Hit Table (two-roll cumulative)
Order: miss → dodge → parry → glancing → block → crit → crushing → hit.

### Turtle WoW Glancing Blows (differs from vanilla)
Linear scaling:
- Damage: `0.65 + 0.02 * (weaponSkill - 300)`, capped [0.65, 0.95]
- Miss: `8.0 - 0.2 * (weaponSkill - 300)`, capped [5.0, 8.0]

### Spell Power Coefficient
`EffectBonusCoefficient` from DBC if set, otherwise `castTimeMs / 3500`.
Level penalty: `1 - (20 - spellLevel) * 0.0375` for spells below level 20.

## Adding a New Rotation

```typescript
class MyRotation implements Rotation {
  nextAction(state: SimState): { type: "cast"; spellID: number } | null {
    // Check cooldowns via state.cooldowns.get(spellId)
    // Check GCD via state.gcdReadyMs
    return { type: "cast", spellID: FIREBALL_ID };
  }
}
```

## Adding a New Spell Effect Type

1. Add constant in `types.ts` (e.g., `export const SpellEffectLeech = 9`)
2. Handle in `engine.ts` → `processCastComplete()` switch
3. Add resolution logic in `resolve.ts` if needed

## Reference: vmangos Source Files

| System | vmangos File | TS File |
|--------|-------------|---------|
| Spell damage pipeline | SpellCaster.cpp:966-1509 | resolve.ts |
| Armor mitigation | SpellCaster.cpp:858-882 | formulas.ts |
| Melee hit table | Unit.cpp:2234-2427 | formulas.ts |
| Spell hit/resist | SpellCaster.cpp:498-651 | formulas.ts |
| Aura/DoT system | SpellAuras.cpp:4265-4395 | aura.ts |
| Spell modifiers | SpellModifier.h:28-49 | spellmod.ts |

vmangos source: `/home/steven/go/src/github.com/Emyrk/chronicle/research/core/src/game/`
