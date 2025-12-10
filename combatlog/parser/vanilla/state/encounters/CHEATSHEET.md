# Quick Reference Cheat Sheet

## Adding a New Instance (5 Steps)

### 1. Create Directory
```bash
mkdir -p instances/yourinstance
```

### 2. Create `instance.go`
```go
package yourinstance

import (
    "log/slog"
    "github.com/Emyrk/chronicle/combatlog/parser/types/zone"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

type YourInstance struct {
    logger     *slog.Logger
    db         *unitdb.Units
    encounters []encounters.Encounter
    fights     *encounters.Fights
    currentEncounter encounters.Encounter
}

func New(logger *slog.Logger, db *unitdb.Units, z zone.Zone) *YourInstance {
    inst := &YourInstance{
        logger: logger,
        db:     db,
        fights: encounters.NewFights(logger, db, z),
    }
    
    inst.encounters = []encounters.Encounter{
        NewBoss1Encounter(),
        NewBoss2Encounter(),
    }
    
    return inst
}

func (y *YourInstance) Name() string {
    return "Your Instance Name"
}

func (y *YourInstance) MatchesZone(z zone.Zone) bool {
    return z.Name == "Zone Name From Game"
}

func (y *YourInstance) Process(m messages.Message) error {
    if err := y.fights.Process(m); err != nil {
        return err
    }
    
    if y.fights.CurrentFight != nil && y.fights.CurrentFight.IsStarted() {
        y.detectEncounter(m)
    }
    
    return nil
}

func (y *YourInstance) detectEncounter(m messages.Message) {
    if y.currentEncounter != nil {
        return
    }
    
    for _, enc := range y.encounters {
        if enc.Detect(y.fights.CurrentFight, m) {
            y.currentEncounter = enc
            y.logger.Info("detected encounter", slog.String("encounter", enc.Name()))
            enc.OnStart(y.fights.CurrentFight)
            break
        }
    }
}

func (y *YourInstance) Encounters() []encounters.Encounter {
    return y.encounters
}

func (y *YourInstance) CurrentEncounter() encounters.Encounter {
    return y.currentEncounter
}

func (y *YourInstance) AllFights() []*encounters.Fight {
    return y.fights.Fights
}
```

### 3. Create `encounters.go`
```go
package yourinstance

import "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"

const (
    BossBoss1 = "Boss Name From Game"
    BossBoss2 = "Second Boss Name"
)

func NewBoss1Encounter() encounters.Encounter {
    return encounters.NewBaseEncounter(
        "Boss One",
        encounters.EncounterRules{
            BossNames:      []string{BossBoss1},
            MinPlayers:     5,  // or 10, 20, 40 for raids
            TimeoutSeconds: 45,
        },
    )
}

func NewBoss2Encounter() encounters.Encounter {
    return encounters.NewBaseEncounter(
        "Boss Two",
        encounters.EncounterRules{
            BossNames:            []string{BossBoss2},
            AdditionalEnemyNames: []string{"Boss Two's Add"},
            MinPlayers:           5,
            TimeoutSeconds:       60,
        },
    )
}
```

### 4. Register in `registry.go`
```go
func DefaultRegistry(logger *slog.Logger) *Registry {
    r := NewRegistry(logger)
    
    r.Register("Your Instance", yourinstance.New)
    
    return r
}
```

### 5. Done! 🎉

## Common Patterns

### Simple Boss (Dies When HP = 0)
```go
NewBaseEncounter("Boss Name", EncounterRules{
    BossNames: []string{"Boss Name"},
    MinPlayers: 5,
    TimeoutSeconds: 45,
})
```

### Multi-Boss Fight
```go
NewBaseEncounter("Twin Emperors", EncounterRules{
    BossNames: []string{
        "Emperor Vek'lor",
        "Emperor Vek'nilash",
    },
    MinPlayers: 40,
    TimeoutSeconds: 90,
})
```

### Boss With Adds
```go
NewBaseEncounter("Boss With Adds", EncounterRules{
    BossNames: []string{"Main Boss"},
    AdditionalEnemyNames: []string{
        "Boss's Pet",
        "Boss's Minion",
    },
    MinPlayers: 10,
    TimeoutSeconds: 60,
})
```

### Custom Success Condition
```go
NewBaseEncounter("Complex Boss", EncounterRules{
    BossNames: []string{"Complex Boss"},
    SuccessCondition: func(f *encounters.Fight) bool {
        // Custom logic
        // Return true when encounter is won
        return checkCustomCondition(f)
    },
    MinPlayers: 40,
    TimeoutSeconds: 120,
})
```

### Custom Encounter Class
```go
type CustomEncounter struct {
    *encounters.BaseEncounter
    phaseNumber int
}

func NewCustomEncounter() *CustomEncounter {
    return &CustomEncounter{
        BaseEncounter: encounters.NewBaseEncounter(...),
    }
}

func (c *CustomEncounter) OnStart(f *encounters.Fight) error {
    c.phaseNumber = 1
    return nil
}

func (c *CustomEncounter) OnEnd(f *encounters.Fight, result encounters.FightResult) error {
    // Log stats, achievements, etc.
    return nil
}
```

## Zone Names Reference

Common zone names to use in `MatchesZone()`:

```go
// 5-Man Dungeons
"Scarlet Monastery"
"Stratholme"
"Scholomance"
"Shadowfang Keep"
"Deadmines"

// Raids
"Molten Core"
"Blackwing Lair"
"Onyxia's Lair"
"Zul'Gurub"
"Ruins of Ahn'Qiraj"
"Temple of Ahn'Qiraj"
"Naxxramas"
```

## Debugging Tips

### Enable Debug Logging
```go
logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelDebug,
}))
```

### Check Current Zone
```go
func (s *State) Zone(z messages.Zone) {
    s.logger.Info("zone change",
        slog.String("zone", z.Name),
        slog.Uint64("instance_id", uint64(z.InstanceID)),
    )
}
```

### Test Encounter Detection
```go
func TestEncounterDetection(t *testing.T) {
    enc := NewBossEncounter()
    
    // Create a fight with the boss in it
    fight := createTestFight(t)
    addUnitToFight(fight, "Boss Name")
    
    msg := createTestMessage(t)
    
    if !enc.Detect(fight, msg) {
        t.Error("Should detect boss")
    }
}
```

## Common Mistakes

❌ **Wrong zone name**
```go
MatchesZone(z zone.Zone) bool {
    return z.Name == "SM Cathedral" // ❌ Too short
}
```

✅ **Correct**
```go
MatchesZone(z zone.Zone) bool {
    return z.Name == "Scarlet Monastery" // ✅ Full name
}
```

❌ **Not checking for nil**
```go
func (i *Instance) Process(m messages.Message) error {
    i.currentEncounter.OnStart(fight) // ❌ Could be nil
}
```

✅ **Correct**
```go
func (i *Instance) Process(m messages.Message) error {
    if i.currentEncounter != nil {
        i.currentEncounter.OnStart(fight) // ✅ Safe
    }
}
```

## Help & Resources

- **Full Usage Guide**: See `README.md`
- **Architecture Details**: See `DESIGN.md`
- **Visual Diagrams**: See `STRUCTURE.md`
- **Working Example**: See `instances/smcathedral/`
