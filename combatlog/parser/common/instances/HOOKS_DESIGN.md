# Refactor CommonFactory to Support Lifecycle Hooks

## Context & Goal

**Why:** We want to add loot tracking (and other future features) to instances. Currently, `CommonFactory` is purely declarative — it takes a name, zone matcher, and hostiles map, and that's it. There's no way to inject custom behavior at key lifecycle points (fight start/end, character state changes, message processing). Guild and SpellBook trackers are hardcoded in `Common.Process()`.

**Goal:** Add a hook system to `CommonFactory` so instance-specific behavior (like loot collection, custom event tracking, etc.) can be plugged in without modifying `Common` itself.

## Current Architecture

```
CommonFactory { Name, ZoneName, Hostiles }
       ↓
  Common.Process(msg)
       ├─ Characters.Process(msg)     → activity change detection
       ├─ FightDetectionHandler(msg)  → fight start/end (only on activity change)
       │   ├─ creates OngoingFight
       │   └─ calls finalizeFight()   → Fight completed
       ├─ Guild.Process(msg)          → hardcoded tracker
       └─ SpellBook.Process(msg)      → hardcoded tracker
```

**Key observation:** Guild and SpellBook are already "trackers" with a `Process(messages.Message) error` signature. They're just bolted on directly rather than registered via the factory.

## Proposed Design: Composable Hooks on CommonFactory

### Core Idea: A `Hooks` struct on `CommonFactory`

Add optional lifecycle callbacks to `CommonFactory`. All hooks are `nil` by default — zero overhead for simple instances, no changes needed to existing `instances.go` registrations.

```go
// InstanceHook can observe and react to instance lifecycle events.
// Implementations must be safe for the single-threaded message processing loop.
type InstanceHook interface {
    // ProcessMessage is called for every message in the instance.
    // Called after Characters.Process but before fight detection.
    ProcessMessage(m messages.Message) error
    
    // FightStarted is called when a new fight begins (first hostile becomes active).
    FightStarted(fight *OngoingFight, m messages.Message)
    
    // FightEnded is called when a fight is finalized (all hostiles inactive).
    FightEnded(fight Fight)
    
    // CharacterActive is called when a hostile character transitions to active.
    CharacterActive(id guid.GUID, c character.Character, m messages.Message)
    
    // CharacterInactive is called when a hostile character transitions to inactive.
    CharacterInactive(id guid.GUID, c character.Character, m messages.Message)
}
```

Then on `CommonFactory`:

```go
type CommonFactory struct {
    Name     string
    ZoneName func(z string) bool
    Hostiles func() *Identifier
    
    // Hooks are optional lifecycle observers.
    // They are called in order during message processing.
    Hooks []func() InstanceHook  // Factory functions, like Hostiles
}
```

### Why an interface, not individual function fields?

1. **Grouping** — A loot tracker needs both `ProcessMessage` (to see loot events) and `FightEnded` (to associate loot with encounters). An interface keeps related logic together.
2. **State** — Hooks are stateful (e.g., loot tracker accumulates items). An interface implementation holds its own state.
3. **Testability** — Easy to mock/stub in tests.
4. **Future growth** — Adding a new lifecycle method is backward-compatible via a default no-op base struct.

### Convenience: `BaseHook` embed for partial implementations

```go
// BaseHook provides no-op implementations of all InstanceHook methods.
// Embed it to only override what you need.
type BaseHook struct{}

func (BaseHook) ProcessMessage(messages.Message) error { return nil }
func (BaseHook) FightStarted(*OngoingFight, messages.Message) {}
func (BaseHook) FightEnded(Fight) {}
func (BaseHook) CharacterActive(guid.GUID, character.Character, messages.Message) {}
func (BaseHook) CharacterInactive(guid.GUID, character.Character, messages.Message) {}
```

### Refactor Guild & SpellBook as hooks

Guild and SpellBook already follow the `Process(msg) error` pattern. They become the first two hooks, moved out of hardcoded `Common.Process()`:

```go
// In CommonFactory.New():
hooks := []InstanceHook{
    guild.New(),       // always present
    spellbook.New(),   // always present
}
for _, hf := range f.Hooks {
    hooks = append(hooks, hf())
}
```

This way `Guild` and `SpellBook` are still always present, but they're no longer special-cased.

### Where hooks fire in Common.Process()

```go
func (c *Common) Process(m messages.Message) error {
    // ... existing unit DB updates ...
    
    // 1. Characters.Process — activity detection
    actChange, err := c.Characters.Process(m)
    
    // 2. Hook: ProcessMessage (every message)
    for _, h := range c.hooks {
        if err := h.ProcessMessage(m); err != nil {
            return err
        }
    }
    
    // 3. Fight detection (on activity change)
    if actChange {
        // Before fight detection: fire CharacterActive/Inactive hooks
        // (detected by comparing previous active set with current)
        c.fireActivityHooks(m)
        
        err = c.FightDetectionHandler(m)
        // FightDetectionHandler now calls:
        //   - hook.FightStarted() when OngoingFight is first created with a Start
        //   - hook.FightEnded() after finalizeFight()
    }
    
    // ... event recording for current fight ...
    
    return nil
}
```

### How this enables loot tracking

```go
// Future: loot/tracker.go
type LootTracker struct {
    BaseHook
    items []LootItem
    currentFightID uuid.UUID
}

func (t *LootTracker) ProcessMessage(m messages.Message) error {
    if loot, ok := m.(*messages.Loot); ok {
        t.items = append(t.items, LootItem{
            FightID: t.currentFightID,
            // ... item details ...
        })
    }
    return nil
}

func (t *LootTracker) FightStarted(f *OngoingFight, m messages.Message) {
    t.currentFightID = f.EncounterID
}
```

## Implementation Steps

### Step 0: Golden file regression test (do first)

Add a golden file test so we can refactor `Common` with confidence. Uses the existing `gentest` pattern from `scripts/gentest/gentest.go`.

**Input:** Existing committed testdata via relative path from `instances/`:
- `../character/testdata/scholotutor/WoWCombatLog.txt` (2706 lines, Scholomance run — already in repo)

We reference the existing fixtures rather than copying them. The `gentest` framework isn't a great fit here (it expects `testdata/` subdirs with golden files inside each), so we write a standalone test with the same `-update` flag pattern.

**Golden output:** Deterministic text summary of each `FinalizedInstance`. Modeled after `Encounter.NamedString()` but with **stable sort order** (hostiles sorted by GUID string).

#### Files to create

| File | Purpose |
|------|---------|
| `instances/golden_test.go` | Test + deterministic serializer |
| `instances/testdata/scholotutor.golden` | Golden file (generated with `-update`) |

#### Test implementation sketch

```go
// golden_test.go
package instances_test

import (
    "bytes"
    "context"
    "flag"
    "fmt"
    "io"
    "log/slog"
    "os"
    "sort"
    "strings"
    "testing"

    "github.com/Emyrk/chronicle/combatlog/consumers"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
    "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
    "github.com/stretchr/testify/require"
)

var updateGolden = flag.Bool("update", false, "Update golden files")

// Fixtures reference existing committed testdata via relative path.
var goldenFixtures = []struct {
    name string
    path string
}{
    {"scholotutor", "../character/testdata/scholotutor/WoWCombatLog.txt"},
}

func TestGoldenEncounters(t *testing.T) {
    t.Parallel()
    for _, fx := range goldenFixtures {
        t.Run(fx.name, func(t *testing.T) {
            t.Parallel()
            output := parseAndSerialize(t, fx.path)
            goldenPath := fmt.Sprintf("testdata/%s.golden", fx.name)

            if *updateGolden {
                os.MkdirAll("testdata", 0755)
                require.NoError(t, os.WriteFile(goldenPath, []byte(output), 0644))
                return
            }

            expected, err := os.ReadFile(goldenPath)
            require.NoError(t, err, "golden file missing — run with -update")
            require.Equal(t, strings.TrimSpace(string(expected)), strings.TrimSpace(output))
        })
    }
}

func parseAndSerialize(t *testing.T, path string) string {
    t.Helper()
    ctx := context.Background()
    logger := slog.New(slog.NewTextHandler(io.Discard, nil))

    data, err := os.ReadFile(path)
    require.NoError(t, err)

    p, err := vanilla.New(logger, bytes.NewReader(data), nil)
    require.NoError(t, err)

    state := encounters.New(ctx, logger)
    c := consumers.New(logger, state)
    require.NoError(t, c.ConsumeAll(ctx, p))

    var out strings.Builder
    for _, inst := range state.Instances {
        finalized, err := inst.Finalize(ctx)
        require.NoError(t, err)
        serializeInstance(&out, inst.Name(), finalized, state.Units)
    }
    return out.String()
}

func serializeInstance(w *strings.Builder, name string, fi *instances.FinalizedInstance, ...) {
    // Instance header
    fmt.Fprintf(w, "Instance: %s\n", name)
    if fi.Realm != nil {
        fmt.Fprintf(w, "Realm: %s\n", fi.Realm.RealmName)
    }
    fmt.Fprintf(w, "Encounters: %d\n", len(fi.Encounters))

    for i, enc := range fi.Encounters {
        fmt.Fprintf(w, "---\n")
        fmt.Fprintf(w, "[%d] %s %q (kill=%s, boss=%v)\n", i, enc.Type, enc.Name, enc.KillType, enc.Boss)
        fmt.Fprintf(w, "  Start: %s End: %s\n",
            enc.Combat.Start.Format("15:04:05.000"),
            enc.Combat.End.Format("15:04:05.000"))

        // Sort hostiles by GUID for determinism
        guids := make([]string, 0, len(enc.Combat.Hostiles))
        for g := range enc.Combat.Hostiles {
            guids = append(guids, g.String())
        }
        sort.Strings(guids)

        fmt.Fprintf(w, "  Hostiles (%d):\n", len(enc.Combat.Hostiles))
        for _, gs := range guids {
            // ... parse GUID back, lookup CharacterFight, print periods + endState
        }
        fmt.Fprintf(w, "  PlayerDeaths: %d\n", len(enc.Combat.PlayerDeaths))
    }
}
```

#### Key design decisions

- **Text, not JSON** — `EncounterID` is `uuid.New()` (random per run). Text format omits it. Diffs are more readable.
- **Sort by GUID string** — Go map iteration is random; must sort for determinism.
- **Reuse existing testdata** — No need to copy/commit new log files.
- **`-update` flag** — Same pattern as `gentest`. Run `go test -update` to regenerate.
- **Activity periods** — Include start/end time and `EndState` for each hostile period (catches regressions in fight detection).

#### Running the test

```bash
# Generate initial golden file:
go test ./combatlog/parser/vanilla/state/encounters/instances/ -run TestGoldenEncounters -update

# Verify (after refactoring):
go test ./combatlog/parser/vanilla/state/encounters/instances/ -run TestGoldenEncounters
```

### Step 1: Define the hook interface and base struct

- **File:** `instances/hooks.go` (new)  
- Add `InstanceHook` interface, `BaseHook` struct

### Step 2: Add hooks to CommonFactory and Common

- **File:** `instances/common.go`
- Add `Hooks []func() InstanceHook` to `CommonFactory`
- Add `hooks []InstanceHook` to `Common`
- In `CommonFactory.New()`: instantiate hooks from factories

### Step 3: Wire hook calls into Common.Process()

- **File:** `instances/common.go`
- Call `ProcessMessage` for all hooks after `Characters.Process()`
- Call `FightStarted`/`FightEnded` from `FightDetectionHandler`/`finalizeFight`
- Call `CharacterActive`/`CharacterInactive` when activity changes are detected

### Step 4: Migrate Guild and SpellBook to hooks

- Make `guild.Tracker` and `spellbook.Tracker` implement `InstanceHook` (via `BaseHook` embed)
- Remove hardcoded `Guild.Process()` / `SpellBook.Process()` from `Common.Process()`
- Register them as default hooks in `CommonFactory.New()`
- Keep `Common.Guild` and `Common.SpellBook` fields pointing to the same instances (for `Finalize()` access)

### Step 5: Add hooks to FinalizedInstance

- **File:** `instances/common.go`
- Add `Hooks []InstanceHook` to `FinalizedInstance` so downstream consumers can access hook state (e.g., loot tracker results)

### Step 6: Verify golden file test still passes (green phase)

- Run `go test ./combatlog/parser/vanilla/state/encounters/instances/ -run TestCommonGolden`
- Golden output must be byte-identical before and after the refactor
- All 20+ instances in `instances.go` continue to work unchanged (no `Hooks` field = no extra hooks beyond Guild/SpellBook)

## Alternative Considered

<details>
<summary>Function fields instead of interface</summary>

Could use individual function fields on CommonFactory:
```go
OnFightStarted func(fight *OngoingFight)
OnFightEnded   func(fight Fight)
```

**Rejected because:** Hooks need state (accumulating loot, tracking per-fight data). You'd end up with closures over external state, which is messier than a proper interface. Also doesn't group related callbacks together — a loot tracker that needs both ProcessMessage and FightEnded would be split across multiple fields.
</details>

<details>
<summary>Event emitter / pub-sub pattern</summary>

Could use a generic event bus: `common.On("fight.started", handler)`.

**Rejected because:** Over-engineered for the use case. We have a fixed, small set of lifecycle events. A typed interface gives compile-time safety and discoverability. An event bus loses both.
</details>
