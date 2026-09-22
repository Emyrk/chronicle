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

The client path is the directory containing `.build.info` and `Data/`, not the `_classic_beta_` executable directory. The command extracts a temporary normalized snapshot, converts the split modern tables, uploads a gzip JSON payload, and removes the temporary snapshot. Use `--snapshot-out PATH` to retain the extracted data for inspection or reuse.

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

Use `--limit` on the extraction script only for smoke tests; limited snapshots are intentionally rejected by the importer.

The importer sends the converted payload to:

```text
PUT /api/v1/game-data/datasets/{datasetID}/wowdata-snapshot
```

The endpoint requires the existing global world-data administration permission.

## Supported data

The first importer persists:

- spells and the supported legacy-compatible spell fields;
- cast-time, duration, range, category, radius, focus-object, and description-variable metadata;
- item rows having both `Item` and `ItemSparse` records;
- talent trees;
- spell-item enchantments;
- item-set metadata and membership.

Conversion is deterministic: only `DifficultyID=0` rows are selected, only effects 0–2 fit Chronicle's current spell model, the lowest spell-power order wins, and missing `ItemSparse` records are reported and skipped. The CLI prints a loss report for every conversion.

## Known limitations

The importer does not guess identifiers or silently treat modern fields as legacy equivalents. In particular:

- FileDataIDs are not resolved to icon texture paths.
- Item display IDs, combat stats, damage/armor curves, item effects, random properties, and item-set bonuses are not yet reconstructed.
- Effects after index 2, attributes after the first nine, extra power rows, and non-zero difficulty spell variants do not fit Chronicle's current spell model.
- Talent icon textures remain empty.
- `DBCache.bin` hotfix overlays are not applied by the extraction script.
- Existing derived extra-attack, periodic-spell, and duration-modifier generation is not yet run from the modern representation.

These gaps are tracked as GitHub issues rather than filled with inferred values.
