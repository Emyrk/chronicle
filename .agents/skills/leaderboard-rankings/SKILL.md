---
name: leaderboard-rankings
description: >
  Rankings and leaderboard system for Chronicle. Covers speedrun tracking (parser-side kill detection),
  leaderboard queries, proof display, and leaderboard API/UI behavior. Use when: adding ranking types,
  modifying speedrun rules, or working with the leaderboard API/UI.
advertise: true
---

# Leaderboard & Rankings System

## Architecture Overview

The rankings system has two layers:

1. **Parser-side detection** — computes rankings during combat log parsing (e.g., speedrun timing)
2. **Database + API + Frontend** — stores results, serves leaderboard queries, displays proof

```
Combat Log → Parser → SpeedrunTracker → FinalizedInstance.Rankings
                                              ↓
                                    logparse.go (InsertInstanceSpeedrun)
                                              ↓
                                    instance_speedruns table
                                              ↓
                              GET /api/v1/leaderboard/speedrun
                              GET /api/v1/raidlogs/instances/{id}/speedrun
```

## Rankings Package

**Location:** `combatlog/parser/vanilla/state/encounters/instances/rankings/`

### Types (rules — input, JSON-serializable for frontend)

```go
type Rankings struct {
    Speedrun *SpeedrunRules `json:"speedrun,omitempty"`
}

type SpeedrunRules struct {
    Requirements []SpeedrunRequirement `json:"requirements"`
}

type SpeedrunRequirementCategory string
const (
    SpeedrunCategoryBosses SpeedrunRequirementCategory = "Bosses"
    SpeedrunCategoryTrash  SpeedrunRequirementCategory = "Trash"
)

type SpeedrunRequirement struct {
    Name     string                      `json:"name"`
    EntryIDs []uint32                    `json:"entry_ids"`
    Count    int                         `json:"count"`
    Category SpeedrunRequirementCategory `json:"category"`
}
```

### Types (proof — output)

```go
type RankingsResult struct {
    Speedrun *SpeedrunResult
}

type SpeedrunResult struct {
    Qualified      bool
    StartTime      time.Time
    CompletionTime time.Time
    Duration       time.Duration
    Proof          []SpeedrunProof
}

type SpeedrunProof struct {
    Requirement SpeedrunRequirement
    Kills       []KillRecord
    Satisfied   bool
}

type KillRecord struct {
    EntryID   uint32
    GUID      guid.GUID
    Timestamp time.Time
}
```

### SpeedrunTracker

**Dual-hook pattern** — implements both:
- `instancehook.Hook` for `FightStarted`/`FightEnded`
- `character.SetHook` for `ActivityChange` kill detection

This is necessary because some bosses (e.g., Majordomo Executus) never emit `*messages.Slain` — they surrender/despawn. The character system marks them `EndStateSlain` through custom character handlers.

**Key logic:**
- `FightStarted` — records first combat timestamp (only once)
- `ActivityChange` — checks inactive characters with `EndStateSlain`, deduplicates by GUID, tracks kills per requirement
- `FightEnded` — when all requirements satisfied, marks `completed` and records completion time
- `Result()` — always returns non-nil `*SpeedrunResult` with proof for every requirement

### Wiring Instance Rules

Rules are defined per instance in `instances/speedrun_rules.go` and wired via `CommonFactory`:

```go
// instances/instances.go
{
    Name:     "Molten Core",
    Rankings: &rankings.Rankings{
        Speedrun: &rankings.SpeedrunRules{
            Requirements: MoltenCoreSpeedrunRequirements(),
        },
    },
}
```

Requirements use `Category` to group display in the UI (e.g., "Bosses" vs "Trash").
When `Count > 1`, the frontend displays `×N` suffix.

### Adding a New Instance's Speedrun Rules

1. Create requirements function in `instances/speedrun_rules.go`
2. Wire into the instance's `CommonFactory` in `instances/instances.go`
3. Reparse existing logs to populate data

## Database Schema

### `instance_speedruns` table

The `instance_speedruns` table stores the evaluated result and proof for each parsed
instance. It includes raw and ranked timing fields, qualification state, guild/realm
identity, addon version metadata, and JSONB proof.

### Leaderboard Query

```sql
SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
    sr.*, li.hashed_slug, li.parser_version, ...
FROM instance_speedruns sr
JOIN log_instances li ON li.id = sr.instance_id
WHERE sr.instance_name = @instance_name
  AND sr.qualified = true
ORDER BY COALESCE(li.duplicate_group_id, li.id), sr.duration_ms ASC;
```

Key behaviors:
- `DISTINCT ON` with duplicate group keeps only the fastest run per duplicate group.
- Leaderboards require a qualified speedrun and apply board-specific realm, guild,
  difficulty, player-count, and timing filters.
- When no guild filter is supplied, the public board keeps the best run per guild.

## API Endpoints

### Public

- `GET /api/v1/leaderboard/speedrun?instance_name=Molten+Core` — speedrun leaderboard
- `GET /api/v1/raidlogs/instances/{id}/speedrun` — single instance speedrun result and proof

## Frontend

### Leaderboard Panel (EventsPanel)

Registered as `leaderboard` in the panel system. Uses `useQuery` with `retry: false`
and `staleTime: Infinity` to fetch `/api/v1/raidlogs/instances/{id}/speedrun`. No event
stream processing is required because the data comes from the API.

Displays:
- Trophy icon + "Speedrun" label
- Duration (if qualified) or "Incomplete (N/M)" count
- Requirements grouped by `category` with pass/fail status per requirement
- Count shown as `×N` when `requirement.count > 1`
- Data-source, DPS-ranking, and level-range eligibility details when available

## Key Design Decisions

1. **Separate `instance_speedruns` table** — most instances don't have speedrun data, keeping other queries lean.
2. **Proof as JSONB** — flexible proof storage avoids schema changes when requirements evolve.
3. **Duplicate handling** — `DISTINCT ON (COALESCE(duplicate_group_id, id))` deduplicates equivalent uploads.
4. **Speedrun data on a separate endpoint** — fetched only by views that need proof and eligibility details.
5. **`category` on requirements** — groups display such as Bosses and Trash without changing the data model.
