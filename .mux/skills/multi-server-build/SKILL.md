---
name: multi-server-build
description: Maintains Chronicle's single-binary, dataset-backed game-data pipeline with AzerothCore fallback. Use when changing game-data fallback registration, Docker builds, CI deployment, DBC generation, or adding support for another WoW dataset.
advertise: true
---

# Dataset-backed build pipeline

Chronicle builds one backend binary without server-specific Go build tags. Runtime game data and flavor come from datasets and tenants. When a dataset does not provide a supported category, the backend falls back to bundled AzerothCore data.

## Architecture

### Runtime lookup

```text
request or parser
  -> dataset-scoped database rows, when present
  -> bundled AzerothCore fallback
```

The unconditional fallback registration is:

```text
database/gamedb/chrondbc/server.go
  -> blank-imports database/gamedb/chrondbc/dbcmem/azerothcore
  -> generated init functions populate dbcmem fallback maps
```

`database/gamedb/spells` treats an imported spell dataset as authoritative: a missing spell row does not fall back. Derived categories in `database/gamedb/wowdb.go` fall back when their dataset query returns no rows.

### Spell DBC layout

The bundled fallback file is `assets/azerothcore/Spell.dbc`. It uses the extended AzerothCore layout registered as `dbcdb.ExtendedSpellBuild`.

`dbcdb.WoWClient.Spells` detects the extended layout from the DBC record size so import and generation tools can read stock and extended clients without build tags.

### Server identity

`internal/services/serveridentity.go` identifies only the bundled fallback, not the active tenant or dataset:

- name: `azerothcore`
- build: 3.3.5a

Do not add server-specific build tags. Add server mechanics through dataset/tenant flavor metadata and import server data into a dataset.

## Build and deployment

The backend does not build, embed, or serve the React frontend.

```bash
go build ./cmd/chronicled
go test ./...
golangci-lint run
```

`services/chronicled/Dockerfile` builds only the Go backend and copies `assets/` for the fallback DBC and generated assets. CI publishes a single image:

- tagged release: `emyrk/chronicled:latest`
- branch build: `emyrk/chronicled:unstable`

The `static` build tag and server image matrix are obsolete.

## Adding game data for another server

1. Create or select a dataset with the correct build version and flavor tags.
2. Run `dbcdata import` against that dataset.
3. Add parser mechanics behind runtime `WoWFlavor` tags where necessary.
4. Verify missing categories use the AzerothCore fallback intentionally.
5. Do not add a `server_<name>.go`, `serveridentity_<name>.go`, Docker build argument, or Go build tag.

Generated `dbcmem/<server>` directories may still exist for regeneration or historical data, but only `dbcmem/azerothcore` is registered in the runtime binary.

## Generator notes

The `scripts/dbcdata` commands still accept `--server`; it selects source paths and generated package names, not build behavior. Generation commands must run without server build tags.

Key commands:

```bash
go run ./scripts/dbcdata static --server=<name> -o database/gamedb/chrondbc/dbcmem/<name>
go run ./scripts/dbcdata import --server=<name> --api-url=<url> --dataset-id=<uuid>
```

## Key files

| File | Purpose |
|---|---|
| `database/gamedb/chrondbc/server.go` | Registers AzerothCore fallback maps |
| `database/gamedb/chrondbc/dbcmem/azerothcore/` | Generated fallback maps |
| `database/gamedb/wowdb.go` | Dataset-backed derived data and fallback behavior |
| `database/gamedb/spells/spells.go` | Dataset-authoritative spell lookup and DBC fallback |
| `database/gamedb/dbcdb/spell_layout_extended.go` | Extended AzerothCore Spell layout |
| `internal/services/serveridentity.go` | Bundled fallback identity |
| `services/chronicled/Dockerfile` | Backend-only container build |
| `.github/workflows/go-checks.yml` | Tests and single-image publishing |

## Self-check

- `grep -R '^//go:build' --include='*.go'` shows no server or frontend build tags.
- `go build ./cmd/chronicled` succeeds without `-tags`.
- Dataset-backed tests cover authoritative data and fallback behavior.
- The Dockerfile has no Node stage, frontend `dist`, or `SERVER` argument.
