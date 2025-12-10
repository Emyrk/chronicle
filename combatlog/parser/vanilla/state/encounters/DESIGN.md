# Instance / Encounter / Fight Structure

## Vocabulary

- **Instance**: A dungeon or raid (e.g., "Scarlet Monastery Cathedral", "Molten Core", "Onyxia's Lair")
- **Encounter**: A specific boss or named enemy within an instance (e.g., "High Inquisitor Whitemane", "Ragnaros")
- **Fight**: A single attempt at an encounter (if you wipe and try again, that's a new fight)

## Architecture

```
Instance (Cathedral)
├── Encounters (list of possible encounters)
│   ├── Whitemane Encounter
│   │   ├── Fight 1 (wipe)
│   │   └── Fight 2 (kill)
│   ├── Mograine Encounter
│   │   └── Fight 1 (kill)
│   └── Trash Encounter (optional)
└── Instance Rules
    ├── Enemy/Boss definitions
    ├── Detection logic
    └── Encounter-specific rules
```

## Design Pattern

### 1. Instance Definition
Each instance is a package with:
- A list of known enemies/bosses (for detection)
- Encounter definitions
- Instance-specific rules

### 2. Encounter Detection
When a fight starts, we detect which encounter it is by:
- Checking enemy names/GUIDs
- Zone information
- Context from previous fights

### 3. Fight Lifecycle
```
1. NEW → First damage/cast seen
2. IN_PROGRESS → Combat active
3. COMPLETED → All enemies dead
4. WIPED → All players dead
5. TIMEOUT → No activity for X seconds
```

## File Structure

```
state/encounters/
├── DESIGN.md                    # This file
├── fight.go                     # Generic Fight implementation
├── life.go                      # Unit life tracking
├── encounter.go                 # Encounter interface
├── instance.go                  # Instance interface
├── registry.go                  # Instance registry (factory)
└── instances/
    ├── smcathedral/
    │   ├── instance.go          # Cathedral instance
    │   ├── encounters.go        # Encounter definitions
    │   ├── whitemane.go         # Whitemane-specific logic
    │   └── mograine.go          # Mograine-specific logic
    ├── moltencore/
    │   ├── instance.go
    │   ├── encounters.go
    │   └── ragnaros.go
    └── onyxia/
        ├── instance.go
        └── encounters.go
```

## Example Usage

```go
// In your parser state
func (s *State) Process(m messages.Message) error {
    // Detect instance from zone
    if instance := registry.GetInstance(s.CurrentZone); instance != nil {
        return instance.Process(m)
    }
    
    // Fallback to generic fight tracking
    return s.Fights.Process(m)
}
```

## Interfaces

### Instance Interface
```go
type Instance interface {
    // Name returns the instance name
    Name() string
    
    // Zone returns the zone name(s) this instance uses
    Zones() []string
    
    // Process handles a message for this instance
    Process(m messages.Message) error
    
    // Encounters returns all encounters for this instance
    Encounters() []Encounter
    
    // CurrentFight returns the active fight
    CurrentFight() *Fight
}
```

### Encounter Interface
```go
type Encounter interface {
    // Name returns the encounter name (e.g., "High Inquisitor Whitemane")
    Name() string
    
    // Detect checks if this message indicates this encounter
    Detect(m messages.Message) bool
    
    // BossUnits returns the main boss unit IDs
    BossUnits() []guid.GUID
    
    // OnStart is called when the encounter starts
    OnStart(f *Fight) error
    
    // OnEnd is called when the encounter ends
    OnEnd(f *Fight) error
    
    // Rules returns encounter-specific rules
    Rules() EncounterRules
}
```

### EncounterRules
```go
type EncounterRules struct {
    // BossNames are the names to look for to detect this encounter
    BossNames []string
    
    // MiniBossNames are additional enemies that count for this encounter
    MiniBossNames []string
    
    // SuccessCondition defines when the encounter is complete
    // e.g., "All bosses dead", "Boss at 0 health", custom logic
    SuccessCondition func(f *Fight) bool
    
    // FailCondition defines when the encounter failed
    FailCondition func(f *Fight) bool
    
    // TimeoutSeconds is how long with no activity before timeout
    TimeoutSeconds int
}
```

## Benefits

1. **Clean Separation**: Each instance has its own package with its own rules
2. **Extensible**: Easy to add new instances without modifying core code
3. **Testable**: Can unit test individual encounters
4. **Type-safe**: Strong typing for encounters and rules
5. **Discoverable**: Clear structure makes it easy to find instance-specific code
