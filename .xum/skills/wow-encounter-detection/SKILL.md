---
name: wow-encounter-detection
description: |
  Documents Chronicle's WoW encounter/instance detection system for Turtle WoW and Vanilla WoW.
  Covers registering raid instances, defining bosses and trash mobs via Identity maps, creating
  boss-specific Character handlers with custom mechanics (multi-phase, add tracking), and zone
  parsing from combat logs. Key patterns: CommonFactory for simple instances, characterFactory
  for boss behaviors, Identity struct for hostile classification.
---

# WoW Encounter Detection

## When to Use This Skill

Use this skill when:
- Adding support for a new raid or dungeon instance
- Defining new bosses, adds, or trash mobs
- Implementing custom boss mechanics (multi-phase, add tracking, special death conditions)
- Debugging encounter start/end detection issues
- Understanding how fights are tracked and finalized

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Combat Log Parser                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Registry (registry/registry.go)                                    │
│  - Maps zone names → Instance factories                             │
│  - DefaultRegistry() registers all known instances                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Instance (instances/common.go)                                     │
│  - Owns Characters collection and Identifier                        │
│  - Processes messages, tracks fights, finalizes encounters          │
└─────────────────────────────────────────────────────────────────────┘
           │                                    │
           ▼                                    ▼
┌────────────────────────┐        ┌─────────────────────────────────┐
│  Identifier            │        │  Characters (character/lookup)  │
│  (instances/instance)  │        │  - Creates Character per GUID   │
│  - Maps Entry ID →     │        │  - Factories for special bosses │
│    Identity            │        │  - Tracks activity state        │
│  - Boss/Trash/Hostile  │        └─────────────────────────────────┘
└────────────────────────┘                      │
                                                ▼
                                  ┌─────────────────────────────────┐
                                  │  Character (character/*.go)     │
                                  │  - Processes messages           │
                                  │  - Tracks activity periods      │
                                  │  - Custom boss logic            │
                                  └─────────────────────────────────┘
```

### Key Types

| Type | Location | Purpose |
|------|----------|---------|
| `Instance` | `instances/instance.go` | Interface for dungeon/raid instances |
| `Common` | `instances/common.go` | Default instance implementation |
| `CommonFactory` | `instances/common.go` | Factory for creating instances |
| `Identity` | `instances/instance.go` | Hostile classification (boss/trash) |
| `Identifier` | `instances/instance.go` | Maps creature entry IDs to Identity |
| `Character` | `character/character.go` | Interface for trackable units |
| `Characters` | `character/lookup.go` | Registry + factory dispatch |

### Data Flow

1. **Zone Change**: Parser emits `ZONE_INFO` → Registry finds matching Instance
2. **Message Processing**: Instance receives messages → dispatches to Characters
3. **Activity Tracking**: Characters track when hostiles become active/inactive
4. **Fight Detection**: Instance monitors character activity changes → groups into fights
5. **Finalization**: Instance produces `Encounter` objects with kill/wipe status

## Adding a New Raid Instance (Workflow)

### Step 1: Define Hostiles in `instances/hostiles.go`

```go
func MyRaidHostiles() map[uint32]Identity {
    hostile := make(map[uint32]Identity)
    
    // Trash mobs - just marked hostile, no encounter name
    LoadAdds(hostile, map[uint32]string{
        12345: "Trash Mob A",
        12346: "Trash Mob B",
    })
    
    // Bosses - hostile + named encounter + boss flag
    LoadBosses(hostile, map[uint32]string{
        99001: "First Boss",
        99002: "Second Boss",
    })
    
    return hostile
}
```

### Step 2: Create Instance Factory in `instances/instances.go`

```go
var MyRaid = (&CommonFactory{
    Name:     "My Raid",           // Display name
    ZoneName: "my raid",           // Lowercase zone name from combat log
    Hostiles: FromMap(MyRaidHostiles()),
}).New
```

### Step 3: Register in `registry/registry.go`

```go
func DefaultRegistry(logger *slog.Logger) *Registry {
    r := NewRegistry(logger)
    
    // ... existing instances ...
    
    // Register your new raid
    r.Register(wrap(instances.MyRaid))
    
    // Or with a comment about limitations:
    r.RegisterWithComment(wrap(instances.MyRaid), "Only supports normal mode")
    
    return r
}
```

### Complete Example: Adding Onyxia's Lair

```go
// instances/hostiles.go
func OnyxiaHostiles() map[uint32]Identity {
    hostile := make(map[uint32]Identity)
    LoadAdds(hostile, map[uint32]string{
        12129: "Onyxian Warder",
        11262: "Onyxian Whelp",
    })
    LoadBosses(hostile, map[uint32]string{
        10184: "Onyxia",
    })
    return hostile
}

// instances/instances.go
var Onyxia = (&CommonFactory{
    Name:     "Onyxia's Lair",
    ZoneName: "onyxia's lair",
    Hostiles: FromMap(OnyxiaHostiles()),
}).New

// registry/registry.go - in DefaultRegistry()
r.Register(wrap(instances.Onyxia))
```

## Defining Bosses and Hostiles

### Identity Struct

```go
type Identity struct {
    Hostile       bool   // Unit is an enemy (true for all raid mobs)
    EncounterName string // If set, names the encounter (usually boss name)
    Boss          bool   // True = boss, determines kill/wipe logic
}
```

### Helper Functions

```go
// LoadAdds - marks units as hostile trash (no encounter name, not a boss)
LoadAdds(hostile, map[uint32]string{
    12345: "Trash Mob",  // Name is for debugging only
})

// LoadBosses - marks units as hostile bosses with encounter name
LoadBosses(hostile, map[uint32]string{
    99001: "Boss Name",  // Name becomes EncounterName
})
```

### Entry ID Sources

Entry IDs are the creature template IDs from the WoW database. For Turtle WoW:
- Check in-game with `/run print(UnitGUID("target"))` - the entry is embedded in the GUID
- Use wowhead classic or turtle wow database sites
- Parse from existing combat logs

### Multi-Unit Encounters

For encounters where multiple units share one encounter name (e.g., High Priest Thekal):

```go
LoadBosses(hostile, map[uint32]string{
    11348: "High Priest Thekal", // Zealot Zath (add)
    11347: "High Priest Thekal", // Zealot Lor'Khan (add)
    14599: "High Priest Thekal", // Thekal himself
})
```

All three units map to the same encounter name.

## Boss-Specific Behavior

For bosses with special mechanics, create a custom Character implementation.

### When to Use Custom Characters

- Boss has phases with immunity/submerge (e.g., Ragnaros)
- Encounter ends when adds die, not the boss (e.g., Majordomo)
- Boss transforms or spawns a new unit (e.g., Sneed's Shredder)
- Special death timing (e.g., Core Hounds respawning)

### Factory Pattern

Custom characters are registered in `character/lookup.go`:

```go
var characterFactories = []characterFactory{
    // Global handlers (checked first)
    NewTotemCharacter,
    NewCritterCharacter,
    
    // Instance-specific (by entry ID)
    NewRagnarosCharacter,
    NewMajordomoPartyCharacter,
    // ... etc
}
```

### Simple Example: Ragnaros (Extended Death Timer)

```go
// character/ragnaros.go
func NewRagnarosCharacter(id guid.GUID, all *Characters) (Character, bool) {
    if !id.IsCreature() {
        return nil, false
    }
    
    entry, ok := id.GetEntry()
    if !ok {
        return nil, false
    }
    
    if entry != 11502 { // Ragnaros entry ID
        return nil, false
    }
    
    c := NewCommonCharacter(id, all)
    // Ragnaros can "die" and submerge - extend the death timer
    c.SetRecentlySlainDuration(time.Second * 15)
    return c, true
}
```

### Complex Example: Majordomo (Add-Based Encounter)

Majordomo doesn't die - encounter ends when all 8 adds die:

```go
// character/majordomo.go
type MajordomoParty struct {
    *Common
    all         *Characters
    isMajordomo bool
    party       map[guid.GUID]Character // Track the 8 adds
}

func NewMajordomoPartyCharacter(id guid.GUID, all *Characters) (Character, bool) {
    entry, ok := id.GetEntry()
    if !ok {
        return nil, false
    }
    
    isMajordomo := false
    switch entry {
    case flamewakerElite, flamewakerHealer:
        // Add - joins the party
    case majorDomoEntry:
        isMajordomo = true
    default:
        return nil, false
    }
    
    return &MajordomoParty{
        Common:      NewCommonCharacter(id, all),
        all:         all,
        isMajordomo: isMajordomo,
        party:       make(map[guid.GUID]Character),
    }, true
}

func (c *MajordomoParty) Process(m messages.Message) error {
    // ... track adds joining, check if all 8 are dead ...
    if allAddsDead {
        c.Died("all_adds_dead", m)
    }
}
```

### Character Interface

```go
type Character interface {
    ID() guid.GUID
    String() string
    Died(reason string, m messages.Message)
    Process(m messages.Message) error
    Periods() []period.Period
    RecentlySlain(m messages.Message) bool
    IsActive() bool
    CurrentPeriod() (period.Period, bool)
}
```

## Zone Parsing

Zones are parsed from `ZONE_INFO:` lines in the combat log:

```
ZONE_INFO:<timestamp>&<zone_name>&<instance_id>
```

Example: `ZONE_INFO:1706745600&molten core&12345`

### Zone Struct

```go
type Zone struct {
    Seen       time.Time  // When the zone was entered
    Name       string     // Lowercase zone name
    InstanceID uint32     // Unique instance ID
}
```

### Zone Matching

Instances match zones by lowercase name comparison:

```go
func (c *Common) MatchesZone(z zone.Zone) bool {
    return strings.ToLower(z.Name) == c.zoneNameMatch
}
```

**Important**: Zone names in `CommonFactory` must be lowercase.

## Fight Detection Logic

### Fight Lifecycle

1. **Start**: First hostile becomes active (takes/deals damage)
2. **Tracking**: More hostiles join via activity
3. **End**: All tracked hostiles become inactive (killed or timed out)
4. **Finalization**: Determine kill type, name encounter

### Kill Types

```go
const (
    KillTypeClean   // All hostiles killed
    KillTypePartial // Boss killed, some adds lived
    KillTypeWipe    // Boss still alive (or hostile remaining)
)
```

### Activity Timeout

Characters become inactive after 60 seconds without activity:

```go
const InactivityTimeout = time.Second * 60
```

This handles:
- Boss resets (no damage for 60s → encounter ends as wipe)
- Add despawns
- Combat drops

## Anti-Patterns

### Don't Hard-Code Outside Factories

❌ **Bad**: Checking entry IDs directly in `Common.Process()`
```go
func (c *Common) Process(m messages.Message) error {
    if entryID == 12018 { // Majordomo check - BAD!
        // special handling
    }
}
```

✅ **Good**: Use `characterFactory` registration
```go
// In character/lookup.go
var characterFactories = []characterFactory{
    NewMajordomoPartyCharacter,
}
```

### Don't Forget to Register

Every new instance needs **both**:
1. Hostiles function in `hostiles.go`
2. Factory variable in `instances.go`
3. Registration in `registry.go`

### Don't Use Mixed Case Zone Names

❌ **Bad**:
```go
ZoneName: "Molten Core",
```

✅ **Good**:
```go
ZoneName: "molten core",
```

### Don't Forget Boss Flag

Bosses need `Boss: true` to affect kill/wipe detection:

❌ **Bad**: Boss without flag
```go
LoadAdds(hostile, map[uint32]string{
    10184: "Onyxia", // Treated as trash!
})
```

✅ **Good**: Use LoadBosses
```go
LoadBosses(hostile, map[uint32]string{
    10184: "Onyxia",
})
```

## Testing

### Test Files

- `character/*_test.go` - Unit tests for character handlers
- `registry/registry_test.go` - Instance registration tests

### Testing Custom Characters

```go
func TestMajordomoParty(t *testing.T) {
    db := unitdb.New()
    chars := character.NewCharacters(db)
    
    // Create character via factory
    majordomoID := guid.NewCreature(majorDomoEntry, 1)
    char, ok := character.NewMajordomoPartyCharacter(majordomoID, chars)
    require.True(t, ok)
    
    // Process messages and verify behavior
    // ...
}
```

## File Reference

| File | Purpose |
|------|---------|
| `registry/registry.go` | Instance factory registration |
| `instances/instances.go` | Instance factory definitions |
| `instances/hostiles.go` | Hostile identity maps per instance |
| `instances/common.go` | Common instance implementation |
| `instances/instance.go` | Instance interface + Identity/Identifier |
| `character/lookup.go` | Character factory dispatch |
| `character/character.go` | Base Character interface |
| `character/common.go` | Default character implementation |
| `character/*.go` | Boss-specific handlers |
| `types/zone/zoneinfo.go` | Zone parsing |
