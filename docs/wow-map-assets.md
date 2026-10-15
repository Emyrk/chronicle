# WoW map assets

Chronicle publishes each dataset's map manifest beneath its configured icon base URL:

```text
<icon-base>/maps/manifest.json
<icon-base>/maps/manifest.original.json
<icon-base>/maps/manifest.rendered.json
<icon-base>/maps/manifest.styled.json
<icon-base>/maps/manifest.renders.json
<icon-base>/maps/manifest.3d.json
<icon-base>/maps/original/<tile-id>.webp
```

The frontend accepts v1 published manifests during migration; all new imports use v2. `make maps` works for each `SERVER` and publishes native artwork under `original/`. Raw geometry and hand-authored art are independent optional layers under `render/` and `render-styled/`. The publisher merges their root-level source manifests into `manifest.json` after each job. Generated manifests and tiles live under `frontend/imagecache/<server>/maps/`, are ignored by Git, and are published to object storage.

## MPQ-era clients

Turtle WoW, AzerothCore 3.3.5a, and the 2.4.3 TBC client use the legacy extractor. It reads `WorldMapArea.dbc`, `WorldMapOverlay.dbc`, `AreaTable.dbc`, and `Map.dbc`, discovers `Interface/WorldMap` BLP files from the MPQ listfiles, converts referenced artwork to WebP, and emits the shared manifest.

```bash
make maps/turtle
make maps/azerothcore
make maps/tbc
```

The corresponding public paths are `turtle/maps`, `azerothcore/maps`, and `tbc/maps`. Each dataset's `icon_base_url` must point at the matching server root.

Use `WOW_CLIENT_PATH` to override the configured client directory:

```bash
WOW_CLIENT_PATH=/path/to/client make maps/turtle
```

Generate metadata without converting or uploading textures:

```bash
go run ./scripts/dbcdata extract-legacy-maps \
  --server=turtle \
  --metadata-only \
  --out=/tmp/turtle-maps
```

Legacy base-zone maps use the twelve standard 256-pixel tiles plus explored overlays from `WorldMapOverlay.dbc`. Instance floors are included when a client contains a complete twelve-tile floor matching an instance in `Map.dbc`. The stock 2.4.3 client does not include dungeon floor artwork, so its manifest contains outdoor maps but no instance floors.

## Modern CASC clients

WoW Forever and current Blizzard Classic products use `extract-wowdata-maps`. See [WoW Forever game-data import](wow-forever-game-data.md#extract-and-publish-ui-maps) for build pinning, published-tile reuse, and concurrency controls.

```bash
SERVER=forever make maps
```

## Manually uploaded Forever maps

The tracked source files `frontend/imagecache/map-layers/forever/manifest.renders.json` and `manifest.3d.json` register existing assets under `forever/maps/renders/*.png` and `forever/maps/3d/*.glb`, respectively. They attach by world `mapID` (Wailing Caverns 43, Ragefire Chasm 389, Ruins of Lordaeron 2999). If the native manifest has no instance for that ID, either manual layer creates a named dungeon with `floors: []`; the other layer may then decorate it. Both manual source files include the same `name` for each map ID, and conflicting names are rejected. Native instance metadata takes precedence when it exists. Add or replace an entry in the relevant source file without deleting the other entries, then publish just that source manifest and a new merged `manifest.json`:

```bash
SERVER=forever make maps/renders-upload
SERVER=forever make maps/3d-upload
```

These commands **do not upload images or GLBs**: verify the corresponding R2 objects already exist and have the correct MIME/CORS settings before publishing. They require a v2 `manifest.original.json` on R2 for target and native map metadata, but the native manifest need not contain RFC or Ruins of Lordaeron. The merger rejects unnamed manual-only instances, incompatible products, and invalid asset paths. Publish the v2 native layer before attempting these layer-only uploads. The new merged `instances[].renders` records path and image dimensions, and `instances[]["3d"]` records the GLB path. Both are catalog metadata for now, not replay inputs: the PNGs lack calibrated world bounds, and GLB placement/frame data has not been established. The generated `render/` layer and hand-styled `render-styled/` layer remain independent.

## Forever v1 compatibility migration

The first v2 native source was derived from the previously published v1 `manifest.json` without re-extracting its tiles. It preserves native map/instance metadata and its `tiles/` paths (whose R2 objects remain available); a subsequent full native extraction will replace them with `original/` paths. The pre-migration manifest is backed up at `forever/maps/backups/manifest-v1-pre-manual-layers.json`. Its Wailing Caverns `rendered` reference pointed to an object that was no longer on R2, so that stale entry was omitted rather than carried into v2. A future raw render can be generated and published with `make maps/forever-render-upload` after a compatible local native manifest has been produced. Do not delete the legacy `tiles/` objects while the public manifest still references them.

## Cleaning generated maps

Map manifests and WebP tiles are generated files. They are ignored by Git and can be removed at any time:

```bash
make clean-maps
```

This removes every `frontend/imagecache/<server>/maps/` directory. Run the appropriate `make maps/<server>` target later to extract and publish it again.

## Validation

After changing extraction behavior:

```bash
go test ./scripts/dbcdata/cli ./scripts/dbcdata ./database/gamedb/dbcdb
golangci-lint run ./scripts/dbcdata/... ./database/gamedb/dbcdb/...
bash -n frontend/imagecache/upload-maps-r2.sh
git diff --check
```
