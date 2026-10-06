# WoW map assets

Chronicle publishes each dataset's map manifest beneath its configured icon base URL:

```text
<icon-base>/maps/manifest.json
<icon-base>/maps/tiles/<tile-id>.webp
```

The frontend consumes the shared `chronicle-wow-map-art-v1` manifest for both modern CASC clients and legacy MPQ clients. Generated manifests and tiles live under `frontend/imagecache/<server>/maps/`, are ignored by Git, and are published to object storage.

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
