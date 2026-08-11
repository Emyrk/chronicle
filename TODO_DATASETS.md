# Tenant Datasets: Per-Tenant Game Data

Move WoW game data (spells, cast times, icons, talents, etc.) from compiled-in
build tags to database-backed **datasets**, so a single binary can serve
multiple WoW versions/flavors. Game data is scoped per dataset; user data stays
scoped per tenant.

## Status Key
- [ ] Not started
- [x] Done
- [~] In progress

---

## Shipped & deployed

The foundation plus the first end-to-end data type (**talents**) shipped in
PR #114 and is **deployed to production**. The completed task breakdown has been
removed from this plan; the durable record lives in the vault:

- `chronicle-dataset-architecture` — dataset-vs-tenant scoping, default dataset,
  composite PKs, resolution order.
- `chronicle-dataset-loader` — the `dbcdata import` loader, the per-type
  migration recipe, and this remaining roadmap.
- `.mux/skills/dataset-import/` — repo skill: how to add a new importer.

What's live now: the `datasets` table + `servicedataset` CRUD, `default_dataset_id`
on tenants/servers, the well-known default dataset
(`00000000-0000-0000-0000-000000000001`), `dataset_id` on every `world_*`/`dbc_*`
table (composite PK, backfilled to default), `ResolveDatasetByRealm`, the talents
JSONB pipeline (`/wowdb/talent-trees`), and the `dbcdata import` CLI with Bearer
auth.

> **Migrations 000119–000121 are deployed and therefore immutable.** Any schema
> change for the remaining work needs a NEW migration.

---

## Conventions (for the remaining work)

- Run `make gen/db` after changing migrations or queries; `make lint` and
  `make test` (with `-tags turtle`) before claiming done.
- Use `./database/migrations/create_migration.sh "description"` for the next
  migration number (do NOT hardcode — and never edit a deployed migration).
- Follow the `database/queries/tenants.sql` `COALESCE(sqlc.narg(...), col)`
  pattern for updates.
- Dataset scoping is **explicit `WHERE dataset_id = $n`**, NOT RLS. RLS is
  tenant-only. Do not add dataset logic to `servicetenant`'s `PrepareConn` hooks.
- All `world_*`/`dbc_*` tables carry `dataset_id` in their composite PK
  (everything game-data is dataset-scoped, currently all on the default dataset
  until each type is migrated).
- The `GameDB` interface composes per-type `Fetcher`s (see `gamedb/talents` for
  the pattern). New fetchers are dataset-scoped and injected via `Options`.
- **`parsectx` now carries resolution metadata** (realm, tenant_id, dataset_id,
  flavor, format), populated by the pre-scan before full parse. This **reverses**
  the earlier "keep `parsectx` minimal / resolve outside the parser" guidance —
  see the Log Format / Flavor Split section for why. Today `parsectx.Context`
  holds only `Type database.LogType`.
- Object storage uses buckets. Combat logs are in `raidlogs` (`logs/{fileID}`).
  DBC files go in a new bucket (`datasets`) with key `datasets/{datasetID}/{filename}`.

---

## Architecture Decisions

### Dataset Scoping: Explicit `WHERE`, NOT RLS (changed from original plan)

Datasets and tenants use **different** mechanisms on purpose:

- **Tenants** scope user-generated data (logs, armory, guild pages) via Postgres
  **RLS** + the `app.tenant_id` session variable.
- **Datasets** scope game reference data (spells, items, talents) via **explicit
  `WHERE dataset_id = $n`** in every query. No session variable, no RLS.

The original plan proposed an `app.dataset_id` session variable mirroring tenant
RLS. That was rejected: game data is not a security boundary, so RLS adds
complexity for no benefit, and explicit scoping is easier to read and test.

How the dataset is resolved per request:

```
Request that references game data (instance / armory)
  → ResolveDatasetForRealm(realmID): realm → server.default_dataset_id
                                     → tenant.default_dataset_id → compiled default
  → dataset_id stamped on the response body + X-Chronicle-Dataset header
  → frontend forwards dataset_id to game-data fetches (e.g. talent trees)

Direct game-data endpoint (e.g. /wowdb/talent-trees)
  → explicit ?dataset_id, else request tenant's default, else compiled default
```

### Primary Domain Problem (No Tenant → No Dataset)

Realm is detected from `REALM_INFO` in the combat log, but WoWDB (and the
dataset/flavor) are needed **before** full parse. Today `parsectx` only carries
`LogType`.

**Decided solution (revised):** A lightweight **pre-scan** runs before full
parse. It detects the log **format**, validates it against the
selected/expected flavor, resolves `realm → server → tenant → dataset + flavor`,
and **stamps all of it onto `parsectx`** so the parser reads metadata from one
place. See the Log Format / Flavor Split section. (This supersedes the earlier
"resolve outside the parser, keep `parsectx` minimal" note.)

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

### JSONB vs Separate Tables: Pick by Shape (refined during implementation)

The original plan said "never JSONB, always separate tables." Implementation
refined this: **choose by data shape.**

- **Document-shaped, read as a whole, never queried per-row → JSONB.**
  Talents shipped this way: `dataset_talent_trees(dataset_id PK, data JSONB)`.
  The frontend always fetches the entire tree blob; there is no "find talent #56
  across datasets" query. One row per dataset, one fetch, cached. Simple.

- **Row-queryable, individually looked up by ID → separate table.**
  Spells/icons/items: looked up by `entry_id` on hot paths, written
  incrementally, large (Vanilla SpellIcons ~4,000 entries; WotLK ~10,000+).
  A `(dataset_id, entry_id)` table avoids TOAST overhead on frequent reads and
  supports per-row queries. Use the per-type tables listed under Future Tasks.

Rule of thumb: if the consumer always loads the whole thing, JSONB; if it looks
up individual entries, a table.

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

## Log Format / Flavor Split (the "seam" — do this FIRST)

`database.LogType` currently smears **three orthogonal concerns** into one enum.
Splitting them is the prerequisite for runtime dataset selection and for clean
server-specific mechanics. The three axes:

| Axis | Answers | Source of truth | Cardinality |
|---|---|---|---|
| **Format** | How do I parse these bytes? | Pre-scan content detection (validated) | 4 values |
| **Flavor** | Which server mechanics apply? | Runtime-configured tag set (server > tenant) | a set of tags |
| **Dataset** | Which spells/items/talents to resolve? | server > tenant default > compiled | per server |

These are **independent**: flavor = behavior, dataset = data, format = parsing.
A server accepts multiple formats (e.g. Turtle logs arrive as `v1` and `v2`).
The same client build can have multiple formats (both 1.12a formats below produce
vanilla data but parse differently). AzerothCore logs span two formats (client
addon vs serverside mod).

### Flavor = a capability tag set (NOT a scalar)

Flavor is **not** a single name — it's a **set of behavior tags**. Servers
overlap and split on the edges (Turtle, Kronos, VanillaPlus share ~90% but
differ at the margins), so an inheritance tree doesn't fit; overlapping sets do.

- A **mechanic** is tagged with the broadest tag it needs. Shared logic →
  `vanilla`; a Turtle-only quirk → `turtle`.
- A **server's** flavor is the set of tags it satisfies, e.g.
  Turtle = `{vanilla, turtle}`, Kronos = `{vanilla, kronos}`,
  VanillaPlus = `{vanilla, vanillaplus}`, Epoch = `{wotlk, epoch}`.
- Matching is **membership only — `flavor.Has(tag)`**. No boolean expressions,
  no precedence machinery.
- **Overrides are handled in code at the mechanic site**, by checking the edge
  tag *before* the base tag:
  ```go
  if f.Has("turtle") {
      // edge behavior
  } else if f.Has("vanilla") {
      // shared base behavior (Turtle, Kronos, VanillaPlus)
  }
  ```
- **Tag sets are runtime config**, owned by the server owner per tenant (like
  datasets — NOT a compile-time code registry). Default tags are the base set
  (`vanilla`, `tbc`, `wotlk`). This means flavor identity *and* its tag set live
  in the DB / runtime config, resolved server > tenant.

### The 4 formats (collapse of the 7 `LogType`s)

| New `LogFormat` | Old `LogType`(s) | Source tool | Build |
|---|---|---|---|
| 1.12a + SuperWoW | `v1` | [SuperWoWCombatLogger](https://github.com/pepopo978/SuperWowCombatLogger) | 1.12a |
| 1.12a + addon | `v2`, `kronos` | [ChronicleCompanion](https://github.com/Emyrk/ChronicleCompanion) | 1.12a |
| 3.3.5a + addon | `warmane`, `epoch`, `azerothcore-clientside` | [ChronicleCompanionWoTLK](https://github.com/Emyrk/ChronicleCompanionWoTLK) | 3.3.5a |
| AzerothCore serverside | `azerothcore` | [mod-chronicle](https://github.com/Emyrk/mod-chronicle) | 3.3.5a |

(Final format identifier names TBD.)

### Resolution & selection rules

- **Format is content-detected, not trusted.** The pre-scan sniffs lines to
  determine the format, then **validates** it against what the selected
  flavor/game expects, and **rejects on mismatch** with a clear error. An
  uploader's declared type is a hint, not the truth.
- **Flavor (tag set) is selected, then persisted.** Tenant default if on a
  tenant; user-selected otherwise. On a **primary domain**, if more than one
  flavor is allowed, the upload UI must present a **"Game" selector** so the user
  knows which server they're uploading to (a primary can host, e.g., one v2
  tenant and one azerothcore tenant). Resolution mirrors dataset: server >
  tenant default. The resolved tag set is what the parser checks via `.Has()`.
- **Format and flavor are persisted per-instance** for deterministic reparse
  (persist-but-revalidate on reparse). Keep the old `log_type` column during
  transition for backfill/comparison.

### Migration is an audit, not a rename

Every `switch logType` / `if logType ==` site must be re-homed onto the correct
axis (parse→format, mechanics→`flavor.Has(tag)`, data→dataset), **case by
case**. Known
non-generated consumers today: `api/upload.go`, `api/serviceazerothcore/upload.go`,
`chronicle/logparse.go`, `chronicle/regression.go`,
`combatlog/parser/vanilla/state/encounters/instances/hookable.go`,
`database/models.go` (~6 files). Compare each instance's new vs old type during
backfill and handle discrepancies individually.

### The seam, as two PRs (FIRST in the order)

1. **`LogFormat` enum + flavor tag set** — introduce the 4-value `LogFormat`
   enum and a flavor tag-set type with `.Has(tag)`. Decompose the 7 `LogType`s;
   migration adds a per-instance `format` column + flavor tag config (keep
   `log_type`), backfilled per the table above. Default tag sets:
   `vanilla`/`tbc`/`wotlk`. Audit & re-home every consumer onto the right axis
   (parse→format, mechanics→`flavor.Has(tag)`, data→dataset). No behavior change.
2. **Pre-scan + `parsectx` metadata** — content-based format detection with
   mismatch rejection; resolve `realm → server → tenant → dataset + flavor`;
   stamp realm/tenant/dataset/flavor/format onto `parsectx.Context`; add the
   primary-domain "Game" selector. Dataset still resolves to default; flavor
   mechanics unchanged. This is the no-op plumbing that makes every later swap a
   one-line "stop ignoring the field that's already here" behind a default
   fallback.

---

## Future Tasks (remaining data-type migrations)

The foundation is shipped. Each remaining game-data type is migrated
**independently, end-to-end**, following the recipe that talents proved.

### Per-data-type migration recipe (proven by talents)

For each data type, in one PR:

1. **Storage** — pick JSONB (document-shaped) or a `(dataset_id, entry_id)`
   table (row-queryable). See the JSONB-vs-tables decision above.
2. **Fetcher** — a `gamedb/<type>` package with a narrow `Fetcher` interface +
   per-dataset LRU cache; `database.Store` satisfies the narrow querier
   implicitly. Define a sentinel `ErrNo<Type>Data` for the empty case.
3. **WoWDB wiring** — add the fetcher to the `GameDB` interface + `Options`,
   inject at startup.
4. **Endpoint** — serve via WoWDB; `dataset_id` optional (resolve from context);
   **404 → graceful empty state** when not imported.
5. **Importer** — add an `Importer` to the `dbcdata import` registry
   (declare `RequiredFiles()`; raw-DBC passthrough or compute-then-upload).
6. **Frontend** — fetch with the resolved `dataset_id` (already on instance/
   armory responses); handle 404 gracefully.
7. **Cleanup** — once populated in prod, delete the static asset + its
   `generate*` step (do this only after the import has run in prod).

Keep each type a separate PR so behavior changes are isolated and reviewable.

### Future: class-spells (next up — direct sibling of talents)

`class-spells.json` is still generated by `derived-statics` into
`assets/*/generated/`. It is document-shaped (frontend loads the whole map), so
it follows the talents recipe almost verbatim: JSONB table
`dataset_class_spells`, a `gamedb/classspells` fetcher, a `/wowdb/class-spells`
endpoint, a `class-spells` importer, then remove the static asset + generation.
This is the lowest-risk next migration.

### Future: DBC Upload Endpoints
- [ ] `PUT /api/v1/datasets/{id}/dbc/{filename}` — upload any DBC file
- [ ] `GET /api/v1/datasets/{id}/dbc` — list stored DBC files
- [ ] `GET /api/v1/datasets/{id}/dbc/{filename}` — download a DBC file
- [ ] `DELETE /api/v1/datasets/{id}/dbc/{filename}` — remove a DBC file
- [ ] Create `datasets` bucket in object storage on service startup

### ~~dbcmem Lookup Tables~~ ✅ DONE (PR #149)

All per-dataset lookup tables shipped in migration 000130+000131.
Spell struct refactored: ID wrapper types replaced with resolved `dbcmem.*`
structs. LEFT JOINs resolve metadata at query time. Upload handlers + CLI
importers for all 8 companion DBC types. Derived tables auto-populate on
spell import. Wipe-before-insert on re-import.

- [x] `dbc_spell_cast_times`, `dbc_spell_icons`, `dbc_spell_durations`
- [x] `dbc_spell_ranges`, `dbc_spell_categories`, `dbc_spell_radii`, `dbc_spell_focus_objects`
- [x] `dbc_periodic_spells`, `dbc_extra_attack_spells`, `dbc_duration_modifiers` (derived)
- [x] `dbc_spell_description_variables` (tooltip `$<name>` resolution)
- [ ] `dbc_vulnerability_spells` — skipped (no consumer yet)

### ~~DBCMemProvider Interface~~ ✅ DONE (PR #149)

Consumers decoupled from `dbcmem` globals via WoWDB resolvers:

- [x] `MaxAuraDuration` accepts `*chrondbc.DurationModifierSet` param
- [x] `extrattack.go` uses `GameDB.ExtraAttackSpell()` resolver
- [x] `GameDB` extended with `ExtraAttackSpell()`, `DurationModifiers()`, `PeriodicSpells()`
- [x] Per-dataset LRU caches with DB→compiled-in fallback

### ~~Dataset-Aware WoWDB~~ ✅ DONE (PRs #138–#149)

- [x] `ForDataset(datasetID) → GameDB` returns `ScopedGameDB`
- [x] Per-dataset LRU caches for all spell-related data

### ~~Parser Integration~~ ✅ DONE (PRs #142–#143)

- [x] Pre-scan `scanRealmName()` + `resolveDataset()` + `ForDataset()` wiring

### Future: Frontend Technical Pages

- [ ] DurationModifiers page — migrate from compiled TS constants to API endpoint
- [x] ExtraAttackSpells page — migrated to `GET /wowdb/extra-attack-spells`
- [x] VulnerabilitySpells page — migrated to `GET /wowdb/vulnerability-spells`

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
1. ✅ **Foundation (shipped, PR #114)** — datasets table, SDK, CRUD service,
   composite-PK migration, explicit `dataset_id` scoping, realm resolver,
   import CLI + auth. **Deployed to production.**
2. ✅ **Talents** — first data type migrated end-to-end (the recipe).
3. ✅ **Seam — log format / flavor split** (10-PR Graphite stack, #117–#128,
   merged to main). Decomposes `LogType` into `LogFormat` enum + `WoWFlavor`
   capability tag set; rehomes consumers; persists format/flavor columns;
   stamps onto `parsectx`; surfaces in UI (upload + admin reparse + metadata
   panel). Verified as a **mergeable production no-op checkpoint** — zero
   behavior change on any deployed server. Regression analysis in the vault:
   `[[chronicle-dataset-loader]]` § "Log format / flavor seam —
   merge-readiness". One regression found & fixed: incomplete
   `serverCapabilities` lookup table in the frontend could mis-stamp
   unconfigured builds; guarded with a "defer to server" fallback.
4. ✅ **Dataset assignment** — PUT endpoints for server/tenant datasets (#138).
5. ✅ **Per-dataset WoWDB** — instrumented LRU caches, ForDataset(), ScopedGameDB (#139).
6. ✅ **Pre-scan + ForDataset wiring** (#140–#143).
7. ✅ **Spells migrated to DB** (#144–#145).
8. ✅ **Per-dataset icon CDN** (#146).
9. ✅ **Flavor-aware registries** (#147).
10. ✅ **Package moves** — vanilla/state → parser/common (#148).
11. ✅ **dbcmem migration** — lookup tables, Spell struct refactor, WoWDB resolvers,
    upload handlers, CLI importers, derived data, tooltip `$<name>` resolver (#149).
12. **class-spells** — direct sibling of talents (document-shaped/JSONB).
13. DurationModifiers + VulnerabilitySpells Technical page migrations.
14. Prometheus metrics (drive caching strategy).
15. Remove compiled-in data (delete `dbcmem` globals, build-tag wiring,
    `assets/{server}/`).

### Memory Budget
- Each loaded dataset: DBC files (~2–7 MB) + 12 lookup maps (~1–3 MB) ≈ 3–10 MB
- LRU cache of 5 datasets ≈ 15–50 MB total — acceptable
- Hot caches for individual lookups: TBD based on access patterns
