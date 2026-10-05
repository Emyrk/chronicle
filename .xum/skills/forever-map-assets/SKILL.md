---
name: forever-map-assets
description: Extracts, validates, maintains, and publishes WoW Forever UI map artwork and coordinate manifests. Use when running the maps Make target, updating the Forever map DB2 pipeline, changing its manifest, or checking icons.chronicleclassic.com/forever/maps assets.
metadata:
  type: workflow
  binding: advisory
---

# Forever map assets

Maintain Chronicle's WoW Forever UI map export. The public entry point is `make maps`; implementation lives in `scripts/dbcdata/cli/extractwowdatamaps.go`, `frontend/imagecache/upload-maps-r2.sh`, and the map targets in `Makefile`.

## Quick start

Publish the latest map dataset:

```bash
make maps
```

This resolves Blizzard's `latest` build once, extracts map metadata and missing WebP tiles, then uploads them under `https://icons.chronicleclassic.com/forever/maps/`.

Do not run the publishing target merely to inspect a change. Use the checks below first.

## Workflow

1. Generate and inspect metadata without downloading or uploading tiles:

   ```bash
   out="$(mktemp -d)"
   go run ./scripts/dbcdata extract-wowdata-maps --metadata-only --out="$out"
   jq '{format, target, maps: (.maps | length)}' "$out/manifest.json"
   ```

2. Run the focused automated checks after changing extraction or manifest behavior:

   ```bash
   go test ./scripts/dbcdata/cli ./scripts/dbcdata
   golangci-lint run ./scripts/dbcdata/...
   bash -n frontend/imagecache/upload-maps-r2.sh
   git diff --check
   ```

3. Inspect Make expansion without publishing:

   ```bash
   make -n maps
   ```

4. Run `make maps` only when the user intends to publish assets and R2 credentials are configured.

## Maintenance map

- `scripts/dbcdata/cli/extractwowdatamaps.go`: DB2 row types, manifest format, build resolution, tile export, and deterministic ordering.
- `scripts/dbcdata/cli/extractwowdatamaps_test.go`: manifest joins, ordering, build resolution, and output tests.
- `scripts/dbcdata/main.go`: command registration.
- `frontend/imagecache/upload-maps-r2.sh`: R2 paths, content types, and cache headers.
- `Makefile`: `maps`, `maps/forever`, extract, and upload entry points.
- `frontend/chronicle/src/pages/Technical/MapGalleryPage.tsx`: `/technical/maps` consumer using the selected dataset's icon base URL.
- `frontend/chronicle/src/pages/Technical/mapGallery.ts`: frontend manifest contract, asset URLs, ordering, and tile positioning.
- `docs/wow-forever-game-data.md`: operator documentation and public URL layout.

## Data model

The manifest joins these DB2 tables:

```text
UiMap.ID
  -> UiMapAssignment.UiMapID
  -> UiMapXMapArt.UiMapID
  -> UiMapArt.ID
  -> UiMapArtStyleLayer.UiMapArtStyleID
  -> UiMapArtTile.UiMapArtID + LayerIndex
```

Keep `UiMapAssignment.Region`, `UiMin`, and `UiMax` in source DB2 order. Do not assign inferred axis names or bake a coordinate transform into extraction until it is verified against known in-game positions.

Keep output deterministic:

- maps sorted by UI map ID;
- assignments sorted by assignment ID;
- art sorted by phase then art ID;
- layers sorted by layer index;
- tiles sorted by row, column, then FileDataID;
- tile paths based on FileDataID so duplicate textures share one object.

## Build handling

`--build latest` is the default. The extractor must resolve it once with `wowdata casc info`, replace it with the exact `buildName`, and use that exact build for all DB2 and texture requests. The manifest records the exact build, never the literal value `latest`.

An explicit build remains available for reproducing an older export:

```bash
WOWDATA_BUILD=1.60.1.70205 make maps/forever-extract
```

Do not update a hard-coded default when Forever releases a new build; the default is intentionally `latest`.

## Publishing contract

The stable public layout is:

```text
forever/maps/manifest.json
forever/maps/tiles/<FileDataID>.webp
```

Tiles use `Cache-Control: public, max-age=31536000, immutable`. The manifest uses a short cache because its stable URL advances to the newly extracted build. Preserve `Content-Type: image/webp` for tiles and `application/json` for the manifest.

Before changing paths, cache headers, or the manifest format, check all consumers and coordinate the rollout. If the manifest contract changes incompatibly, introduce a new format version rather than silently changing `chronicle-wow-map-art-v1`.

## Self-check

- `make maps` expands to the complete Forever extract-and-upload pipeline.
- `--build latest` resolves to an exact build in command output and `manifest.json`.
- Metadata extraction returns at least one map and one referenced tile.
- A sampled exported tile starts with RIFF bytes and contains `WEBP` at bytes 8 through 11.
- No credentials, generated tiles, temporary manifests, or R2 configuration are committed.
