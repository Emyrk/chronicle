# Fight Aggregator for Scarlet Monastery Cathedral

This package provides fight aggregation functionality for Scarlet Monastery Cathedral encounters.

## Overview

The fight aggregator takes character activity data and groups it into separate combat encounters (fights). It uses the following logic:

1. **Filter Hostiles**: Only creatures matching the hostile entry IDs from `CathedralHostiles()` are considered
2. **Group by Overlap**: Activity periods that overlap or occur within a cooldown window are grouped into the same fight
3. **Track All Periods**: Each character can have multiple activity periods within a fight (e.g., if they die and respawn)

## Data Structures

### Fight

Represents a single combat encounter:

```go
type Fight struct {
    Hostiles []CharacterFight  // All hostile characters in this fight
    Start    time.Time         // First hostile became active
    End      time.Time         // Last hostile became inactive
}
```

### CharacterFight

Represents all activity periods from a single character within a fight:

```go
type CharacterFight struct {
    ID       guid.GUID            // Character's GUID
    Activity []encounters.Active  // All activity periods for this character in this fight
}
```

## Usage

### Basic Usage

```go
import (
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/smcathedral"
)

// After parsing combat logs and populating characters
characters := encounters.NewCharacters()
// ... populate characters from combat log parsing ...

// Aggregate into fights
fights := smcathedral.AggregateFights(characters)

for i, fight := range fights {
    duration := fight.End.Sub(fight.Start)
    fmt.Printf("Fight %d: %d hostiles, duration: %v\n", 
        i+1, len(fight.Hostiles), duration)
}
```

### Custom Cooldown Period

By default, activities that start within 60 seconds of a fight ending are grouped into the same fight. You can customize this:

```go
// Use a 30-second cooldown
customCooldown := 30 * time.Second
fights := smcathedral.AggregateFightsWithCooldown(characters, customCooldown)
```

## Algorithm

The aggregation algorithm works as follows:

1. **Filter**: Iterate through all characters and filter to only hostile creatures (by checking their Entry ID against `CathedralHostiles()`)

2. **Collect**: Gather all completed activity periods (those with both Start and End times) along with their character IDs

3. **Sort**: Sort all activity periods by start time

4. **Merge**: Iterate through sorted periods and group them into fights:
   - If a period starts within the cooldown window of the current fight's end time, add it to the current fight
   - Otherwise, finalize the current fight and start a new one
   - Track the overall start (earliest) and end (latest) times for each fight

5. **Finalize**: Convert the grouped activities into the final Fight structures

## Cooldown Window

The cooldown window is important for handling:
- Brief pauses in combat
- Mob respawns
- Multiple activity periods from the same creature
- Natural gaps in combat encounters

The default of 60 seconds matches the timeout used in the character activity tracking system.

## Filtering Rules

Only activity periods that meet all these criteria are included:

- Character must be a creature (not a player)
- Character's Entry ID must be in the `CathedralHostiles()` list
- Activity period must be complete (both Start and End are set)

## Examples

See `fights_example_test.go` for complete examples.

## Testing

Run the tests:

```bash
go test -v -run TestAggregateFights
```

The test suite covers:
- Single hostile fights
- Multiple overlapping hostiles
- Separate fights with large gaps
- Multiple activity periods per hostile
- Filtering of non-hostiles
- Handling of incomplete activity periods
- Complex multi-fight scenarios
