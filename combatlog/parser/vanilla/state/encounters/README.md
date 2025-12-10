# Instance / Encounter / Fight System

This package provides a structured way to track WoW instance encounters and fights.

## Concepts

- **Instance**: A dungeon or raid (e.g., "Scarlet Monastery Cathedral", "Molten Core")
- **Encounter**: A specific boss or named enemy (e.g., "High Inquisitor Whitemane")
- **Fight**: A single attempt at an encounter (wipes create new fights)

## Quick Start

### 1. Define an Instance

Create a new package under `instances/` for your instance:

```go
// instances/myinstance/instance.go
package myinstance

import (
    "log/slog"
    "github.com/Emyrk/chronicle/combatlog/parser/types/zone"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

type MyInstance struct {
    logger     *slog.Logger
    db         *unitdb.Units
    encounters []encounters.Encounter
    fights     *encounters.Fights
}

func New(logger *slog.Logger, db *unitdb.Units, z zone.Zone) *MyInstance {
    m := &MyInstance{
        logger: logger,
        db:     db,
        fights: encounters.NewFights(logger, db, z),
    }
    
    // Define encounters
    m.encounters = []encounters.Encounter{
        NewBoss1Encounter(),
        NewBoss2Encounter(),
    }
    
    return m
}

func (m *MyInstance) Name() string {
    return "My Instance"
}

func (m *MyInstance) MatchesZone(z zone.Zone) bool {
    return z.Name == "My Zone Name"
}

func (m *MyInstance) Process(msg messages.Message) error {
    return m.fights.Process(msg)
}

// ... implement other Instance interface methods
```

### 2. Define Encounters

```go
// instances/myinstance/encounters.go
package myinstance

import "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"

const (
    BossBoss1 = "Boss One"
    BossBoss2 = "Boss Two"
)

func NewBoss1Encounter() encounters.Encounter {
    return encounters.NewBaseEncounter(
        "Boss One",
        encounters.EncounterRules{
            BossNames: []string{BossBoss1},
            MinPlayers: 5,
            TimeoutSeconds: 45,
        },
    )
}

func NewBoss2Encounter() encounters.Encounter {
    return encounters.NewBaseEncounter(
        "Boss Two",
        encounters.EncounterRules{
            BossNames: []string{BossBoss2},
            AdditionalEnemyNames: []string{"Boss Two's Pet"},
            MinPlayers: 5,
            TimeoutSeconds: 60,
        },
    )
}
```

### 3. Register Your Instance

```go
// In registry.go DefaultRegistry function
func DefaultRegistry(logger *slog.Logger) *Registry {
    r := NewRegistry(logger)
    
    r.Register("My Instance", myinstance.New)
    r.Register("Scarlet Monastery Cathedral", smcathedral.New)
    
    return r
}
```

### 4. Use in Your Parser

```go
// In your state/state.go
func (s *State) Process(m messages.Message) error {
    // Check if we're in a known instance
    instance := s.registry.GetInstance(s.CurrentZone, s.Units)
    if instance != nil {
        return instance.Process(m)
    }
    
    // Fallback to generic fight tracking
    return s.Fights.Process(m)
}
```

## Advanced: Custom Encounter Logic

For complex encounters with special mechanics, you can extend `BaseEncounter`:

```go
// instances/myinstance/complex_boss.go
package myinstance

import (
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
)

type ComplexBossEncounter struct {
    *encounters.BaseEncounter
    
    phaseNumber int
    addsSpawned int
}

func NewComplexBossEncounter() *ComplexBossEncounter {
    base := encounters.NewBaseEncounter(
        "Complex Boss",
        encounters.EncounterRules{
            BossNames: []string{"Complex Boss"},
            MinPlayers: 10,
            TimeoutSeconds: 120,
            
            // Custom success condition
            SuccessCondition: func(f *encounters.Fight) bool {
                // Your custom logic here
                return true
            },
        },
    )
    
    return &ComplexBossEncounter{
        BaseEncounter: base,
    }
}

func (c *ComplexBossEncounter) OnStart(f *encounters.Fight) error {
    c.phaseNumber = 1
    c.addsSpawned = 0
    return nil
}

func (c *ComplexBossEncounter) OnEnd(f *encounters.Fight, result encounters.FightResult) error {
    // Log analytics, achievements, etc.
    return nil
}
```

## Example: Scarlet Monastery Cathedral

See `instances/smcathedral/` for a complete example with:
- Basic encounters (Mograine, Fairbanks)
- Complex encounter (Whitemane with resurrection mechanics)
- Instance-level fight tracking

## File Structure

```
encounters/
├── README.md              # This file
├── DESIGN.md             # Architecture documentation
├── instance.go           # Instance interface
├── encounter.go          # Encounter interface
├── fight.go              # Fight tracking
├── life.go               # Unit life tracking
├── registry.go           # Instance registry
└── instances/
    ├── smcathedral/      # Scarlet Monastery Cathedral
    │   ├── instance.go
    │   ├── encounters.go
    │   └── whitemane.go
    ├── moltencore/       # Molten Core (example)
    └── onyxia/           # Onyxia's Lair (example)
```

## Benefits

1. **Organized**: Each instance has its own package
2. **Extensible**: Easy to add new instances and encounters
3. **Type-safe**: Compile-time checking of encounter rules
4. **Testable**: Can unit test individual encounters
5. **Maintainable**: Clear separation of concerns

## Testing

```go
func TestWhitemaneEncounter(t *testing.T) {
    logger := slog.Default()
    db := unitdb.New()
    zone := zone.Zone{Name: "Scarlet Monastery"}
    
    instance := smcathedral.New(logger, db, zone)
    
    // Simulate combat log messages
    // Assert expected behavior
}
```
