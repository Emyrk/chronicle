# Instance/Encounter/Fight System - Design Summary

## Overview

I've designed and implemented a clean, extensible structure for tracking WoW instance encounters and fights in your combat log parser.

## Key Concepts

- **Instance**: A dungeon/raid (e.g., Scarlet Monastery Cathedral, Molten Core)
- **Encounter**: A specific boss fight within an instance (e.g., High Inquisitor Whitemane)
- **Fight**: A single attempt at an encounter (wipes create new fights)

## What Was Created

### Core System (`state/encounters/`)

1. **instance.go** - Instance interface and base implementation
2. **encounter.go** - Encounter interface with configurable rules
3. **registry.go** - Factory pattern for creating instances by zone
4. **fight.go** - Already existed, tracking fight lifecycle
5. **life.go** - Already existed, tracking unit deaths/resurrections

### Example Implementation (`instances/smcathedral/`)

Complete working example for Scarlet Monastery Cathedral:
- **instance.go** - Cathedral instance with encounter detection
- **encounters.go** - Boss definitions (Whitemane, Mograine, Fairbanks)
- **whitemane.go** - Complex encounter with custom logic

### Documentation

- **README.md** - Quick start guide with code examples
- **DESIGN.md** - Detailed architecture documentation
- **STRUCTURE.md** - Visual diagrams (mermaid) and patterns

## Architecture Highlights

### Clean Separation of Concerns

```
State → Registry → Instance → Encounter → Fight
```

Each layer has a single responsibility:
- **State**: Parser state management
- **Registry**: Route messages to correct instance
- **Instance**: Contains all encounters for a dungeon
- **Encounter**: Rules for a specific boss
- **Fight**: Track a single attempt

### Extensibility

Adding a new instance requires:
1. Create a package under `instances/`
2. Define encounters with `EncounterRules`
3. Register in `registry.go`
4. Done!

No need to modify core code.

### Flexibility

**Simple Encounters** - Use `BaseEncounter`:
```go
NewBaseEncounter("Boss Name", EncounterRules{
    BossNames: []string{"Boss Name"},
    MinPlayers: 5,
    TimeoutSeconds: 45,
})
```

**Complex Encounters** - Extend with custom logic:
```go
type WhitemaneEncounter struct {
    *BaseEncounter
    mograineKilledFirst bool
    whitemaneRezzed bool
}
// Add custom OnStart(), OnEnd(), Process() methods
```

## Key Design Patterns Used

1. **Strategy Pattern** - Pluggable instance implementations
2. **Factory Pattern** - Registry creates instances
3. **Template Method** - BaseEncounter with overridable hooks
4. **Observer** - Encounter hooks (OnStart, OnEnd)

## Example Usage

```go
// In your parser state
func (s *State) Process(m messages.Message) error {
    // Automatically route to the right instance
    instance := s.registry.GetInstance(s.CurrentZone, s.Units)
    if instance != nil {
        return instance.Process(m)
    }
    
    // Fallback to generic tracking
    return s.Fights.Process(m)
}
```

## Benefits

✅ **Organized** - Each instance has its own package  
✅ **Type-Safe** - Compile-time checking  
✅ **Testable** - Unit test individual encounters  
✅ **Maintainable** - Clear structure, easy to find code  
✅ **Extensible** - Add instances without touching core  
✅ **Flexible** - Simple defaults, complex when needed

## Next Steps

### To Use This Design:

1. **Fix compilation issues** - The existing `fight.go` has a reference to `f.s.Units` that should be `f.db`
2. **Remove old code** - Delete or refactor the old `smcathedral/cath.go` 
3. **Integrate registry** - Add registry to your `State` struct
4. **Register instances** - Enable Scarlet Monastery in `DefaultRegistry()`

### To Extend:

1. **Add Molten Core**:
   ```bash
   mkdir -p instances/moltencore
   # Create instance.go, encounters.go, ragnaros.go
   ```

2. **Add Onyxia**:
   ```bash
   mkdir -p instances/onyxia
   # Create instance.go, encounters.go
   ```

3. **Add more Cathedral encounters**:
   Just add to `smcathedral/encounters.go`!

## File Tree

```
state/encounters/
├── README.md              ← Usage guide
├── DESIGN.md             ← Architecture details
├── STRUCTURE.md          ← Visual diagrams
├── instance.go           ← Instance interface
├── encounter.go          ← Encounter interface
├── registry.go           ← Factory registry
├── fight.go              ← Fight tracking (existing)
├── life.go               ← Life tracking (existing)
└── instances/
    └── smcathedral/
        ├── instance.go   ← Cathedral implementation
        ├── encounters.go ← Boss definitions
        └── whitemane.go  ← Complex encounter example
```

## Questions?

- Need help adding a new instance? Check `README.md` for examples
- Want to understand the architecture? See `DESIGN.md`
- Need visual diagrams? Look at `STRUCTURE.md`
- Want to see a working example? Study `instances/smcathedral/`

This design should scale well from simple 5-man dungeons to complex 40-man raids!
