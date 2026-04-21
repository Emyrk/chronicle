---
name: multi-server-build
description: >
  Multi-server build pipeline for Chronicle. Each WoW server (Turtle, Epoch, etc.)
  produces its own binary via Go build tags, its own Docker image, and its own
  Railway deployment. Covers the dbcmem driver-registration pattern, Dockerfile
  SERVER arg, CI matrix strategy, and how to add a new server.
advertise: true
---

# Multi-Server Build Pipeline

Chronicle supports multiple WoW private servers, each compiled as a separate
binary with server-specific DBC game data. Each server gets its own Docker
image and Railway deployment.

## When to use this skill

- Adding a new WoW server (e.g. `epoch`, `kronos`)
- Modifying the dbcmem data generation pipeline
- Changing CI/CD Docker build or Railway deploy config
- Debugging build tag issues or missing DBC data
- Understanding how server-specific data flows from DBC files to binary

## Architecture

### Build Tag Flow

```
go build -tags "static turtle" ./cmd/chronicled
                        ^^^^^^
                        activates blank-import wiring file
                              ↓
cmd/chronicled/cli/dbcdata_turtle.go
  import _ ".../dbcmem/turtle"
                              ↓
dbcmem/turtle/*.go init() functions run
  dbcmem.SpellCastTimes = map[...]{ ... }
  dbcmem.SpellIcons = map[...]{ ... }
  ...
                              ↓
dbcmem/types.go vars are now populated
  consumers use dbcmem.SpellCastTimes etc.
```

### Driver Registration Pattern

Same pattern as `import _ "github.com/lib/pq"` for database drivers:

1. **`dbcmem/types.go`** — shared struct types, nil var declarations, getter
   functions. No imports of sub-packages. Getters are safe on nil maps (return
   zero values).

2. **`dbcmem/<server>/*.go`** — generated data files. Each file has
   `package <server>`, imports `dbcmem`, and sets one var via `func init()`.

3. **Wiring files** — build-tagged blank imports in the `chrondbc` package:
   ```
   database/gamedb/chrondbc/server_<server>.go  — //go:build <server>
   ```

### Directory Layout

```
database/gamedb/chrondbc/dbcmem/
├── doc.go              # go:generate directives
├── types.go            # Shared types, nil vars, getters, Int32Ptr helper
├── turtle/             # Turtle WoW 1.12.1 DBC data
│   ├── casttimes.go
│   ├── spellicons.go
│   ├── spellduration.go
│   ├── spellrange.go
│   ├── spellcategory.go
│   ├── spellradius.go
│   ├── spellfocusobject.go
│   ├── periodicspells.go
│   ├── vulnerabilityspells.go
│   ├── extraattack.go
│   └── durationmodifiers.go
└── epoch/              # Epoch 3.3.5a DBC data (when ready)
    └── (same 11 files)

database/gamedb/chrondbc/
├── server_turtle.go    # //go:build turtle — blank import of dbcmem/turtle
└── server_epoch.go     # //go:build epoch  — blank import of dbcmem/epoch
```

## CI/CD Pipeline

### Docker Build (`.github/workflows/go-checks.yml`)

The `docker-push` job uses a **matrix strategy** over servers:

```yaml
strategy:
  matrix:
    server: [turtle]  # Add servers here as data becomes available
```

Each matrix entry:
1. Builds `services/chronicled/Dockerfile` with `SERVER=<server>` build arg
2. Tags the image as `emyrk/chronicled:<server>` (on git tags) or
   `emyrk/chronicled:<server>-unstable` (on branch pushes)

### Dockerfile (`services/chronicled/Dockerfile`)

```dockerfile
ARG SERVER=turtle
# ...
RUN SERVER=${SERVER} make build-backend
# expands to: go build --tags "static $SERVER" ./cmd/chronicled
```

### Railway Deploy

The `deploy-railway` job also uses a matrix:

```yaml
strategy:
  matrix:
    include:
      - server: turtle
        railway_service: chronicled
      - server: epoch
        railway_service: chronicled-epoch
```

Each Railway service is configured to pull its own Docker image tag.

### Makefile

```makefile
SERVER ?= turtle    # Default server for local dev

develop:       go run --tags "static $(SERVER)" ...
build-backend: go build --tags "static $(SERVER)" ...
test:          gotestsum -- -tags $(SERVER) ...
lint:          golangci-lint run --build-tags $(SERVER)
```

Override locally: `make develop SERVER=epoch`

## How to Add a New Server

### Step 1: Generate DBC data

```bash
go run ./scripts/dbcdata static \
  --server=<name> \
  --dbc=/path/to/<name>/wow/client \
  -o database/gamedb/chrondbc/dbcmem/<name>

go run ./scripts/dbcdata derived-statics \
  --server=<name> \
  --dbc=/path/to/<name>/wow/client \
  --go-dir=database/gamedb/chrondbc/dbcmem/<name> \
  --ts-dir=frontend/chronicle/src/constants/dbmem \
  --assets-dir=assets/generated
```

This creates `dbcmem/<name>/` with 11 generated Go files, each containing an
`init()` function that populates the corresponding `dbcmem` package variable.

### Step 2: Add wiring file

Create a build-tagged blank-import file in the `chrondbc` package:

**`database/gamedb/chrondbc/server_<name>.go`:**
```go
//go:build <name>

package chrondbc

import _ "github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem/<name>"
```

### Step 3: Verify build

```bash
go build -tags "<name>" ./cmd/chronicled
go build -tags "<name>" ./cmd/chronicle
go vet -tags "<name>" ./...
```

### Step 4: Enable in CI

In `.github/workflows/go-checks.yml`:

1. Add to docker-push matrix:
   ```yaml
   server: [turtle, <name>]
   ```

2. Add to deploy-railway matrix:
   ```yaml
   - server: <name>
     railway_service: chronicled-<name>
   ```

3. Create the Railway service configured to pull `emyrk/chronicled:<name>`.

### Step 5: Configure Railway deployment

Each server deployment needs its own:
- Discord OAuth app (`CHRONICLE_DISCORD_CLIENT_ID`, `CHRONICLE_DISCORD_CLIENT_SECRET`)
- `CHRONICLE_SPELL_DBC_PATH` pointing to the right DBC file
- `CHRONICLE_ASSETS_GENERATED_DIR` with version-appropriate JSON assets
- Database (separate Postgres instance)
- Subdomain (e.g. `<name>.chronicleclassic.com`)

## Generator Details

The `scripts/dbcdata` tool accepts a `--server` flag that controls:

- **Package name** in generated output (`package turtle`, `package epoch`)
- **Import path** (`import "...dbcmem"` added to each file)
- **Data wrapping** — vars assigned inside `func init() { dbcmem.X = ... }`

### Generator commands

| Command | What it generates |
|---------|-------------------|
| `static` | 7 files: casttimes, spellicons, spellduration, spellrange, spellcategory, spellradius, spellfocusobject |
| `derived-statics` | 4 Go files: periodicspells, vulnerabilityspells, extraattack, durationmodifiers. Also generates TypeScript constants and JSON assets. |
| `spell-test-data` | TypeScript test fixtures (not server-specific) |

### doc.go go:generate directives

```go
//go:generate go run ../../../../scripts/dbcdata static --server=turtle -o turtle
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=turtle --assets-dir=... --go-dir=turtle --ts-dir=...
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `database/gamedb/chrondbc/dbcmem/types.go` | Shared types, nil vars, getters |
| `database/gamedb/chrondbc/dbcmem/doc.go` | go:generate directives |
| `database/gamedb/chrondbc/dbcmem/<server>/*.go` | Generated data (11 files per server) |
| `database/gamedb/chrondbc/server_<server>.go` | Build-tagged wiring (blank import) |
| `scripts/dbcdata/cli/static.go` | Generator for DBC-direct tables |
| `scripts/dbcdata/cli/derivedstatics.go` | Generator for spell-derived tables |
| `services/chronicled/Dockerfile` | Docker build with `SERVER` arg |
| `.github/workflows/go-checks.yml` | CI: lint, test, docker-push, deploy matrices |
| `Makefile` | `SERVER ?= turtle` default, all targets use `$(SERVER)` |

## Consumers of dbcmem (no changes needed per server)

| File | Symbols Used |
|------|-------------|
| `database/gamedb/chrondbc/types.go` | `SpellIcons`, `SpellCategories`, `SpellDurations`, `SpellRanges`, `SpellCastTimes`, `SpellRadii`, `SpellFocusObjects` |
| `database/gamedb/chrondbc/durationcalc.go` | `DurationModifiersByClassBit`, `DurationModifiers` |
| `internal/services/servicewowdb/servicewowdb.go` | `PeriodicSpells` |
| `combatlog/parser/vanilla/synthetic/extrattack.go` | `ExtraAttackSpells` |
