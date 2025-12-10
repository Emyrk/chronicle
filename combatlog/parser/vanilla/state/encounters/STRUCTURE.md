# System Structure Diagram

## Component Hierarchy

```mermaid
graph TB
    subgraph "Parser State"
        State[State]
        Registry[Instance Registry]
    end
    
    subgraph "Instance Layer"
        SMC[Scarlet Monastery<br/>Cathedral Instance]
        MC[Molten Core<br/>Instance]
        Ony[Onyxia's Lair<br/>Instance]
    end
    
    subgraph "Encounter Layer"
        WM[Whitemane<br/>Encounter]
        MOG[Mograine<br/>Encounter]
        FB[Fairbanks<br/>Encounter]
        
        Rag[Ragnaros<br/>Encounter]
        Luci[Lucifron<br/>Encounter]
        
        OnyE[Onyxia<br/>Encounter]
    end
    
    subgraph "Fight Layer"
        F1[Fight #1<br/>Wipe]
        F2[Fight #2<br/>Kill]
        F3[Fight #3<br/>Kill]
    end
    
    State --> Registry
    Registry --> SMC
    Registry --> MC
    Registry --> Ony
    
    SMC --> WM
    SMC --> MOG
    SMC --> FB
    
    MC --> Rag
    MC --> Luci
    
    Ony --> OnyE
    
    WM --> F1
    WM --> F2
    MOG --> F3
    
    style State fill:#e1f5ff
    style Registry fill:#fff9c4
    style SMC fill:#c8e6c9
    style MC fill:#c8e6c9
    style Ony fill:#c8e6c9
    style WM fill:#ffe0b2
    style MOG fill:#ffe0b2
    style FB fill:#ffe0b2
    style Rag fill:#ffe0b2
    style Luci fill:#ffe0b2
    style OnyE fill:#ffe0b2
    style F1 fill:#ffcdd2
    style F2 fill:#c5e1a5
    style F3 fill:#c5e1a5
```

## Data Flow

```mermaid
sequenceDiagram
    participant Log as Combat Log
    participant State as Parser State
    participant Reg as Registry
    participant Inst as Instance
    participant Enc as Encounter
    participant Fight as Fight

    Log->>State: messages.Damage
    State->>State: Update zone info
    State->>Reg: GetInstance(zone)
    Reg-->>State: Cathedral Instance
    State->>Inst: Process(message)
    
    Inst->>Fight: Process(message)
    Fight->>Fight: Track unit lives
    Fight->>Fight: Update combat state
    
    alt Fight Just Started
        Inst->>Inst: detectEncounter(message)
        Inst->>Enc: Detect(fight, message)
        Enc-->>Inst: true (Whitemane)
        Inst->>Enc: OnStart(fight)
    end
    
    alt Boss Killed
        Fight->>Fight: Check success condition
        Fight->>Inst: Fight complete
        Inst->>Enc: OnEnd(fight, Success)
    end
```

## Class Diagram

```mermaid
classDiagram
    class Instance {
        <<interface>>
        +Name() string
        +MatchesZone(zone) bool
        +Process(message) error
        +Encounters() []Encounter
        +CurrentEncounter() Encounter
        +AllFights() []*Fight
    }
    
    class Encounter {
        <<interface>>
        +Name() string
        +Detect(fight, message) bool
        +OnStart(fight) error
        +OnEnd(fight, result) error
        +Rules() EncounterRules
    }
    
    class Fight {
        +Logger *slog.Logger
        +Lives map[GUID]Lives
        +Start Message
        +End Message
        +Process(message) error
        +IsStarted() bool
        +IsDone() bool
    }
    
    class EncounterRules {
        +BossNames []string
        +AdditionalEnemyNames []string
        +MinPlayers int
        +SuccessCondition func
        +FailCondition func
        +TimeoutSeconds int
    }
    
    class Lives {
        +Alive []Life
        +LastActivity Message
        +IsActive() bool
        +StartLife(message)
        +EndLife(message)
    }
    
    Instance "1" --> "*" Encounter: contains
    Instance "1" --> "*" Fight: tracks
    Encounter "1" --> "1" EncounterRules: defines
    Encounter "1" --> "*" Fight: identifies
    Fight "1" --> "*" Lives: tracks units
```

## Directory Structure

```
state/encounters/
│
├── Core Interfaces & Types
│   ├── instance.go          # Instance interface & BaseInstance
│   ├── encounter.go         # Encounter interface & BaseEncounter
│   ├── fight.go            # Fight tracking logic
│   ├── life.go             # Unit life/death tracking
│   └── registry.go         # Instance factory registry
│
├── Documentation
│   ├── README.md           # Usage guide
│   ├── DESIGN.md           # Architecture details
│   └── STRUCTURE.md        # This file
│
└── Concrete Instances
    └── instances/
        ├── smcathedral/         # Scarlet Monastery Cathedral
        │   ├── instance.go      # Cathedral instance implementation
        │   ├── encounters.go    # Encounter definitions
        │   └── whitemane.go     # Complex encounter example
        │
        ├── moltencore/          # Molten Core (future)
        │   ├── instance.go
        │   ├── encounters.go
        │   ├── ragnaros.go
        │   └── lucifron.go
        │
        └── onyxia/             # Onyxia's Lair (future)
            ├── instance.go
            └── encounters.go
```

## Key Design Patterns

### 1. Strategy Pattern
- Different instances implement the `Instance` interface
- Different encounters implement the `Encounter` interface
- Allows pluggable behavior without modifying core code

### 2. Factory Pattern
- Registry creates instances based on zone
- Instance factories are registered at startup
- Loose coupling between parser and instances

### 3. Template Method Pattern
- `BaseEncounter` provides default behavior
- Specific encounters override only what they need
- Reduces boilerplate code

### 4. Observer Pattern
- Instances observe combat log messages
- Encounters react to fight state changes
- Hooks: `OnStart()`, `OnEnd()`

## Adding a New Instance

1. Create package: `instances/myinstance/`
2. Implement `Instance` interface
3. Define encounters with `EncounterRules`
4. Register in `registry.go`
5. Done! The system automatically routes messages

## Example: Processing Flow

```
1. Combat log message arrives
   ↓
2. State.Process() receives message
   ↓
3. Check current zone
   ↓
4. Registry.GetInstance(zone)
   ↓
5. Instance.Process(message)
   ↓
6. Fights.Process(message)
   ↓
7. Fight.Process(message)
   ↓
8. Update unit lives, damage, etc.
   ↓
9. Check if fight should start/end
   ↓
10. If starting: Detect which encounter
    ↓
11. Call encounter.OnStart()
    ↓
12. If ending: Call encounter.OnEnd()
```
