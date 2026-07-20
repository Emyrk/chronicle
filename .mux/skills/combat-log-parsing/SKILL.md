---
name: combat-log-parsing
description: |
  Guides working with Chronicle's combat log parser for Classic World of Warcraft (Turtle WoW).
  Use when: adding new event types, debugging parsing failures, understanding GUID formats,
  or working with the vanilla combatlog package. Covers the matcher pattern, message types,
  regex-based parsing, and the 64-bit GUID structure with entity type bits.
---

# Combat Log Parsing

Chronicle parses vanilla WoW combat logs into structured events. The parser handles text-based combat logs from the Turtle WoW private server, converting raw log lines into typed Go structs.

## When to Use This Skill

- Adding support for a new combat log event type
- Debugging why a log line isn't being parsed
- Understanding the GUID format and entity type detection
- Working with message types and their properties
- Modifying regex patterns for log matching

## Architecture Overview

```
io.Reader → Liner → Scanner → Parser → []messages.Message
                ↑                ↓
           CLOCK_INFO      Matcher functions (40+)
           timestamps      try each until match
```

**Key directories:**
```
combatlog/
├── parser/
│   ├── vanilla/
│   │   ├── parser.go      # Main Parser struct, Advance() loop
│   │   ├── matchers.go    # 40+ matcher functions (fDamage*, fHeal, etc.)
│   │   └── messages/
│   │       └── message.go # Message interface + all message types
│   ├── guid/
│   │   └── guid.go        # 64-bit GUID parsing and type detection
│   ├── regexs/
│   │   └── regexs.go      # All regex patterns for matching
│   └── types/
│       ├── constants.go   # HitType, School, Resource enums
│       └── helper.go      # FromRegex() matcher helper
```

## Key Concepts

### GUID Format (64-bit)

GUIDs are 18-character hex strings (`0x` + 16 hex digits) encoding entity type in the high bits:

```
0xF130000844003FB5
  ││││
  │└┴┴─ Entity type in bits 48-51 (0x00F0 mask after rotation)
  └──── High 16 bits
```

**Entity type detection** (see `combatlog/parser/guid/guid.go`):
```go
func (g GUID) GetHigh() uint16 {
    return uint16(bits.RotateLeft64(uint64(g), -48))
}

// Type bits (0x00F0 mask):
// 0x0000 = Player
// 0x0010 = Object (gameobject)
// 0x0030 = Creature
// 0x0040 = Pet
// 0x0050 = Vehicle
```

**Creature entry ID** (24 bits at position 24-47):
```go
func (g GUID) GetEntry() (uint32, bool) {
    if g.IsAnyCreature() || g.IsObject() {
        rotated := bits.RotateLeft64(uint64(g), -24)
        return uint32(rotated & 0x0000000000FFFFFF), true
    }
    return 0, false
}
```

### Message Interface

All parsed events implement `messages.Message` (`combatlog/parser/vanilla/messages/message.go`):

```go
type Message interface {
    isMessage()           // Marker method
    Date() time.Time      // Event timestamp
    Affects() []guid.GUID // GUIDs involved (for encounter detection)
    IsSynthetic() bool    // True if generated, not from log
}
```

**Core message types:**
- `Damage` - All damage events (spell, melee, periodic, environmental)
- `Heal` - Healing events
- `Aura` - Buff/debuff applications and fades
- `SpellGo` - Spell cast completion events (preferred; carries `*chrondbc.Spell`, bare `guid.GUID` fields)
- `Cast` - **Deprecated.** Legacy cast events from CAST: v2 format (uses `types.Unit` wrappers). Use `SpellGo` in new code.
- `Absorbed` - Absorb attribution events (server-reported for AzerothCore, synthetic for vanilla)
- `ResourceChange` - Mana/rage/energy gains/losses
- `Slain` - Death events
- `Interrupt` - Spell interrupts
- `ExtraAttack` - Extra attack procs (Windfury, etc.)

> **Cast vs SpellGo:** The parser now emits `SpellGo` for spell completions. `Cast` is retained
> for backward compatibility but should not be used in new synthetic processors or consumers.
> Key differences: `SpellGo.Caster` is `guid.GUID` (not `types.Unit`), `SpellGo.Target` is
> `*guid.GUID` (not `*types.Unit`), and `SpellGo.SpellData` is `*chrondbc.Spell` (not `types.Spell`).

### Matcher Pattern

Each matcher function in `matchers.go` follows this pattern:

```go
func (p *Parser) fEventName(ts time.Time, content string) ([]messages.Message, error) {
    // 1. Quick rejection (string prefix or regex)
    if !strings.HasPrefix(content, "PREFIX") {
        return messages.NotHandled()  // Returns nil, nil
    }
    
    // 2. Parse with regex or custom parser
    matches, ok := types.FromRegex(regexs.RePattern).Match(content)
    if !ok {
        return messages.NotHandled()
    }
    
    // 3. Extract fields in order
    _, caster := matches.UnitOrGUID()
    amount := matches.Int32()
    // ...
    
    // 4. Check for parse errors
    if err := matches.Error(); err != nil {
        return nil, fmt.Errorf("EventName: %w", err)
    }
    
    // 5. Skip if missing GUIDs (old log format)
    if caster.IsZero() || target.IsZero() {
        return messages.Skip(ts, "EventName: not using guids"), nil
    }
    
    // 6. Return message
    return set(messages.SomeMessage{
        MessageBase: messages.Base(ts),
        // ... fields
    }), nil
}
```

**Important:** Matchers are tried in order (see `parser.go` lines 182-241). Put specific matchers before general ones.

### Regex Helper

The `types.FromRegex()` helper provides sequential field extraction:

```go
matches, ok := types.FromRegex(regexs.ReDamageSpellHitOrCrit).Match(content)
if !ok {
    return messages.NotHandled()
}

// Extract in capture group order:
_, caster := matches.UnitOrGUID()  // Group 1: "0xF130..." or "Ragnaros"
spellName := matches.String()      // Group 2: "Fireball"
hitType := matches.ShortHitType()  // Group 3: "cr" or "h"
_, target := matches.UnitOrGUID()  // Group 4
amount := matches.Int32()          // Group 5
trailer := matches.Trailer()       // Group 6: "(15 absorbed)"
```

## Adding a New Event Type (Workflow)

### Step 1: Identify the Log Format

Find example lines from actual combat logs:
```
11/18 07:21:45.192  0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage.
```

### Step 2: Create the Regex

Add to `combatlog/parser/regexs/regexs.go`:
```go
ReNewEventType = regexp.MustCompile(`(.+[^\\s])'s (.+[^\\s]) (cr|h)its (.+[^\\s]) for (\\d+) ([a-zA-Z]+) damage\\.\\s?(.*)`)
```

**Regex tips:**
- Use `(.+[^\\s])` for unit/GUID captures (handles both names and `0x...`)
- Use `\\s?(.*)` at end for optional trailer (absorbed/blocked/resisted)
- Test with `regexp.MustCompile` to catch syntax errors at startup

### Step 3: Create Message Type (if needed)

If existing types don't fit, add to `combatlog/parser/vanilla/messages/message.go`:
```go
type NewEvent struct {
    MessageBase
    Caster    guid.GUID
    Target    guid.GUID
    SpellName string
    Amount    int32
}

func (n NewEvent) Affects() []guid.GUID {
    return []guid.GUID{n.Caster, n.Target}
}
```

### Step 4: Create Matcher Function

Add to `combatlog/parser/vanilla/matchers.go`:
```go
func (p *Parser) fNewEvent(ts time.Time, content string) ([]messages.Message, error) {
    matches, ok := types.FromRegex(regexs.ReNewEventType).Match(content)
    if !ok {
        return messages.NotHandled()
    }

    _, caster := matches.UnitOrGUID()
    spellName := matches.String()
    hitType := matches.ShortHitType()
    _, target := matches.UnitOrGUID()
    amount := matches.Int32()
    school := matches.School()
    trailer := matches.Trailer()

    if err := matches.Error(); err != nil {
        return nil, fmt.Errorf("NewEvent: %w", err)
    }

    if caster.IsZero() || target.IsZero() {
        return messages.Skip(ts, "NewEvent: not using guids"), nil
    }

    return set(messages.Damage{
        MessageBase: messages.Base(ts),
        Caster:      ptr.Ref(caster),
        SpellName:   ptr.Ref(spellName),
        Target:      target,
        Amount:      amount,
        HitType:     hitType,
        School:      school,
        Trailer:     trailer,
    }), nil
}
```

### Step 5: Register the Matcher

Add to the matcher list in `parser.go` `ParseContent()`:
```go
p.matchers = []parseLine{
    // ... existing matchers ...
    p.fNewEvent,  // Add in appropriate position
}
```

**Ordering matters:** More specific patterns must come before general ones.

### Step 6: Add Tests

Create test in `combatlog/parser/vanilla/matchers_test.go`:
```go
func TestNewEvent(t *testing.T) {
    t.Parallel()
    p := newTestParser(t, `11/18 07:21:45.192  0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage.`)
    
    msgs, err := p.Advance()
    require.NoError(t, err)
    require.Len(t, msgs, 1)
    
    dmg, ok := msgs[0].(messages.Damage)
    require.True(t, ok)
    assert.Equal(t, int32(38), dmg.Amount)
    assert.Equal(t, "Firebolt", *dmg.SpellName)
}
```

## Code Examples

### Parse a GUID

```go
import "github.com/Emyrk/chronicle/combatlog/parser/guid"

gid, err := guid.FromString("0xF1400844930090A2")
if err != nil {
    return err
}

if gid.IsPlayer() {
    // Handle player
} else if gid.IsPet() {
    // Handle pet - can get owner via other means
} else if gid.IsCreature() {
    entry, _ := gid.GetEntry()
    // entry is the creature template ID
}
```

### Check HitType Flags

```go
import "github.com/Emyrk/chronicle/combatlog/parser/types"

if dmg.HitType.Has(types.HitTypeCrit) {
    // Critical hit
}
if dmg.HitType.Has(types.HitTypePartialResist) {
    // Partially resisted
}

// Multiple flags can be set:
// HitTypeCrit | HitTypePartialResist = critical that was partially resisted
```

### Iterate Parser Output

```go
parser, err := vanilla.New(logger, reader)
if err != nil {
    return err
}

for {
    msgs, err := parser.Advance()
    if err == io.EOF {
        break
    }
    if err != nil {
        return err
    }
    
    for _, msg := range msgs {
        switch m := msg.(type) {
        case messages.Damage:
            // Handle damage
        case messages.Heal:
            // Handle healing
        case messages.SkippedMessage:
            // Intentionally skipped
        case messages.UnparsedLine:
            log.Warn("unmatched line", "content", m.Content)
        }
    }
}
```

## Anti-Patterns

### Don't Use Greedy Patterns Without Anchors
```go
// BAD: Will match too much
regexp.MustCompile(`(.+) hits (.+) for (\d+)`)

// GOOD: Non-whitespace anchor prevents over-matching
regexp.MustCompile(`(.+[^\\s]) hits (.+[^\\s]) for (\\d+)`)
```

### Don't Forget GUID Validation
```go
// BAD: Crashes on old logs without GUIDs
return set(messages.Damage{Caster: ptr.Ref(caster), ...})

// GOOD: Skip lines without GUIDs
if caster.IsZero() || target.IsZero() {
    return messages.Skip(ts, "not using guids"), nil
}
```

### Don't Return Wrong Error Type
```go
// BAD: Stops parsing entirely
return nil, err

// GOOD: Return NotHandled for non-matching lines
if !ok {
    return messages.NotHandled()  // nil, nil
}
```

### Don't Duplicate Logic Across Matchers
```go
// BAD: Copy-pasting damage handling
func (p *Parser) fDamageSchool(...) { /* damage logic */ }
func (p *Parser) fDamageNoSchool(...) { /* same logic */ }

// GOOD: Share via helper with parameter
func (p *Parser) fDamageSchool(ts, content) { return p.fDamage(true, ts, content) }
func (p *Parser) fDamageNoSchool(ts, content) { return p.fDamage(false, ts, content) }
```

## Debugging Tips

1. **Check metrics** - `parser.Metrics()` shows time spent in each matcher
2. **Look for UnparsedLine** - Messages of this type indicate unmatched lines
3. **Test regex online** - Use regex101.com with Go flavor
4. **Print raw lines** - Add logging in `Advance()` to see preprocessing results
5. **Check GUID format** - Old logs use names, new logs use `0x...` format

## Synthetic Absorb Attribution

The synthetic generator `combatlog/parser/vanilla/synthetic/absorption.go` (exported as
`synthetic.Absorption`, shared by the vanilla **and** WotLK pipelines) infers which absorb
buff absorbed damage in client-side logs (where the log only reports `(N absorbed)` without
naming the shield). It emits synthetic `*messages.Absorbed` events marked `IsSynthetic()=true`.

**How it works:**
1. Tracks active shields per target from `AuraCast` events:
   - Vanilla CC v2: `AURA_CAST` carries `EffectAuraName == AuraEffectSchoolAbsorb` (69),
     school mask, and `DurationMS` directly.
   - WotLK CLEU: `SPELL_AURA_APPLIED` produces an `AuraCast` with only Spell/Caster/Target;
     the absorb effect, school mask, and duration are backfilled from DBC spell data.
2. Removes shields on duration expiry (lazy, checked per damage event) and on
   `Aura` fade events (`AuraStateRemoved` — reliable in WotLK, client-visible-only in vanilla).
3. On damage with `(N absorbed)` trailer, picks the best shield:
   school-specific (wards) > all-school (PW:S), most-recently-applied tiebreak.
4. Full absorbs (no amount) are skipped (Phase 3 work).

The `Absorbed` proto message has `bool estimated = 9` to distinguish synthetic attribution
from server-reported (AzerothCore) events.

## Related Files

- `combatlog/parser/types/constants.go` - HitType, School, Resource enums
- `combatlog/parser/types/trailer.go` - Trailer parsing (absorbed, blocked, etc.)
- `combatlog/parser/vanilla/synthetic/` - Synthetic event generation
- `combatlog/parser/vanilla/synthetic/absorption.go` - Absorb attribution (vanilla)
- `combatlog/parser/vanilla/whoami/` - "You" → player name resolution
