# Tenant Datasets — Per-Tenant Game Data & Log Types

Move WoW game data (spells, cast times, icons, etc.) from compiled-in build tags
to database-backed **datasets**. Each tenant picks a dataset and a set of
supported log types.

## Status Key
- [ ] Not started
- [x] Done
- [~] In progress

---

## Agent Task Guide

This plan is structured for parallel agent execution. Each **Task** below is
independent and self-contained. Dependencies between tasks are explicit.

**Key conventions every agent must follow:**
- Read `AGENTS.md` at repo root before writing any code
- Run `make gen/db` after changing migrations or queries
- Run `make lint` and `make test` (with `-tags turtle`) before claiming done
- Use `./database/migrations/create_migration.sh "description"` to get the next
  migration number (do NOT hardcode a number — it may have advanced)
- Follow the `database/queries/tenants.sql` `COALESCE(sqlc.narg(...), col)` pattern for updates
- `servicedataset` gets its DB store via `servicedbstore.DatabaseStore(broker)` (NOT direct pool)
- `servicetenant` owns the `PrepareConn`/`ResetConn` hooks — dataset context additions
  go there (it already manages all session variable lifecycle)
- Creatures and gear come from the world DB, not DBC — they are NOT dataset-scoped
- The `GameDB` interface has `SpellFetcher`, `GearResolver`, `CreatureFetcher`.
  Only `SpellFetcher` + `DBCMem()` are dataset-specific. `GearResolver` and
  `CreatureFetcher` are shared/world-scoped.
- REALM_INFO extraction happens during parsing (not pre-scanned). The future
  pre-scan solution should be a separate lightweight pass OUTSIDE the parser,
  not added to `parsectx` (keep it minimal).
- Object storage uses buckets. Combat logs are in bucket `raidlogs` with key
  pattern `logs/{fileID}`. DBC files go in a new bucket (e.g. `datasets`) with
  key pattern `datasets/{datasetID}/{filename}`.

---

## Task A: Migration + sqlc Queries

**Dependencies:** None
**Scope:** Database schema only. No Go service code.

- [x] Run `./database/migrations/create_migration.sh "add_datasets"` to get next number
- [x] Write the up migration:

```sql
CREATE TABLE datasets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT UNIQUE NOT NULL,
    wow_version   TEXT NOT NULL,
    build_version INT  NOT NULL DEFAULT 5875,
    description   TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE datasets ADD CONSTRAINT datasets_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$');

ALTER TABLE tenants ADD COLUMN default_dataset_id UUID REFERENCES datasets(id);
ALTER TABLE wow_servers ADD COLUMN default_dataset_id UUID REFERENCES datasets(id);
```

- [x] Write down migration: drop columns first (order matters for FK), then table
- [x] New `database/queries/datasets.sql`:
  - `GetDataset :one` — `SELECT * FROM datasets WHERE id = $1`
  - `GetDatasetBySlug :one` — `SELECT * FROM datasets WHERE slug = $1`
  - `ListDatasets :many` — `SELECT * FROM datasets ORDER BY name`
  - `InsertDataset :one` — all fields, `RETURNING *`
  - `UpdateDataset :one` — COALESCE pattern (match `UpdateTenant` in `tenants.sql`)
  - `DeleteDataset :exec` — `DELETE FROM datasets WHERE id = $1`
- [x] Add to `database/queries/tenants.sql`:
  - `SetTenantDataset :exec` — `UPDATE tenants SET default_dataset_id = $2, updated_at = now() WHERE id = $1`
- [x] Add to `database/queries/azerothcore.sql`:
  - `SetServerDataset :exec` — `UPDATE wow_servers SET default_dataset_id = $2 WHERE id = $1`
- [x] `make gen/db`
- [x] Verify: `go build -tags turtle ./...` passes

**Acceptance:** Migration applies cleanly; sqlc generates without errors; build passes.

---

## Task B: SDK Types

**Dependencies:** Task A (needs generated DB types)
**Scope:** SDK types + conversion functions only. No handlers, no service.

- [x] New `api/chroniclesdk/dataset.go`:
  ```go
  type Dataset struct {
      ID           uuid.UUID `json:"id"`
      Name         string    `json:"name"`
      Slug         string    `json:"slug"`
      WoWVersion   string    `json:"wow_version"`
      BuildVersion int       `json:"build_version"`
      Description  string    `json:"description"`
      CreatedAt    time.Time `json:"created_at"`
      UpdatedAt    time.Time `json:"updated_at"`
  }
  ```
  - `DatasetFromDB(database.Dataset) Dataset`
  - `UpsertDatasetRequest` struct with pointer fields for optional update
  - `ToInsertParams()` / `ToUpdateParams()` methods (match `UpsertTenantRequest` pattern)
- [x] Extend `api/chroniclesdk/tenant.go`:
  - Add `DefaultDatasetID *uuid.UUID `json:"default_dataset_id"`` to `Tenant`
  - Update `TenantFromDB` — read `t.DefaultDatasetID` (it's `uuid.NullUUID`)
  - Add `DefaultDatasetID *uuid.UUID` to `UpsertTenantRequest`
  - Update `ToInsertParams`/`ToUpdateParams` to handle it
- [ ] Run `make gen` to regenerate TypeScript types (deferred — frontend build not yet validated)
- [x] Verify: `go build -tags turtle ./...` passes

**Acceptance:** Types compile; frontend types regenerated; no existing tests break.

---

## Task C: `servicedataset` Service + Wiring

**Dependencies:** Task A, Task B
**Scope:** New service package, registration, route mounting. The service handles
dataset CRUD only (no DBC upload, no dataset-aware WoWDB).

### C1: Service scaffold
- [x] Add `ServiceDataset = "dataset"` to `internal/services/servicenames.go`
- [x] Create `internal/services/servicedataset/servicedataset.go`:
  - `Service` struct with `broker *services.Services`, `db database.Store`
  - `New(broker) *Service`
  - `Name() → services.ServiceDataset`
  - `DependsOn() → [servicelogger.OnLogger(), servicedbstore.OnDatabaseStore()]`
  - `Configures() → nil`
  - `Options() → nil` (no CLI flags needed yet)
  - `Start()` — get DB from `servicedbstore.DatabaseStore(s.broker)`
  - `Close() → nil`
  - Export helpers: `OnDataset()`, `Dataset(broker)`

### C2: Handlers
- [x] Create `internal/services/servicedataset/handler.go`:
  - `Routes() http.Handler` — chi router
    - `GET /` → List
    - `POST /` → Upsert (create)
    - `GET /{datasetID}` → Get
    - `PUT /{datasetID}` → Upsert (update)
    - `DELETE /{datasetID}` → Delete
  - All handlers use `servicetenant.AdminBypass(ctx)` for DB queries (datasets
    table is not behind RLS)
  - Follow `servicetenant/handler.go` patterns exactly

### C3: Context helpers
- [x] Create `internal/services/servicedataset/context.go`:
  - `WithDatasetID(ctx, uuid.UUID) context.Context`
  - `DatasetIDFromContext(ctx) uuid.UUID` (returns `uuid.Nil` if unset)

### C4: Wiring
- [x] `cmd/chronicled/cli/server.go` — add `servicedataset.New(srvs)` to `srvs.Register()`
  (place after `serviceassets`, before `servicechronicle`)
- [x] `api/api.go` — add `Dataset *servicedataset.Service` to `Options` struct
- [x] `api/api.go` `Routes()` — mount under admin:
  ```go
  r.Route("/datasets", func(r chi.Router) {
      r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_tenants_User))
      r.Mount("/", api.Opts.Dataset.Routes())
  })
  ```
- [x] `internal/services/serviceapi/serviceapi.go` — retrieve and pass dataset service:
  ```go
  datasetSvc := servicedataset.Dataset(s.broker)
  // add to api.Options{Dataset: datasetSvc}
  ```

- [x] Verify: `make lint`, `make build`, endpoints reachable (manual or test)

**Acceptance:** Service starts, routes registered, CRUD operations work. Existing
tests pass. `make lint` clean.

---

## Task D: Dataset Context in PrepareConn

**Dependencies:** Task C (needs context helpers)
**Scope:** Extend the existing tenant connection hooks to also propagate dataset_id.

- [ ] In `servicetenant/conn.go` `PrepareConn()`:
  - After tenant_id logic, add:
    ```go
    datasetID := servicedataset.DatasetIDFromContext(ctx)
    if datasetID != uuid.Nil {
        _, err := conn.Exec(ctx, fmt.Sprintf("SET app.dataset_id = '%s'", datasetID.String()))
        if err != nil { return err }
    }
    ```
  - **Import:** `servicedataset` package. This creates a dependency from
    `servicetenant` → `servicedataset` for the context helper only. If this
    creates an import cycle, move `WithDatasetID`/`DatasetIDFromContext` into a
    shared package (e.g. `internal/services/servicecontext/`).

- [ ] In `servicetenant/conn.go` `ResetConn()`:
  - Add: `_, _ = conn.Exec(context.Background(), "RESET app.dataset_id")`

- [ ] In `servicetenant/conn.go` `CheckNestedTx()`:
  - Add dataset_id check:
    ```go
    outerDataset := servicedataset.DatasetIDFromContext(outerCtx)
    innerDataset := servicedataset.DatasetIDFromContext(innerCtx)
    if outerDataset != innerDataset {
        return fmt.Errorf("outer tx dataset=%s but nested InTx dataset=%s", outerDataset, innerDataset)
    }
    ```

- [ ] Wire dataset_id into context during request lifecycle. In the tenant
  middleware or a new middleware, after tenant is resolved:
  ```go
  if tenant != nil && tenant.DefaultDatasetID.Valid {
      ctx = servicedataset.WithDatasetID(ctx, tenant.DefaultDatasetID.UUID)
  }
  ```
  **Note:** Check where `servicetenant.Middleware()` runs and whether
  `tenant.DefaultDatasetID` is available there (the column must be loaded in
  the tenant cache refresh).

- [ ] Verify: `make test -tags turtle`, check that existing tenant tests still pass

**Acceptance:** `app.dataset_id` is set/reset on every connection; nested tx
validation works; no regressions.

**⚠️ Import cycle risk:** If `servicetenant` → `servicedataset` creates a cycle,
extract the context key functions into `internal/services/servicecontext/dataset.go`
(a tiny package with no imports of other services). Both packages can then import it.

---

## Architecture Decisions

### Dataset Resolution via `app.dataset_id` Session Variable

Same strategy as tenant RLS. When a connection is acquired from the pool:

```
Request arrives
  → tenant middleware: ctx = WithTenantID(ctx, tenant.ID)
  → dataset context:   tenant.DefaultDatasetID → ctx = WithDatasetID(ctx, datasetID)
  → PrepareConn:       SET app.tenant_id = '...', SET app.dataset_id = '...'
  → future dbcmem tables can use WHERE dataset_id = current_setting('app.dataset_id')::uuid
```

### Primary Domain Problem (No Tenant → No Dataset)

Realm is detected **during** parsing from `REALM_INFO` in the combat log, but
WoWDB is needed **before** parsing starts. REALM_INFO is processed by the line
matcher during full parse (not pre-scanned). The `parsectx` package only carries
`LogType` — keep it minimal.

**Future solution (decided):** Pre-scan REALM_INFO before full parse. This is a
separate lightweight pass **outside** the parser (do NOT add fields to `parsectx`).
Resolve `realm → server → dataset`, then parse with the correct WoWDB.

**Current fallback:** No dataset in context → compiled-in data via build tags.

### Dataset Lives on Both `tenants` and `wow_servers`

Resolution order: `server.default_dataset_id` > `tenant.default_dataset_id` > compiled-in fallback.

Rationale: servers define their game version. A tenant with multiple servers
(e.g. Vanilla + TBC) needs per-server datasets. Tenant-level is the fallback
for single-server tenants that don't configure per-server.

### GameDB Interface — What's Dataset-Scoped vs Shared

```
GameDB interface
├── SpellFetcher       ← dataset-scoped (from DBC files)
├── GearResolver       ← shared/world-scoped (from internal_game_data DB)
├── CreatureFetcher    ← shared/world-scoped (from internal_game_data DB)
└── DBCMem() Provider  ← dataset-scoped (future, from dbcmem lookup tables)
```

`DatasetGameDB` only replaces `SpellFetcher` + `DBCMem()`. Gear and creature
lookups remain on the shared `WoWDB` regardless of dataset.

### Why Separate Tables for dbcmem (Not JSONB)

- Vanilla SpellIcons alone has ~4,000 entries; WotLK has ~10,000+
- Full dbcmem JSON blob estimated 2–5 MB per dataset
- Separate tables allow incremental writes, individual row queries, and future
  auto-scoping via `app.dataset_id` in WHERE clauses
- Avoids PostgreSQL TOAST overhead on frequent reads

### DBC File Storage

DBC files are stored in object storage under a convention-based prefix:

```
bucket: datasets
key pattern: datasets/{dataset_id}/{filename}

datasets/{dataset_id}/
├── Spell.dbc
├── SpellIcon.dbc
├── SpellCastTimes.dbc
├── SpellDuration.dbc
└── ...
```

No DB column needed — the prefix is derived from `datasets/{id}/`. Different
datasets can have different sets of DBC files (Vanilla has fewer than WotLK).
Reload/re-process a dataset by reading its DBC files back from storage.

---

## Future Tasks (Not for this round)

These tasks depend on Tasks A–D and are documented here for context.

### Future: DBC Upload Endpoints
- [ ] `PUT /api/v1/datasets/{id}/dbc/{filename}` — upload any DBC file
- [ ] `GET /api/v1/datasets/{id}/dbc` — list stored DBC files
- [ ] `GET /api/v1/datasets/{id}/dbc/{filename}` — download a DBC file
- [ ] `DELETE /api/v1/datasets/{id}/dbc/{filename}` — remove a DBC file
- [ ] Create `datasets` bucket in object storage on service startup

### Future: dbcmem Lookup Tables (one per type, all FK → datasets)

Each table stores one dbcmem map type. The `entry_id` is the original DBC ID
(the map key in current Go code). All tables share the same pattern:
`(dataset_id, entry_id) → fields`.

- [ ] `dataset_spell_cast_times` — `entry_id INT, base INT, per_level INT, minimum INT`
- [ ] `dataset_spell_icons` — `entry_id INT, texture_filename TEXT`
- [ ] `dataset_spell_durations` — `entry_id INT, duration INT, duration_per_level INT, max_duration INT`
- [ ] `dataset_spell_ranges` — `entry_id INT, range_min REAL, range_max REAL, flags INT, name TEXT`
- [ ] `dataset_spell_categories` — `entry_id INT, flags INT, uses_per_week INT, name TEXT, max_charges INT, charge_recovery_time INT, type_mask INT`
- [ ] `dataset_spell_radii` — `entry_id INT, radius REAL, radius_per_level REAL, radius_min REAL, radius_max REAL`
- [ ] `dataset_spell_focus_objects` — `entry_id INT, name TEXT`
- [ ] `dataset_periodic_spells` — `entry_id INT, name TEXT, has_direct BOOLEAN`
- [ ] `dataset_vulnerability_spells` — `entry_id INT, name TEXT, school_bitmask INT, percent_affect INT, flat_affect INT` (nullable percent/flat)
- [ ] `dataset_extra_attack_spells` — `entry_id INT, name TEXT, num_extra_attacks INT`
- [ ] `dataset_duration_modifiers` — `entry_id INT, spell_id INT, name TEXT, percent INT, flat INT, deprecated BOOLEAN`
- [ ] `dataset_duration_modifiers_by_class_bit` — `spell_class_set INT, family_mask_bit BIGINT, modifier_spell_id INT`

All tables: `PRIMARY KEY (dataset_id, entry_id)` (except `_by_class_bit` which
is `(dataset_id, spell_class_set, family_mask_bit, modifier_spell_id)`).

### Future: DBCMemProvider Interface

Decouple consumers from the `dbcmem` package-level globals so they can use
dataset-specific data.

- [ ] `dbcmem.Provider` interface in `database/gamedb/chrondbc/dbcmem/types.go`
- [ ] `GlobalProvider struct{}` wrapping existing package globals (backward-compat fallback)
- [ ] Thread provider through consumers:
  - `database/gamedb/chrondbc/durationcalc.go`
  - `internal/services/servicewowdb/servicewowdb.go`
  - `combatlog/parser/vanilla/synthetic/extrattack.go`
- [ ] `GameDB` interface gains `DBCMem() dbcmem.Provider`

### Future: Dataset-Aware WoWDB

- [ ] `DatasetGameDB` type implementing `SpellFetcher` + `DBCMem()`
  (delegates `GearResolver` and `CreatureFetcher` to shared `WoWDB`)
- [ ] `DatasetLoader` — LRU cache of loaded datasets
- [ ] `servicewowdb.GameDBForDataset(ctx, datasetID)` — returns dataset-specific or fallback

### Future: Parser Integration

- [ ] Resolve dataset in `WorkerLogParse.Work()`: log group → server → tenant → dataset
- [ ] Pre-scan REALM_INFO (lightweight pass outside parser) for primary domain uploads
- [ ] Log type validation at upload (`supported_log_types` on tenant)

### Future: Dataset Population Tooling

- [ ] `scripts/dbcdata export-dataset` — output JSON from DBC files for bulk API upload
- [ ] `chronicled dataset seed --from-compiled` — bootstrap datasets from current dbcmem globals
- [ ] `POST /api/v1/datasets/{id}/populate` — bulk-upload dbcmem tables

### Future: Frontend Asset Resolution

- [ ] `serviceassets` resolves tenant → dataset → object storage for JSON assets
- [ ] Spell icon CDN becomes dataset-aware
- [ ] Frontend `iconUrl()` uses dataset context instead of `VITE_SERVER_NAME`

### Future: Prometheus Metrics

Instrument WoWDB with Prometheus metrics to observe cache behavior and access
patterns. These drive caching strategy decisions.

**Cache metrics** (per cache, labeled by `dataset_id` where per-dataset):
- `wowdb_cache_size` (gauge) — current entries
- `wowdb_cache_capacity` (gauge) — max capacity
- `wowdb_cache_hits_total` (counter) — labeled by `cache` (spell, icon, cast_time, …)
- `wowdb_cache_misses_total` (counter)
- `wowdb_cache_evictions_total` (counter)

**Query metrics** (labeled by `data_type` and `dataset_id`):
- `wowdb_queries_total` (counter)
- `wowdb_query_duration_seconds` (histogram)
- `wowdb_query_errors_total` (counter)

**Dataset loader metrics:**
- `wowdb_dataset_loads_total` (counter)
- `wowdb_dataset_load_duration_seconds` (histogram)
- `wowdb_datasets_loaded` (gauge)

### Future: Remove Compiled-In Data

The end goal is to **remove all compiled-in static assets entirely**:
- `dbcmem` package globals → deleted
- Build-tagged wiring files (`server_turtle.go` etc.) → deleted
- `assets/{server}/` directories → deleted
- `services.ServerName` / `services.ServerBuild` → no longer needed for data selection
- `Makefile SERVER=turtle` → no longer selects game data

Each deployment becomes a single generic binary. Datasets are loaded at runtime.

---

## Design Notes

### WoWDB as the Universal Game Data Gateway

WoWDB becomes the **primary method of accessing anything related to the game
client**. All consumers (parsers, tooltip API, periodic spell lookup, duration
calc, extra attacks, frontend assets) go through WoWDB.

WoWDB will inject **hot caches** that can span datasets or be per-dataset:

```
WoWDB
├── DatasetLoader (loads full datasets from DB + object storage)
│   └── per-dataset LRU (DatasetGameDB instances, keyed by dataset_id)
│
├── Spell LRU (cross-dataset? per-dataset? TBD)
├── SpellIcon LRU
├── Cast Time LRU
└── ... other per-table caches
```

**Open questions on caching strategy:**
- Per-dataset LRUs: simple isolation, higher memory, no cross-dataset sharing
- Cross-dataset LRUs: keyed by `(dataset_id, entry_id)`, saves memory if
  datasets overlap (e.g. Vanilla spells shared by V+ and Turtle)
- Hybrid: per-dataset for the full DatasetGameDB object, cross-dataset for
  individual hot-path lookups (spell by ID, icon by ID)
- Decision deferred — implement per-dataset first, measure with metrics, then optimize

### Backward Compatibility (During Migration)
- No dataset configured → compiled-in data (current behavior, temporary)
- Empty `supported_log_types` → all types allowed
- Existing binaries → unchanged until compiled-in data is removed

### Execution Order
1. **Tasks A–D** (this round) — datasets table, SDK, CRUD service, PrepareConn plumbing
2. DBC upload endpoints + object storage bucket
3. dbcmem lookup tables (12 new tables + bulk queries)
4. DBCMemProvider interface + GlobalProvider refactor
5. DatasetLoader + DatasetGameDB + servicewowdb integration
6. Parser integration (dataset resolution + pre-scan REALM_INFO)
7. Population tooling (export, seed)
8. Frontend asset resolution
9. Prometheus metrics
10. Remove compiled-in data

### Memory Budget
- Each loaded dataset: DBC files (~2–7 MB) + 12 lookup maps (~1–3 MB) ≈ 3–10 MB
- LRU cache of 5 datasets ≈ 15–50 MB total — acceptable
- Hot caches for individual lookups: TBD based on access patterns
