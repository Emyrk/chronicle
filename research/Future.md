# Future: Multi-Version WoW Support for Chronicle

> Research document covering the architecture and implementation plan for making
> Chronicle support multiple WoW client versions as separate deployments.

---

## Phases Summary

### Phase 1 — Foundation (no build tags yet)

Centralize duplicated frontend constants, add Death Knight to SDK types and CSS,
add Runic Power to power types, make icon URL configurable. All safe changes that
don't break the current vanilla-only build.

### Phase 2 — Build Tag Infrastructure

Add `--version` flag to the DBC generator, restructure `dbcmem/` files with
`//go:build` tags, split encounter registry and instance definitions into
per-version files, update `Makefile` with per-version build targets. After this
phase, `go build -tags wow_vanilla` produces the same binary as today.

### Phase 3 — WotLK Content

Generate WotLK DBC data from 3.3.5a client files, define WotLK encounters
(instances, bosses, hostiles), create boss-specific character handlers, generate
WotLK JSON assets. Test end-to-end with WotLK combat logs.

### Phase 4 — Deployment

Set up separate Discord OAuth apps per deployment, configure per-deployment
environment variables, build and deploy separate binaries, run per-deployment
database migrations with version-appropriate seed data.

---

## Goal

Make Chronicle support multiple WoW client versions, each deployed as its **own
binary** with its **own database** and **own auth** (fully separate tenants):

| Deployment       | Client                                     | Subdomain                      |
| ---------------- | ------------------------------------------ | ------------------------------ |
| Turtle WoW       | 1.12.1 (Vanilla)                           | `turtle.chronicleclassic.com`  |
| Epoch / others   | 3.3.5a (WotLK client running Classic/TBC)  | `epoch.chronicleclassic.com`   |

**Approach:** Go build tags swap version-specific compiled-in data. Shared code
stays untagged.

```bash
go build -tags wow_vanilla ./cmd/chronicled   # Turtle WoW binary
go build -tags wow_wotlk  ./cmd/chronicled   # Epoch binary
```

---

## Architecture Overview

The codebase has **5 seam points** where version-specific code plugs in.
Everything else is already version-agnostic or configured via environment
variables.

```
┌─────────────────────────────────────────────────────┐
│  Seam 1: DBC Lookup Tables (dbcmem/*.go)            │  ← build tag
│  Seam 2: Generated JSON Assets (assets/generated/)  │  ← config or embed
│  Seam 3: Encounter Registry (DefaultRegistry)       │  ← build tag
│  Seam 4: Frontend TS Constants (constants/dbmem/)   │  ← env var / generated
│  Seam 5: Combat Log Parser Format                   │  ← build tag (if needed)
├─────────────────────────────────────────────────────┤
│  Already version-agnostic:                          │
│  • Auth (env vars: DISCORD_CLIENT_ID/SECRET)        │
│  • DB schema (UUID-based servers/realms)            │
│  • API routes (no version prefixes)                 │
│  • DBC file path (CHRONICLE_SPELL_DBC_PATH)         │
│  • Leaderboard version filtering (semver columns)   │
│  • Parser interfaces (SpellFetcher, GearResolver)   │
└─────────────────────────────────────────────────────┘
```

---

## Seam 1 — DBC Lookup Tables

### What

11 generated Go files in `database/gamedb/chrondbc/dbcmem/` (~5,300 lines)
containing spell cast times, durations, icons, categories, ranges, periodic
effects, vulnerability data, extra attacks, and duration modifiers.

### Current State

All generated from Turtle WoW 1.12.1 DBC files via `scripts/dbcdata/`. The
generator currently hardcodes the Turtle WoW client path in 4 places:

- `scripts/dbcdata/main.go:51`
- `scripts/dbcdata/cli/static.go:36`
- `scripts/dbcdata/cli/derivedstatics.go`
- `scripts/dbcdata/cli/spelltestdata.go`

### Plan

1. **Add a `--version` flag to `scripts/dbcdata`** — accept the WoW client path
   and a version tag string.

2. **Generate into build-tagged files** (same package, different file suffixes):

   ```
   database/gamedb/chrondbc/dbcmem/
   ├── casttimes_vanilla.go       # //go:build wow_vanilla
   ├── casttimes_wotlk.go         # //go:build wow_wotlk
   ├── spellicons_vanilla.go      # //go:build wow_vanilla
   ├── spellicons_wotlk.go        # //go:build wow_wotlk
   ├── periodicspells_vanilla.go
   ├── periodicspells_wotlk.go
   └── ... (11 pairs total)
   ```

   Each pair declares the same package-level variables but with different data:

   ```go
   // casttimes_vanilla.go  — //go:build wow_vanilla
   var SpellCastTimes = map[int32]SpellCastTime{...}

   // casttimes_wotlk.go    — //go:build wow_wotlk
   var SpellCastTimes = map[int32]SpellCastTime{...}
   ```

3. **Update Makefile:**

   ```makefile
   gen/static-vanilla:
       go run ./scripts/dbcdata static --wow-path=$(VANILLA_WOW_PATH) --version=vanilla
   gen/static-wotlk:
       go run ./scripts/dbcdata static --wow-path=$(WOTLK_WOW_PATH) --version=wotlk
   ```

### Files to Modify

- `scripts/dbcdata/main.go`
- `scripts/dbcdata/cli/static.go`
- `scripts/dbcdata/cli/derivedstatics.go`
- `scripts/dbcdata/cli/spelltestdata.go`
- `database/gamedb/chrondbc/dbcmem/*.go` (split into `_vanilla` / `_wotlk`)
- `Makefile`

---

## Seam 2 — Generated JSON Assets

### What

4 JSON files served via `/api/v1/assets/`:

| File                    | Size   | Content                        |
| ----------------------- | ------ | ------------------------------ |
| `class-spells.json`     | 507 KB | All class spells by class ID   |
| `talent-trees.json`     | 174 KB | Talent tree data               |
| `boss-presets.json`     | 892 B  | Boss damage profiles for sim   |
| `player-base-stats.json`| 3 KB   | Level 60 race/class base stats |

### Current State

Generated by `scripts/dbcdata` from Turtle WoW DBC, served from
`assets/generated/` (configurable via `CHRONICLE_ASSETS_GENERATED_DIR`).

### Plan

**Option A (recommended — zero code changes):** Generate per-version asset
directories and set `CHRONICLE_ASSETS_GENERATED_DIR` per deployment. Each
binary's deployed config points to its own assets. Already works today.

**Option B (future upgrade):** Embed version-specific assets into the binary
using `//go:embed` with build tags, removing the external directory dependency.

---

## Seam 3 — Encounter Registry (Main Seam)

### What

`DefaultRegistry()` in
`combatlog/parser/vanilla/state/encounters/registry/registry.go` registers all
27 Turtle WoW instances. Called from `encounters.New()` in `consumer.go:63`.

Instance definitions (boss entry IDs, zone names, mechanics) live in:

- `instances/instances.go` — factory definitions
- `instances/hostiles.go` — boss/trash identity maps
- `instances/speedrun_rules.go` — speedrun requirements
- `character/*.go` — boss-specific mechanics (40+ handlers)

### Currently Supported Instances (27)

**40-Man Raids:** Molten Core, Onyxia, Emerald Sanctum, Temple of Ahn'Qiraj,
Blackwing Lair, Naxxramas

**20-Man Raids:** Zul'Gurub, Ruins of Ahn'Qiraj, Timbermaw Hold

**10-Man:** Tower of Karazhan

**5-Man Dungeons:** Windhorn Canyon, Deadmines, Wailing Caverns, Razorfen Kraul,
Ragefire Chasm, Scarlet Monastery (Cathedral + Library), Stockade, Blackrock
Depths, Scholomance, Stratholme, Black Morass, Dire Maul, Stormwind Vault,
Sunken Temple, Frostmane Hollow, Blackrock Spire

### Plan

1. **Split `registry.go` into build-tagged files:**

   ```
   registry/
   ├── registry.go              # Shared: NewRegistry(), Register(), GetInstance()
   ├── registry_vanilla.go      # //go:build wow_vanilla
   └── registry_wotlk.go        # //go:build wow_wotlk
   ```

2. **Split instance data files:**

   ```
   instances/
   ├── common.go                # Shared: CommonFactory, Identity, helpers
   ├── instance.go              # Shared: interfaces
   ├── hookable.go              # Shared: Hookable type
   ├── instances_vanilla.go     # //go:build wow_vanilla
   ├── instances_wotlk.go       # //go:build wow_wotlk
   ├── hostiles_vanilla.go      # //go:build wow_vanilla
   ├── hostiles_wotlk.go        # //go:build wow_wotlk
   ├── speedrun_rules_vanilla.go
   └── speedrun_rules_wotlk.go
   ```

3. **Split boss character factory dispatch:**

   ```
   character/
   ├── character.go             # Shared interface
   ├── common.go                # Shared default implementation
   ├── lookup.go                # Shared dispatch function
   ├── lookup_vanilla.go        # //go:build wow_vanilla — factory list
   ├── lookup_wotlk.go          # //go:build wow_wotlk  — factory list
   ├── moltencore.go            # //go:build wow_vanilla
   ├── ragnaros.go              # //go:build wow_vanilla
   ├── naxx.go                  # //go:build wow_vanilla (WotLK Naxx = separate file)
   └── icecrowncitadel.go       # //go:build wow_wotlk  (new)
   ```

   The shared `lookup.go` dispatches through a `characterFactories` variable
   that each build-tagged file populates:

   ```go
   // lookup_vanilla.go — //go:build wow_vanilla
   var characterFactories = []characterFactory{
       NewTotemCharacter,
       NewCritterCharacter,
       NewRagnarosCharacter,
       NewMajordomoPartyCharacter,
       // ... vanilla bosses
   }

   // lookup_wotlk.go — //go:build wow_wotlk
   var characterFactories = []characterFactory{
       NewTotemCharacter,
       NewCritterCharacter,
       // ... WotLK bosses
   }
   ```

---

## Seam 4 — Frontend TypeScript Constants

### What

~15 files with hardcoded class lists (9 vanilla classes), spell IDs, race/class
restrictions, and class color mappings. Plus 3 generated DBC files in
`constants/dbmem/`.

### Current State

All assume 9 classes. No Death Knight (class ID 6). Class colors, orderings, and
ID mappings duplicated across components.

### Files With Duplicated Class Constants

| File | Data |
| ---- | ---- |
| `pages/Instance/EventsPanels/Equipment/EquipmentContent.tsx` | `CLASS_NAME_TO_ID` |
| `pages/Instance/EventsPanels/Rotations/Rotations.tsx` | `CLASS_COLORS`, `CLASS_ORDER` |
| `pages/Instance/EventsPanels/Roles/RolesContent.tsx` | `CLASS_COLORS`, `CLASS_ORDER` |
| `pages/Instance/InstancePageView.tsx` | `CLASS_ORDER` |
| `pages/Sim/SimPage.tsx` | `RACES`, `CLASSES`, `CLASS_NAME_TO_ID`, `CLASS_ID_TO_WOW`, `RACE_ID_TO_WOW` |
| `pages/ArmorySearch/ArmorySearchPage.tsx` | `WOW_CLASSES`, `CLASS_DB_VALUE` |
| `pages/ArmoryPage/TalentsTab.tsx` | `CLASS_NAME_TO_ID` |
| `pages/Technical/TalentTreesPage.tsx` | `CLASSES` |
| `pages/Technical/AuraDurationModifiersPage.tsx` | `CLASS_NAMES` |
| `pages/GuildPage/panels/Leaderboard.tsx` | `CLASS_COLORS` |
| `pages/GuildPage/panels/Roster.tsx` | `CLASS_COLORS` |

### Generated DBC Constants (also version-specific)

| File | Lines | Content |
| ---- | ----- | ------- |
| `constants/dbmem/DurationModifiers.ts` | 5,551 | Spell duration talents |
| `constants/dbmem/VulnerabilitySpells.ts` | 1,751 | Resistance debuffs |
| `constants/dbmem/ExtraAttack.ts` | 38 | Extra attack procs |

### Plan

**Step 1 — Centralize constants** into `frontend/chronicle/src/constants/classes.ts`:

```typescript
export const CLASSES: Record<number, string> = {
  1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest",
  7: "Shaman", 8: "Mage", 9: "Warlock", 11: "Druid",
};
export const CLASS_COLORS: Record<string, string> = { ... };
export const CLASS_ORDER: string[] = [ ... ];
export const CLASS_NAME_TO_ID: Record<string, number> = { ... };
```

Refactor all 11 files above to import from this single source.

**Step 2 — Version-conditional inclusion** via `VITE_WOW_VERSION` env var:

```typescript
const DK_ENTRY = import.meta.env.VITE_WOW_VERSION === "wotlk"
  ? { 6: "Death Knight" } : {};
export const CLASSES = { 1: "Warrior", ...DK_ENTRY, ... };
```

**Step 3 — Add Death Knight CSS color:**

```css
--color-class-deathknight: #C41E3A;
```

**Step 4 — Update Go SDK type** — add `"DEATHKNIGHT"` to `WoWHeroClasses` in
`api/chroniclesdk/`. This auto-generates into `typesGenerated.ts`.

---

## Seam 5 — Combat Log Parser Format

### What

The parser in `combatlog/parser/vanilla/parserv2/` handles Turtle WoW's
pipe-delimited CSV format (`timestamp|event_type|field1|field2|...`).

### Current State

The Chronicle Companion addon controls the log output format — it's not the WoW
client itself that writes the combat log. If the addon runs on 3.3.5a clients and
produces the same pipe-delimited format, `parserv2` can be reused as-is.

The parser already uses the `SpellFetcher` interface for spell lookups, so
different DBC data flows through cleanly.

### Plan

**Assumption to confirm first:** Does the Chronicle Companion addon produce
identical format on 3.3.5a? If yes, no parser changes are needed — only the
data (DBC tables, encounters) changes.

**If the format differs:** Create a `parserwotlk/` parallel package. The
consumer (`consumers.New()`) and encounter state machine work on the
`messages.Message` interface — they don't care which parser produced the
messages.

**GUID format:** Currently 64-bit with vanilla-specific bit layout. If WotLK
GUIDs differ (possible if using Blizzard's native format), `combatlog/parser/
guid/guid.go` would need a version-aware variant. But if the addon controls GUID
formatting, this may be identical.

**Recommendation:** Defer this seam until the addon's 3.3.5a output is tested.

---

## Additional Changes

### Power Types

`database/gamedb/chrondbc/types.go` hardcodes 4 power types (Mana, Rage, Focus,
Energy). WotLK adds Runic Power for Death Knights. Adding it unconditionally is
safe — unused constants don't affect vanilla.

### Icon URL

`frontend/chronicle/src/api/wowdb.ts:267` hardcodes
`https://icons.chronicleclassic.com/`. Make configurable via `VITE_ICON_DOMAIN`
env var so different versions can point to different icon CDNs.

### Database Migrations

Each deployment runs its own migrations on its own database. The schema itself is
version-agnostic. Server/realm seed data differs:

- Vanilla: Turtle WoW realms (Ambershire, Tel'Abim, Nordanaar)
- WotLK: Epoch realms (TBD)

Recommend seeding via config or admin API at startup rather than
version-specific migration files.

### Vulnerability Config

`frontend/.../VulnerabilityEffect/vulnerabilityConfig.ts` has hardcoded spell IDs
including WotLK-only `51275` (Freezing Cold). Move to generated JSON asset,
loaded per-version.

---

## Detailed Implementation Steps

### Phase 1 — Foundation

| # | Task | Touches |
|---|------|---------|
| 1 | Centralize frontend class/race constants into `constants/classes.ts` | New file |
| 2 | Refactor 11 files to import from central constants | Frontend |
| 3 | Add `DEATHKNIGHT` to Go SDK `WoWHeroClasses` + regenerate TS types | SDK, codegen |
| 4 | Add Death Knight CSS color variable | Tailwind/CSS |
| 5 | Add `PowerRunicPower` to power types enum | `chrondbc/types.go` |
| 6 | Make icon URL configurable via `VITE_ICON_DOMAIN` | `wowdb.ts` |

### Phase 2 — Build Tag Infrastructure

| # | Task | Touches |
|---|------|---------|
| 7 | Add `--version` flag to `scripts/dbcdata` generator | Generator scripts |
| 8 | Restructure `dbcmem/` — split each file into `_vanilla.go` / `_wotlk.go` | DBC lookup tables |
| 9 | Split `registry.go` → `registry_vanilla.go` + shared base | Encounter registry |
| 10 | Split `instances.go` / `hostiles.go` → `_vanilla.go` variants | Instance definitions |
| 11 | Split `speedrun_rules.go` → `_vanilla.go` | Speedrun rules |
| 12 | Split `character/lookup.go` factory list → `lookup_vanilla.go` | Boss handlers |
| 13 | Add build tags to vanilla-specific boss handlers (`moltencore.go`, etc.) | Boss handlers |
| 14 | Update `Makefile` with per-version build and gen targets | Build system |
| 15 | Verify `go build -tags wow_vanilla` produces identical binary to today | Validation |

### Phase 3 — WotLK Content

| # | Task | Touches |
|---|------|---------|
| 16 | Generate WotLK DBC data from 3.3.5a client files | DBC generator |
| 17 | Define WotLK instances in `instances_wotlk.go` | Instance definitions |
| 18 | Define WotLK boss/trash IDs in `hostiles_wotlk.go` | Identity maps |
| 19 | Create WotLK boss character handlers | New character files |
| 20 | Create WotLK encounter registry in `registry_wotlk.go` | Registry |
| 21 | Generate WotLK JSON assets (class-spells, talents, base stats) | JSON assets |
| 22 | Test with WotLK combat logs end-to-end | Integration tests |

### Phase 4 — Deployment

| # | Task | Touches |
|---|------|---------|
| 23 | Set up separate Discord OAuth apps per deployment | External config |
| 24 | Configure per-deployment env vars (DBC path, assets dir, auth) | Deployment config |
| 25 | Build binaries: `go build -tags wow_vanilla`, `go build -tags wow_wotlk` | CI/CD |
| 26 | Deploy to separate subdomains with per-deployment databases | Infrastructure |
| 27 | Seed per-deployment server/realm data via admin API | Database |

---

## What's Already Version-Agnostic (No Changes Needed)

| Component | Why It Works |
|-----------|-------------|
| Auth (OAuth/Discord) | Fully configurable via env vars (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`) |
| Database schema | UUID-based servers/realms, generic tables |
| API routes | No version prefixes, no hardcoded instance names |
| Spell schools | Same enum across all WoW versions (Physical through Arcane) |
| Parser interfaces | `SpellFetcher` / `GearResolver` already abstract |
| Leaderboard version filtering | BIGINT-encoded semver columns, admin-configurable per instance |
| Object storage | Version-agnostic file storage |
| River job queue | Generic job processing |

---

## Call Chain Reference

How the parser is wired from binary startup to encounter detection — these are
the concrete points where build tags plug in:

```
main()
└─ ServerCmd()
   └─ services.Register(...)
      ├─ servicewowdb.Start()
      │  └─ gamedb.New(SpellsDBCPath)         ← configured via CHRONICLE_SPELL_DBC_PATH
      │
      └─ servicechronicle.Start()
         └─ chronicle.New(WoWDB: gamedb interface)
            └─ WorkerLogParse.Work()
               ├─ encounters.New()
               │  └─ registry.DefaultRegistry()   ★ SEAM 3 (build-tagged)
               │     └─ instances.*                ★ SEAM 3 (build-tagged)
               │
               └─ parserv2.New(SpellFetcher)
                  └─ dbcmem.*                      ★ SEAM 1 (build-tagged)
```
