# GUID Package

Go implementation of World of Warcraft GUID (Globally Unique Identifier) utilities.

## Overview

This package provides methods for working with WoW GUIDs, which are 64-bit unsigned integers that encode information about game entities. The GUID structure consists of:

- **High bits (16 bits)**: Entity type identifier
- **Entry (24 bits)**: Entity entry ID (for creatures/pets/vehicles)
- **Counter (24 bits)**: Unique counter

## Usage

```go
import "github.com/chronicle/golangformat/golang/wowlogs/guid"

// Create a player GUID
playerGUID := guid.GUID(0x0000000000000001)
if playerGUID.IsPlayer() {
    fmt.Println("This is a player")
}

// Create a creature GUID with entry ID 12345
creatureGUID := guid.GUID(0x0030003039000001)
if entry, ok := creatureGUID.GetEntry(); ok {
    fmt.Printf("Creature entry: %d\n", entry)
}
```

## Methods

- `GetHigh() uint16` - Returns the high 16 bits of the GUID
- `IsPlayer() bool` - Returns true if the GUID represents a player
- `IsPet() bool` - Returns true if the GUID represents a pet
- `IsCreature() bool` - Returns true if the GUID represents a creature
- `IsVehicle() bool` - Returns true if the GUID represents a vehicle
- `IsAnyCreature() bool` - Returns true if the GUID represents any type of creature (creature, pet, or vehicle)
- `IsUnit() bool` - Returns true if the GUID represents a unit (any creature or player)
- `GetEntry() (uint32, bool)` - Returns the entry ID for creatures, or (0, false) if not a creature

## Key Differences from Rust

The Rust implementation uses a trait on `u64`, while the Go implementation uses a custom type `GUID` based on `uint64`:

### Rust
```rust
impl GUID for u64 {
    fn get_entry(&self) -> Option<u32> {
        // Returns Option<u32>
    }
}
```

### Go
```go
type GUID uint64

func (g GUID) GetEntry() (uint32, bool) {
    // Returns (value, ok) tuple
}
```

Go uses the idiomatic `(value, ok)` pattern instead of `Option<T>`, and methods use receiver syntax rather than trait implementation.
