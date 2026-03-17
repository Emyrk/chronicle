---
name: dps-sim
description: >
  DPS simulation engine for Vanilla WoW (Turtle WoW). WASM-compatible, interface-driven.
  Covers combat formulas, spell/melee resolution, aura tracking, event-driven engine,
  and the DataProvider pattern. Use when: adding spells/rotations, modifying combat
  formulas, debugging sim output, adding new data providers, or building frontend integration.
advertise: true
---

# DPS Simulation Engine

WASM-compatible DPS simulation engine for Vanilla WoW (Turtle WoW). Uses interfaces
for game data access so it runs in both native Go and browser WASM.

## Quick Reference

```bash
# Build
go build ./simulation/...

# Test
go test ./simulation/... -v

# WASM build (verify compatibility)
GOOS=js GOARCH=wasm go build ./simulation/...
```

## Architecture

```
simulation/
├── gamedata/
│   ├── types.go              # SpellData, ItemData, CreatureData, DataProvider interface
│   └── jsonprovider/         # WASM-safe JSON-backed DataProvider
├── combat/
│   ├── types.go              # CombatUnit, Outcome, DamageResult, AttackType
│   ├── formulas.go           # Vanilla combat formulas (armor, hit, resist, glancing)
│   ├── resolve.go            # Spell/melee damage resolution pipeline
│   ├── aura.go               # Aura tracking, DoT/HoT ticks, stat modifiers
│   └── formulas_test.go      # Formula tests
├── engine.go                 # Event-driven sim loop (Step, Run, CastSpell, AdvanceTo)
├── eventqueue.go             # Min-heap priority queue for SimEvents
├── character.go              # CharacterConfig → CombatUnit stat aggregation
├── spellmod.go               # Talent/aura spell modifier system (SpellModOp)
├── results.go                # SimResults, SpellBreakdown
└── engine_test.go            # Engine integration tests
```

## Key Design: DataProvider Interface

The engine never imports `dbcmem`, `chrondbc`, or `database`. All game data comes through:

```go
type DataProvider interface {
    GetSpell(id int32) (SpellData, bool)
    GetItem(id int32) (ItemData, bool)
    GetCreature(entryID uint32) (CreatureData, bool)
    GetSetBonuses(setID int32) ([]SetBonusData, bool)
    GetSpellsForClass(classID int32) ([]int32, error)
    GetPlayerBaseStats(race, class, level int32) (PlayerBaseStats, bool)
}
```

**Implementations:**
- `jsonprovider.Provider` — loads from JSON arrays, WASM-safe
- Future: `dbcprovider` (server-only, reads chrondbc + dbcmem)

## Execution Modes

### Batch (automated rotation)
```go
engine := simulation.NewEngine(config, boss, provider)
engine.SetRotation(myRotation)
results := engine.Run(300_000) // 5 min fight
```

### Step-through (debugging)
```go
engine.Reset()
for { result, ok := engine.Step(); if !ok { break } }
```

### Interactive (manual casting)
```go
engine.Reset()
engine.StartAutoAttack()
engine.CastSpell(25304) // Frostbolt
results := engine.AdvanceTo(5000) // advance 5 seconds
```

## Combat Formulas (Turtle WoW)

All formulas in `combat/formulas.go`, ported from vmangos with Turtle WoW modifications.

### Armor Mitigation
`0.1 * armor / (8.5 * attackerLevel + 40)`, capped at 75%.

### Spell Hit
Base 96% same level, -1% per level diff (first 2), then -11% per level PvE / -7% PvP.

### Melee Hit Table (two-roll cumulative)
Order: miss → dodge → parry → glancing → block → crit → crushing → hit.

### Turtle WoW Glancing Blows (NEW SYSTEM)
**Different from vanilla vmangos.** Linear scaling:
- Damage: `0.65 + 0.02 * (weaponSkill - 300)`, capped [0.65, 0.95]
- Miss: `8.0 - 0.2 * (weaponSkill - 300)`, capped [5.0, 8.0]
- Glancing chance vs +3 boss: 40% (same as vanilla)

### Spell Power Coefficient
Uses `EffectBonusCoefficient` from DBC if set, otherwise `castTimeMs / 3500`.
Level penalty: `1 - (20 - spellLevel) * 0.0375` for spells below level 20.

## Adding a New Rotation

```go
// simulation/rotations/fire_mage.go
type FireMage struct{}

func (r *FireMage) NextAction(state *simulation.SimState) *simulation.Action {
    // Priority: Combustion > Fireblast (if CD ready) > Fireball
    if state.TimeMs >= state.Cooldowns[COMBUSTION_ID] {
        return &simulation.Action{Type: simulation.ActionCastSpell, SpellID: COMBUSTION_ID}
    }
    return &simulation.Action{Type: simulation.ActionCastSpell, SpellID: FIREBALL_ID}
}
```

## Adding a New Spell Effect Type

1. Add constant in `gamedata/types.go` (e.g., `SpellEffectLeech = 9`)
2. Handle in `engine.go` → `processCastComplete()` switch statement
3. Add resolution logic in `combat/resolve.go` if needed

## Adding a New Data Provider

Implement `gamedata.DataProvider`. For server-only providers, use build tags:
```go
//go:build !js
package dbcprovider
```

## Reference: vmangos Source Files

| System | vmangos File | Go File |
|--------|-------------|---------|
| Spell damage pipeline | SpellCaster.cpp:966-1509 | combat/resolve.go |
| Armor mitigation | SpellCaster.cpp:858-882 | combat/formulas.go |
| Melee hit table | Unit.cpp:2234-2427 | combat/formulas.go |
| Spell hit/resist | SpellCaster.cpp:498-651 | combat/formulas.go |
| Aura/DoT system | SpellAuras.cpp:4265-4395 | combat/aura.go |
| Spell modifiers | SpellModifier.h:28-49 | spellmod.go |
| SpellEntry struct | SpellEntry.h:588-730 | gamedata/types.go |
| ItemPrototype | ItemPrototype.h:436-541 | gamedata/types.go |
| CreatureInfo | CreatureDefines.h:234-465 | gamedata/types.go |

vmangos source: `/home/steven/go/src/github.com/Emyrk/chronicle/research/core/src/game/`
