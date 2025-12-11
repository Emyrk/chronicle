# Fight Aggregator - Quick Start Guide

## Installation

The fight aggregator is already integrated into your codebase at:
```
combatlog/parser/vanilla/state/encounters/instances/smcathedral/
```

## Basic Usage (3 Steps)

### 1. Import the Package

```go
import (
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/smcathedral"
)
```

### 2. Get Your Characters Data

Assume you already have `characters` from parsing:
```go
characters := encounters.NewCharacters()
// ... your combat log parsing populates this ...
```

### 3. Aggregate Fights

```go
fights := smcathedral.AggregateFights(characters)

for i, fight := range fights {
    fmt.Printf("Fight %d: %v to %v (%v duration)\n", 
        i+1, fight.Start, fight.End, fight.End.Sub(fight.Start))
    fmt.Printf("  %d hostiles participated\n", len(fight.Hostiles))
}
```

## Common Use Cases

### Get Fight Duration

```go
for _, fight := range fights {
    duration := fight.End.Sub(fight.Start)
    fmt.Printf("Fight lasted: %v\n", duration)
}
```

### List All Hostiles in a Fight

```go
for _, fight := range fights {
    for _, hostile := range fight.Hostiles {
        fmt.Printf("Hostile %s participated\n", hostile.ID)
        fmt.Printf("  Had %d activity periods\n", len(hostile.Activity))
        
        for _, activity := range hostile.Activity {
            start := activity.Start.Timestamp.Date()
            end := activity.End.Timestamp.Date()
            fmt.Printf("    Active: %v to %v\n", start, end)
        }
    }
}
```

### Custom Cooldown Period

Need a different cooldown? Use `AggregateFightsWithCooldown`:

```go
// 30-second cooldown instead of default 60 seconds
cooldown := 30 * time.Second
fights := smcathedral.AggregateFightsWithCooldown(characters, cooldown)
```

### Count Fights

```go
fightCount := len(fights)
fmt.Printf("Total fights: %d\n", fightCount)
```

### Get Fight Statistics

```go
for i, fight := range fights {
    duration := fight.End.Sub(fight.Start)
    hostileCount := len(fight.Hostiles)
    
    // Count total activity periods
    totalPeriods := 0
    for _, hostile := range fight.Hostiles {
        totalPeriods += len(hostile.Activity)
    }
    
    fmt.Printf("Fight %d Stats:\n", i+1)
    fmt.Printf("  Duration: %v\n", duration)
    fmt.Printf("  Hostiles: %d\n", hostileCount)
    fmt.Printf("  Total Activity Periods: %d\n", totalPeriods)
}
```

## What Gets Included?

✓ Only hostile creatures (from `CathedralHostiles()`)
✓ Only completed activity periods (have both start and end)
✓ Activities within 60s cooldown are grouped together
✗ Players are excluded
✗ Non-hostile creatures are excluded
✗ Incomplete activity periods are excluded

## Default Behavior

- **Cooldown**: 60 seconds
- **Hostile List**: Defined in `CathedralHostiles()`
- **Grouping**: Activities starting within cooldown → same fight
- **Ordering**: Hostiles sorted by GUID for consistency

## Running Tests

```bash
cd combatlog/parser/vanilla/state/encounters/instances/smcathedral
go test -v
```

## Need Help?

- See `README.md` for detailed documentation
- See `fights_example_test.go` for more examples
- See `ARCHITECTURE_DIAGRAM.md` for system design

## Common Pitfalls

❌ **Don't** call before activity periods are complete
❌ **Don't** expect ongoing fights (without End times)
❌ **Don't** expect non-hostile creatures to be included

✅ **Do** call after parsing is complete
✅ **Do** check for nil/empty results
✅ **Do** use the cooldown parameter for fine-tuning

## Performance

- **Time Complexity**: O(n log n) where n = number of activity periods
- **Space Complexity**: O(n) for storing results
- **Typical Usage**: Instant for thousands of activities

## Type Safety

All types are strongly typed:
- `Fight` - Complete fight encounter
- `CharacterFight` - Per-character participation
- `encounters.Active` - Individual activity periods
- `guid.GUID` - Type-safe creature IDs
