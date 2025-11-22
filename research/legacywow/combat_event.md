Perfect! Now I have a comprehensive understanding. Let me create a summary document:

Based on my exploration of the codebase, I can now explain how the vanilla WoW log parser detects combat start and identifies participants. Let me create a comprehensive summary:

## How Vanilla Log Parser Detects Combat and Participants

The vanilla log parser uses an **implicit combat detection system** based on activity tracking. Here's how it works:

### 1. **Parsing Combat Log Lines**

When parsing combat log text files (in `parse_cbl_line`), the parser uses regex patterns to match various combat events:

```rust
// Examples of patterns matched:
RE_DAMAGE_HIT_OR_CRIT: "(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\."
RE_DAMAGE_SPELL_HIT_OR_CRIT: "(.+[^\s])\s's (.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\."
RE_HEAL_HIT: "(.+[^\s])\s's (.+[^\s]) heals (.+[^\s]) for (\d+)\."
```

These match combat log messages like:
- `"Ragnaros hits PlayerName for 1234."`
- `"PlayerName's Fireball crits Boss for 5678 Fire damage."`
- `"Priest's Flash Heal heals Tank for 890."`

### 2. **Participant Tracking**

For every parsed event, the parser:

**a) Collects Participants** (`collect_participant` in `wow_vanilla_parser.rs`):
- Extracts the source and target units from the log line
- Creates/updates a `Participant` record with:
  - Unit ID (from character/NPC name)
  - Whether it's a player or NPC
  - Name
  - Timestamp of activity

**b) Tracks Active Intervals** (`add_participation_point` in `participant.rs`):
```rust
static PARTICIPATION_TIMEOUT: u64 = 5 * 60000; // 5 minutes

if now - self.last_seen <= PARTICIPATION_TIMEOUT {
    self.active_intervals.last_mut().unwrap().1 = now;
} else {
    // Start new interval after 5 minute gap
    self.active_intervals.push((now, now));
}
```

**c) Tracks Active Map** (`collect_active_map`):
- For NPCs with known locations, tracks which map/instance is active
- Uses a 2-minute timeout to determine if you're still in the instance

### 3. **Combat State Detection**

Combat start/end is **inferred** rather than explicitly logged in vanilla (unlike later expansions with `ENCOUNTER_START`). The system generates synthetic `CombatState` messages in `add_combat_event()`:

**Combat START is triggered when:**
- A unit deals damage (melee or spell)
- A unit receives damage
- A unit heals (in special cases like NPC 36789)

**Combat END is triggered when:**
- **60 seconds timeout** (default) since last combat activity for that unit
- **20 seconds timeout** for units without known entry
- **Custom timeouts** for specific NPCs (`get_npc_timeout`)
- Unit dies (explicit `Death` message)
- Unit leaves the instance

```rust
fn add_combat_event(...) {
    let mut timeout = 60000; // 60 seconds default
    
    if let Some(last_update) = last_combat_update.get_mut(&unit.unit_id) {
        if current_timestamp - *last_update >= timeout {
            // Generate "left combat" message
            // Then generate "entered combat" message
        }
        *last_update = current_timestamp;
    } else {
        // First time seeing this unit - generate "entered combat"
        last_combat_update.insert(unit.unit_id, current_timestamp);
    }
}
```

### 4. **Who is "In Combat"?**

A unit is considered in combat if:

1. **It appears in damage/heal events** within the timeout window
2. **It's part of the active instance** (based on `ActiveMap` tracking)
3. **It hasn't died** (unless it's been recently resurrected)

The parser also has special rules:
- **Boss mechanics**: Bosses share combat state with other units of the same NPC entry
- **Implied combat**: Some NPCs trigger combat for related NPCs (`get_in_combat_implied_npc_combat`)
- **Appearance delays**: NPCs get custom timestamps when they "appear" in combat (`get_npc_appearance_offset`)

### 5. **Instance and Map Detection**

The parser determines which encounter/instance units are in by:

1. Looking up NPC entries in the database to find their associated map_id
2. Tracking intervals when that map is "active" (within 2 minutes of activity)
3. Using player count to infer difficulty (13+ players = 25-man, else 10-man for WotLK+)
4. Generating synthetic `InstanceMap` messages when units join/leave

### Summary

**There is no explicit "combat start" event in vanilla logs.** Instead:

- **Combat starts**: When any unit first appears in a damage/heal event
- **Participants**: Any unit that deals/receives damage or healing gets tracked
- **Combat ends**: After 60 seconds of inactivity (or death, or leaving instance)
- **Encounters**: Inferred from which NPCs are active together in the same map/time window

This is why the parser needs to do extensive post-processing - it's reconstructing the combat state from low-level combat log text, whereas modern WoW explicitly logs `ENCOUNTER_START` events.