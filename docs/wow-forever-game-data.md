# WoW Forever game-data import

Chronicle imports WoW Forever game data directly from a local Blizzard client through the external `wowdata` executable. Modern clients store DB2 tables in CASC; they do not expose the legacy MPQ/DBC files consumed by `dbcdata import`.

## Import directly from the game installation

Validate extraction and conversion without changing a server. If `wowdata` is not installed, Chronicle builds the tested pinned revision into the user's cache automatically:

```bash
go run ./scripts/dbcdata import-wowdata \
  --client "/path/to/World of Warcraft" \
  --product wow_classic_beta \
  --build 1.60.1.69913 \
  --dry-run
```

Upload directly to a dataset:

```bash
go run ./scripts/dbcdata import-wowdata \
  --client "/path/to/World of Warcraft" \
  --product wow_classic_beta \
  --build 1.60.1.69913 \
  --api-url https://chronicle.example.com \
  --dataset-id <dataset-uuid> \
  --token <bearer-token>
```

The client path is the directory containing `.build.info` and `Data/`, not the `_classic_beta_` executable directory. The command extracts a temporary normalized snapshot, applies the matching locale `DBCache.bin` overlay, converts the split modern tables, uploads a gzip JSON payload, and removes the temporary snapshot. Use `--snapshot-out PATH` to retain the extracted data for inspection or reuse.

By default, extraction discovers exactly one `<client>/*/Cache/ADB/<locale>/DBCache.bin`. Use `--dbcache PATH` to select one explicitly. Extraction fails if no unambiguous cache exists, if its V9 header build differs from `--build`, or if its records have an empty or mixed numeric region. Use `--no-hotfix` only for an intentional base-data snapshot; the manifest then records `hotfix.applied=false` rather than implying that a cache was applied.

### Use Blizzard's remote base data with the local hotfix cache

If the installed CASC indexes resolve a required table to an unreadable local
archive entry, use `--source remote`. The importer downloads the exact requested
base build from Blizzard, then still discovers and applies the client's local
`DBCache.bin` overlay:

```bash
go run ./scripts/dbcdata import-wowdata \
  --client "/path/to/World of Warcraft" \
  --source remote \
  --product wow_classic_beta \
  --build 1.60.1.70205 \
  --dry-run
```

The dedicated `scripts/upload-dbc/forever.sh` upload uses this mode because the
current Forever installation can resolve `TraitTree` to an invalid local BLTE
entry.

## Reuse an existing snapshot

Extraction remains available as a separate debugging and archival step:

```bash
scripts/dbcdata/extract-wowdata.sh \
  --client "/path/to/World of Warcraft" \
  --product wow_classic_beta \
  --build 1.60.1.69913 \
  --out ./export/wow-forever

go run ./scripts/dbcdata import-wowdata \
  --snapshot ./export/wow-forever \
  --build 1.60.1.69913 \
  --dry-run
```

Use `--limit` on the extraction script only for smoke tests; limited snapshots are intentionally rejected by the importer. Snapshot extraction also records the modern listfile mapping from icon FileDataIDs to `Interface/Icons/*.blp` names. If listfile preparation is unavailable, table extraction still succeeds and prints a warning, but icon paths remain unresolved.

Each applied snapshot keeps the existing `chronicle-wowdata-snapshot-v1` format and adds a `hotfix` provenance object plus `hotfix/receipt.json`. The manifest records the cache SHA-256, size, V9 version, header build, Blizzard region string, numeric cache region, locale, status counts, affected table/row counts, and receipt SHA-256. The converter verifies the receipt and matching build/region/locale before using an applied snapshot. Older v1 snapshots without a `hotfix` object remain readable.

Overlay records are ordered deterministically by push ID, unique ID, and cache order for each table and record. Status 1 replaces or creates a complete row, status 2 deletes it, and statuses 3 and 4 are recorded but do not modify base rows. Any affected imported table that lacks a known table hash, build DBD, or decodable payload fails extraction instead of being silently skipped.

## Extract and publish icons

Export only the spell and item icons referenced by a retained snapshot. `wowdata` converts the CASC BLP textures directly to lossless WebP, so the legacy MPQ/Pillow conversion stage is not used:

```bash
scripts/dbcdata/extract-wowdata-icons.sh \
  --snapshot ./export/wow-forever \
  --client "/path/to/World of Warcraft" \
  --out frontend/imagecache/forever/icons
```

To export, generate `icon-list.json`, and upload through the existing R2 pipeline:

```bash
SERVER=forever make icons
```

This uses the configured default Forever client path, provisions the pinned `wowdata` binary when needed, creates a temporary snapshot, exports the referenced icons, and uploads them through the existing R2 pipeline. Set `WOW_CLIENT_PATH` to override the client location.

The Forever dataset should use its own icon base URL, for example `https://icons.chronicleclassic.com/forever`, in the dataset settings.

## Extract and publish UI maps

Chronicle can export WoW Forever's `UiMap` artwork for position visualizations. The extractor reads the UI map art and assignment tables, `WorldMapOverlay` and `WorldMapOverlayTile` for fully explored zone artwork, plus `Map` and the client listfile for available dungeon and raid floors. It then exports every referenced BLP FileDataID directly as WebP:

```bash
go run ./scripts/dbcdata extract-wowdata-maps \
  --build latest \
  --out frontend/imagecache/forever/maps
```

The command defaults to `--build latest` against Blizzard's remote `wow_classic_beta` data because the current local Forever CASC index contains an unreadable BLTE entry. At startup, `latest` is resolved once to an exact build; that build is then used for every table and texture request and recorded in the manifest. This prevents a release during extraction from mixing assets across builds. Use `--source local --server forever` when the installed client data is healthy. Existing non-empty tiles are retained, so interrupted exports can be resumed. Pass `--metadata-only` to refresh and inspect the manifest without downloading tiles.

`make maps` also reads the currently published manifest when it targets the exact same build, region, and locale, then reuses its already-published FileDataID tile URLs. Only tiles absent from that manifest are downloaded and converted locally before upload, using four concurrent `wowdata` processes by default. Set `WOWDATA_MAP_REUSE_MANIFEST=` to force a complete local export, point it at another compatible published manifest, or set `WOWDATA_MAP_WORKERS` to tune concurrency. Generated map manifests and tiles under `frontend/imagecache/forever/maps/` are ignored by Git and should remain in object storage rather than source control.

The output layout is:

```text
frontend/imagecache/forever/maps/
├── manifest.json
└── tiles/
    └── <FileDataID>.webp
```

`manifest.json` uses the `chronicle-wow-map-art-v1` format. It records the product and build, map hierarchy, phase-specific artwork, explored-area overlays, available dungeon and raid floors, layer and tile dimensions, and the raw `UiMapAssignment` `Region`, `UiMin`, and `UiMax` arrays needed to convert world coordinates into UI coordinates. The arrays are intentionally preserved in DB2 order rather than assigning inferred axis names. Instance floors are included only when the client listfile contains a complete 12-tile map canvas, so instances without published artwork remain absent rather than receiving guessed geometry.

To extract and upload the tiles and manifest to Cloudflare R2:

```bash
make maps
```

This publishes the manifest at `https://icons.chronicleclassic.com/forever/maps/manifest.json` and tiles under `https://icons.chronicleclassic.com/forever/maps/tiles/`. The `/technical/maps` page discovers those paths from the selected dataset's configured icon base URL. Tile responses are immutable for one year; the manifest uses a one-hour cache so a newly published build can become visible without renaming the base URL. Set `WOWDATA_BUILD`, `WOWDATA_BIN`, or `WOWDATA_CACHE` to override their defaults. `R2_REMOTE`, `R2_BUCKET`, and `R2_PATH` override the upload destination.

The importer sends the converted payload to:

```text
PUT /api/v1/game-data/datasets/{datasetID}/wowdata-snapshot
```

The endpoint requires the existing global world-data administration permission.

## Supported data

The first importer persists:

- legacy-compatible `dbc_spells` rows and resolved spell-icon texture mappings;
- normalized spell effects, powers, full attribute arrays, difficulty-aware variants, and component-only spell IDs;
- derived extra-attack, periodic-spell, duration-modifier, vulnerability, cooldown, and affected-aura-duration metadata at difficulty zero;
- cast-time, duration, range, category, radius, focus-object, and description-variable metadata;
- item rows having both `Item` and `ItemSparse` records;
- active class talent trees reconstructed from the modern Trait DB2 graph;
- spell-item enchantments;
- item-set metadata and membership.

The legacy `dbc_spells` projection is deterministic: it uses `DifficultyID=0`, effects 0 through 2, the first nine attributes, and the lowest ordered spell power. The normalized spell tables preserve all imported effects, powers, attributes, and difficulty-aware component rows. The CLI loss report distinguishes compatibility-projection omissions from unsupported source data, such as missing `ItemSparse` records.

## DBCache hotfix revisions

The client can retain a `DBCache.bin` from the preceding build revision after a
Forever client update. The importer resolves the cache's full build through the
DBD metadata and accepts a different final revision within the same version
family, such as `1.60.1.70170` for a `1.60.1.70205` snapshot. It records both
builds in the snapshot provenance. Different version families are rejected, and
hotfix payloads are decoded with the target build's DBD schema so incompatible
record layouts still fail rather than being silently applied.

## Modern talent conversion

Forever build `1.60.1.69913` uses the active Trait tables rather than the obsolete `Talent` and `TalentTab` tables. The snapshot therefore requires `TraitTree`, `TraitNode`, `TraitNodeEntry`, `TraitDefinition`, `TraitEdge`, `TraitNodeXTraitNodeEntry`, `TraitNodeGroup`, `TraitNodeGroupXTraitNode`, `TraitNodeGroupDisplayInfo`, `SkillLineXTraitTree`, and `SkillLine`.

`SkillLineXTraitTree` identifies each class tree through its representative classic specialization skill line. `TraitNodeGroupDisplayInfo` supplies the three displayed tabs, their names through `SkillLine`, and their order. Group membership selects the nodes for each tab. The converter clusters the roughly 600-unit node coordinates, tolerating the small coordinate jitter in the client data, then assigns compact tier, column, and deterministic tab indexes.

Each exported talent keeps `TraitNode.ID` as its `id`. The optional `traitNodeEntryIDs` array preserves the linked `TraitNodeEntry.ID` values needed to resolve V22 tuples such as `(105888,130618,5)`. `TraitDefinition.SpellID` supplies the spell, while the converted spell and icon data supply its display name and texture. Multi-rank Trait entries repeat that spell ID in `spellRanks` so existing rank-indexed consumers retain their expected shape.

`TraitEdge` supplies the dependency lines between talents. The converter preserves type 0 edges as visual-only connections, type 2 edges as sufficient prerequisites where any incoming parent can unlock the child, and type 3 edges as required prerequisites where every incoming parent must be complete.

Forever's separate Legacy progression system is exported from TraitSystem 45 as `legacyTrees`. Trees 1187, 1188, and 1189 represent Professions, Adventure, and Resourcefulness. They share a 16-point budget, progress left to right, and unlock later columns after 5 and 10 points spent in the same tree. Placeholder nodes whose spell name is `Unknown` are omitted until the client exposes their final definitions.

## Known limitations

The importer does not guess identifiers or silently treat modern fields as legacy equivalents. In particular:

- Icon FileDataIDs without a community-listfile entry remain unresolved.
- Item display IDs, combat stats, damage/armor curves, item effects, random properties, and item-set bonuses are not yet reconstructed. Item icons are resolved directly from `Item.IconFileDataID` through the extracted client listfile.
- The legacy `dbc_spells` projection exposes only effects 0 through 2, the first nine attributes, the first ordered power, and `DifficultyID=0`. Consumers that need the complete modern data must use the normalized spell effects, powers, and variants.

These gaps are tracked as GitHub issues rather than filled with inferred values.
