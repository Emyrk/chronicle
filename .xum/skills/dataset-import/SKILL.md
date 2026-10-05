---
name: dataset-import
description: How the `dbcdata import` loader is structured and how to add a new game-data importer that uploads into a Chronicle dataset. Use when adding/modifying an Importer in scripts/dbcdata/cli, wiring a new DBC upload endpoint in api/gamedataapi, or migrating a game-data type (spells, items, talents, creatures) from compiled-in dbcmem to a database-backed dataset.
globs:
  - scripts/dbcdata/cli/importer.go
  - scripts/dbcdata/cli/importcmd.go
  - scripts/dbcdata/cli/uploader.go
  - scripts/dbcdata/cli/interactive.go
  - scripts/dbcdata/cli/tui.go
  - api/gamedataapi/**
  - database/gamedb/talents/**
  - internal/services/servicedataset/**
---

# Dataset Import Loader

> **See also:** `dbcmem` skill (the *old* compiled-in codegen path: `static` /
> `derived-statics` commands) and `multi-server-build` skill (build tags, Docker,
> Railway). This skill is about the *new* runtime path: `dbcdata import`, which
> uploads game data into a database-backed **dataset** so one binary serves many
> WoW versions. For the dataset-vs-tenant scoping rationale, read the vault entry
> `chronicle-dataset-architecture` and the roadmap in `chronicle-dataset-loader`.

The `dbcdata import` command sources DBC files from a WoW client and either
exports computed artifacts to disk (`--export-as=files`) or uploads them to a
running Chronicle server (`--api-url`). Each game-data category is an
**Importer**. The server stores everything scoped by `dataset_id`.

## Pipeline at a glance

```
WoW client (.MPQ / DBFilesClient)
   │  dbcdb.WoWClient.ReadFile()
   ▼
Importer.Produce(wc, files) ──► []Artifact   (raw DBC bytes OR computed JSON)
   │
   ├── --export-as=files ──► write Artifact.Data to --out
   │
   └── --api-url ──► uploader.Upload(art)
                       ├── UploadDBC         → POST  /api/v1/game-data/dbc/upload?dbc_type=…&dataset_id=…  (multipart)
                       └── UploadTalentTrees → PUT   /api/v1/game-data/datasets/{id}/talent-trees           (JSON body)
                                                   │
                                                   ▼
                                       gamedataapi.Handler dispatches by dbc_type,
                                       batch-upserts into (dataset_id, entry_id) tables
```

## Key types (`scripts/dbcdata/cli/importer.go`)

- **`DBCFile`** — typed name of a file in `DBFilesClient\` (e.g. `Spell.dbc`).
  Add a `const` here when an importer needs a new file.
- **`Importer`** interface — one category of game data:
  - `Key() string` — stable CLI selector (e.g. `"talents"`, `"item-sets"`).
  - `Name() string` — human label for the picker.
  - `RequiredFiles() []DBCFile` — declared so the union of files is extracted
    **exactly once** across all selected importers (see `extractFiles`).
  - `Produce(wc *dbcdb.WoWClient, files map[DBCFile][]byte) ([]Artifact, error)`.
- **`Artifact`** — produced output: `Filename`, `Data []byte`, `UploadKind`,
  and `DBCType` (the `dbc_type` query param for `UploadDBC`).
- **`UploadKind`** — `UploadDBC` (multipart POST of raw bytes) or
  `UploadTalentTrees` (PUT computed JSON). Add a kind only for a genuinely new
  transport; prefer reusing `UploadDBC`.
- **`Registry()`** — returns all importers in display order. **Register new
  importers here.** `ImporterByKey` and the `--import` flag read from it.

## The two importer shapes

1. **Raw passthrough (`rawDBCImporter`)** — sends one DBC file unchanged; the
   *server* parses it (`gamedataapi` auto-detects vanilla/TBC/WotLK builds).
   Use this when the server already has a parser + table for the DBC. Adding a
   new one is usually a single line in `Registry()`:
   ```go
   &rawDBCImporter{key: "spell-foo", name: "Spell Foo", file: FileSpellFoo, dbcType: "SpellFoo"},
   ```
2. **Compute-then-upload (`talentImporter`)** — reads several DBCs, does a
   complex local transform (icon resolution, prereq graph), marshals JSON, and
   PUTs the result. Use this when the transform is too involved to push to the
   server, or the shape is a document (JSONB) rather than row-queryable.

## Adding a new importer (checklist)

### A. Raw-DBC passthrough (server already parses it)
1. Add the `DBCFile` const in `importer.go` if the file is new.
2. Add a `&rawDBCImporter{...}` line to `Registry()`.
3. **Server side** (`api/gamedataapi/upload_dbc.go`): add a `case "YourType":`
   to the `switch dbcType` dispatch and a `handleYourTypeUpload(...)` that
   batch-upserts. Every INSERT must include `dataset_id` and use a composite
   `ON CONFLICT (dataset_id, <pk>)`. Pass the `datasetID uuid.UUID` arg through
   (it is parsed from `?dataset_id=`, defaulting to
   `servicedataset.DefaultDatasetID`).
4. Ensure the target table has a `(dataset_id, entry_id)` composite PK (new
   migration; never edit a deployed one).

### B. Compute-then-upload (document / JSONB)
Follow the talents example end-to-end:
1. New `Importer` type in `importer.go` with the relevant `RequiredFiles()` and
   a `Produce` that marshals JSON; register it.
2. Add a transport: either reuse a PUT endpoint or add an `UploadKind` +
   `uploader` method (`uploader.go`) + a `gamedataapi` handler + route
   (`handler.go`). Talents: `PUT /game-data/datasets/{id}/talent-trees`
   (`upload_talents.go`) → `UpsertDatasetTalentTrees` sqlc query into a JSONB
   table.
3. Read side: a `gamedb/<type>` fetcher package mirroring `gamedb/talents`
   (`Fetcher` interface, narrow `Querier`, per-dataset LRU cache, sentinel
   `ErrNo<Type>Data` wrapping `pgx.ErrNoRows`); wire into `GameDB`; serve via a
   `/wowdb/<type>` endpoint that returns **404 → graceful empty state** when
   unimported.

After either path: `make gen` if you touched migrations/queries/SDK, then build
the CLI (`go build ./scripts/dbcdata/...`) and the server.

## Upload transport (`uploader.go`)

- `uploader` holds `baseURL`, `token` (Bearer), `datasetID`, `mode`
  (`compare|upsert|insert`), `http.Client`.
- `uploadDBC` → multipart `dbc_file`, query `mode`, `dbc_type`, `dataset_id`.
- `uploadTalentTrees` → PUT JSON to the dataset talent-trees route.
- `do()` sets `Authorization: Bearer <token>` and calls `setBrowserHeaders`.

## Auth & the BrowserOnly gotcha (`interactive.go`)

- Auth is a **Bearer token**. Provide `--token`/`CHRONICLE_TOKEN`, or
  `--cookie`/`CHRONICLE_COOKIE` which `resolveToken` exchanges for a JWT via
  `GET /api/v1/whoami/dump` (guarded by header `X-Chronicle-Token-Dump`).
- Cookie detection keys on the cookie **name** (`chronicle_auth_session=`), NOT
  on `=`, because the gorilla base64 value ends in `=` padding.
- **`setBrowserHeaders` sets `Sec-Fetch-Site: same-origin` on every CLI
  request.** Server `BrowserOnly` middleware rejects requests with empty/
  cross-site `Sec-Fetch-Site`. This is a CLI-only emulation — do **not** add
  server bypasses for it.

## Interactive flow (`interactive.go`, `tui.go`)

`dbcdata import --api-url …` (without `--yes`) runs: dataset selector
(`GET /api/v1/admin/datasets`) → **molly guard** showing affected tenants
(`GET /api/v1/admin/datasets/{id}/tenants`) with Yes-all / Yes-some / Cancel →
optional importer multi-select. `--yes` skips all prompts but then requires
`--dataset-id`. `tui.go` provides reusable `runSingleSelect` / `runMultiSelect`
bubbletea models.

## Conventions & pitfalls

- Game data is dataset-scoped via **explicit `WHERE dataset_id = $n`**, never
  RLS (RLS is tenant-only). Every game-data INSERT/SELECT carries `dataset_id`.
- The default dataset UUID is `servicedataset.DefaultDatasetID`
  (`00000000-0000-0000-0000-000000000001`); upload endpoints default to it for
  backwards compatibility.
- `.gitignore` has anchored binary patterns (`/dbcdata`, `/chronicled`). A bare
  `dbcdata` pattern once shadowed `scripts/dbcdata/` and silently dropped new
  source files — after adding a file, confirm with `git status` /
  `git check-ignore -v <path>`.
- Validate the frontend with `pnpm build` (runs `tsc -b`), not `tsc --noEmit`.
