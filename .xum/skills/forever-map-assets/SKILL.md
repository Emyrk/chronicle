---
name: forever-map-assets
description: Extracts, validates, merges, and publishes Chronicle map artwork for Forever and legacy WoW servers. Use when changing map extraction, source manifests, styled or rendered layers, map Make targets, or per-server icons.chronicleclassic.com map assets.
metadata:
  type: workflow
  binding: advisory
---

# Forever map assets

Maintain the server-aware WoW map export. `SERVER=forever make maps` extracts Forever native UI art, renders configured geometry, and uploads both; `SERVER=turtle make maps` (likewise `azerothcore` or `tbc`) extracts and uploads legacy native art. Plain `make maps` uses the Makefile's default `SERVER`, **not** necessarily Forever. Do not publish merely to inspect a change.

## Workflow

1. Inspect native metadata without downloading or uploading tiles:

   ```bash
   out="$(mktemp -d)"
   go run ./scripts/dbcdata extract-wowdata-maps --metadata-only --out="$out"
   jq '{format, target, maps: (.maps | length), overlays: ([.maps[].art[].overlays[]?] | length), instances: (.instances | length)}' "$out/manifest.original.json"
   # For legacy clients: go run ./scripts/dbcdata extract-legacy-maps --server=turtle --metadata-only --out="$out"
   ```

2. Validate changes before publishing:

   ```bash
   go test ./scripts/dbcdata/cli ./scripts/dbcdata ./database/gamedb/dbcdb
   golangci-lint run ./scripts/dbcdata/... ./database/gamedb/dbcdb/...
   bash -n frontend/imagecache/upload-maps-r2.sh frontend/imagecache/tests/upload-maps-r2.test.sh
   bash frontend/imagecache/tests/upload-maps-r2.test.sh
   make -n SERVER=forever maps
   make -n SERVER=turtle maps
   git diff --check
   ```

3. Publish only when requested, with the relevant `SERVER`, client/wowdata dependencies, and R2 credentials configured. Use the target inventory below; legacy full imports publish native art only.
4. After a successful upload, verify the merged manifest and referenced assets on R2 (the public URL may serve a cached manifest for up to an hour). Then reclaim disk space occupied by generated client-derived map data with `make clean-maps`. This removes **every** `frontend/imagecache/<server>/maps/` directory, not the WoW client installation or Git-tracked styled inputs. If another server's generated output must remain available for a later upload, remove only the verified server's generated `maps/` directory instead. Never clean after a failed or unverified upload: the local manifest and assets may be needed for retry, and `--reuse-manifest-url` does not restore reused tiles to disk.

## Make target inventory

| Target | Action |
| --- | --- |
| `SERVER=<server> make maps` | Dispatch to Forever's full pipeline or a legacy native import; default `SERVER` is `azerothcore`. |
| `make maps/forever`, `make maps/forever-upload` | Extract Forever native art, render geometry, then upload both layers and merge. |
| `make maps/forever-build` | Extract and render Forever assets locally without uploading. |
| `make maps/forever-extract` | Extract Forever native tiles and `manifest.original.json` locally. |
| `make maps/forever-render` | Render geometry locally from an existing original manifest; no extraction or upload. |
| `make maps/forever-render-upload` | Render Forever geometry and upload only that layer. |
| `make maps/forever-original-upload` | Extract and upload only Forever native art. |
| `make maps/forever-styled-upload` | Upload Git-tracked Forever styled art and manifest without extracting. |
| `SERVER=<server> make maps/render-upload` | Upload already-rendered assets for that server; does not render. |
| `SERVER=<server> make maps/styled-upload` | Upload already-styled assets for that server; does not create them. |
| `SERVER=<legacy-server> make maps/legacy`, `maps/legacy-upload` | Extract and upload legacy native art; requires a legacy `SERVER`. |
| `SERVER=<legacy-server> make maps/legacy-extract` | Extract legacy native art locally without uploading. |
| `make maps/turtle`, `make maps/azerothcore`, `make maps/tbc` | Legacy server-specific full extract-and-upload aliases. |
| `make clean-maps` | Remove generated map directories for **all** servers; run only after verifying uploads. |

A dedicated Go maps command could eventually own extract/render/validate/merge/upload/verify/cleanup sequencing, leaving Make targets as thin compatibility aliases. This is a **proposal**, not an existing command: keep current Make and uploader behavior until an operator approves that refactor, including its R2 credential handling, per-layer publishing, error recovery, and tests. In particular, never make cleanup unconditional on an upload command's exit status alone.

## Maintenance map

- `scripts/dbcdata/cli/extractwowdatamaps.go`: Forever DB2 metadata, exact build resolution, native WebP export, deterministic ordering.
- `scripts/dbcdata/cli/extractlegacymaps.go`: MPQ-era DBC/listfile artwork extraction for legacy servers.
- `scripts/dbcdata/cli/renderwowdatamaps.go`: geometry PNGs and sparse rendered manifest; requires the local native manifest and a Rust/Cargo toolchain.
- `scripts/dbcdata/cli/mergewowdatamaps.go`: layer validation and merge; `scripts/dbcdata/main.go` registers commands.
- `frontend/imagecache/upload-maps-r2.sh`: all-server R2 publication and merge order; `frontend/imagecache/tests/upload-maps-r2.test.sh` exercises layer isolation with mock rclone.
- `Makefile`: server dispatch and extract/render/upload targets.
- `frontend/chronicle/src/pages/Technical/mapGallery.ts`: frontend manifest format, URLs, gallery entries; `MapGalleryPage.tsx` consumes them.
- `frontend/chronicle/src/pages/Instance/EventsPanels/Map/MapOverview2D.tsx`: styled/raw/original map choices and route overlay.
- `docs/wow-map-assets.md` and `docs/wow-forever-game-data.md`: operator documentation and rollout guidance.

## Data model

The manifest joins the base UI map art, explored overlays, and available instance floors:

```text
UiMap.ID
  -> UiMapAssignment.UiMapID
  -> UiMapXMapArt.UiMapID
  -> UiMapArt.ID
     -> UiMapArtStyleLayer.UiMapArtStyleID
     -> UiMapArtTile.UiMapArtID + LayerIndex
     -> WorldMapOverlay.UiMapArtID
        -> WorldMapOverlayTile.WorldMapOverlayID

Map.ID + MapName_lang
  -> normalized interface/worldmap/<directory>/ listfile artwork
```

Explored zones are the base `UiMapArtTile` canvas plus every linked `WorldMapOverlayTile`, positioned from the overlay offsets. Instance floors are exported only when the listfile provides all twelve tiles for a 4-by-3 canvas. Keep `UiMapAssignment.Region`, `UiMin`, and `UiMax` in source DB2 order. Do not assign inferred axis names or bake a coordinate transform into extraction until it is verified against known in-game positions.

Keep output deterministic:

- maps sorted by UI map ID;
- assignments sorted by assignment ID;
- art sorted by phase then art ID;
- layers sorted by layer index;
- overlays sorted by overlay ID;
- instances sorted by name then world map ID, with floors sorted numerically;
- tiles sorted by row, column, then FileDataID;
- tile paths based on FileDataID so duplicate textures share one object.

## Build handling

`--build latest` is the default. The extractor must resolve it once with `wowdata casc info`, replace it with the exact `buildName`, and use that exact build for all DB2 and texture requests. The manifest records the exact build, never the literal value `latest`.

An explicit build remains available for reproducing an older export:

```bash
WOWDATA_BUILD=1.60.1.70205 make maps/forever-extract
```

Do not update a hard-coded default when Forever releases a new build; the default is intentionally `latest`.

## Manifest and publishing contract

All new imports use `chronicle-wow-map-art-v2`. Each server has four **root-level** JSON files beneath `<server>/maps/` (the frontend reads only the last one):

```text
manifest.original.json       # authoritative native map, tile, instance and target metadata
manifest.rendered.json       # optional sparse instances: [{mapID, rendered: {...}}]
manifest.styled.json         # optional sparse instances: [{mapID, styled: {...}}]
manifest.json                # merged public manifest; never hand-edit
original/<FileDataID>.webp   # native tiles and floors
render/<mapID>-<build>-<digest>.png # generated geometry
render-styled/<name>.jpeg    # hand-authored art (PNG/WebP also supported)
```

For example, a sparse styled source manifest is shaped like:

```json
{
  "format": "chronicle-wow-map-art-v2",
  "target": { "product": "wow_classic_beta" },
  "instances": [{
    "mapID": 43,
    "styled": {
      "path": "render-styled/43-wailing-caverns-v2.jpeg",
      "width": 1600,
      "height": 1066,
      "source": "hand-styled",
      "bounds": { "minX": -421.6594, "maxX": 220.06552, "minY": -396.9931, "maxY": 565.59424 }
    }
  }]
}
```

The first three JSON files each carry `format`, `target`, and `instances`; the original also carries `maps`. Optional layers attach by instance `mapID` and must not replace original maps or instance metadata. Rendered targets must match the original product, build, region, and locale exactly; styled targets specify the same product only so hand-authored art survives new builds. Each sparse entry has only its matching `rendered` or `styled` field, with an asset `path`, positive `width`/`height`, and any applicable `source` and `bounds` metadata. Styled bounds must be calibrated to the raw projection for route overlays; do not assume that different image dimensions imply different world bounds. The hand-authored Forever Wailing Caverns JPEG and its source JSON live in `frontend/imagecache/styled-maps/forever/` and **are committed**; generated files under `frontend/imagecache/<server>/maps/` are not.

The merger accepts a required v2 `--original`, optional `--render` (filename `manifest.rendered.json`) and `--styled`, and `--out`. Missing optional files are allowed; an existing malformed or incompatible layer is not. It rejects unknown sparse fields, duplicate/unknown IDs, wrong layer fields, incompatible targets, unsafe asset paths, and invalid dimensions. Example for locally present layers:

```bash
go run ./scripts/dbcdata merge-wowdata-maps \
  --original=frontend/imagecache/forever/maps/manifest.original.json \
  --render=frontend/imagecache/forever/maps/manifest.rendered.json \
  --styled=frontend/imagecache/styled-maps/forever/manifest.styled.json \
  --out=/tmp/forever-map-manifest.json
```

`frontend/imagecache/upload-maps-r2.sh` handles `MAPS_UPLOAD_MODE=all|original|rendered|styled` for the selected `MAPS_DIR`, `SERVER`, `R2_REMOTE`, `R2_BUCKET`, and `R2_PATH`. It gathers updated source JSON locally and unchanged source JSON from R2, validates the complete merge **before any remote writes**, uploads only the selected layer's assets and source manifest, and uploads the merged `manifest.json` **last**. A rendered or styled upload needs the native source manifest already on R2 (even if a local copy exists); a native upload supplies it locally. Do not delete old R2 objects as part of normal publication; when moving v1 URLs (`tiles/`, `renders/`) to v2 (`original/`, `render/`), verify the new assets resolve before removing old ones. The frontend accepts published v1 manifests during rollout. An incompatible future format needs a new format version and coordinated consumer update.

JSON manifests have `Content-Type: application/json` and `Cache-Control: public, max-age=3600`; native WebP tiles have `image/webp`, rendered PNGs have `image/png`, and artwork assets are immutable for one year. The uploader accepts styled JPEG, PNG, or WebP files. Preserve paths, content types, and caching unless consumers and rollout are checked.

## Self-check

- Dry-run `SERVER=forever` and at least one legacy `SERVER` Make route; neither command should publish.
- Forever `--build latest` resolves once to an exact build recorded in `manifest.original.json`, never the literal `latest`.
- Metadata extraction includes a map, explored overlay, complete available instance floor, and referenced tiles; a sampled exported tile has RIFF bytes and `WEBP` at offsets 8–11.
- `--reuse-manifest-url` skips locally downloading already-published v2 tile IDs; it does **not** copy them into the output tree. For a fresh export after an R2 purge, run `WOWDATA_MAP_REUSE_MANIFEST= SERVER=forever make maps` to download and upload all tiles.
- A layer-only publication leaves other source layers intact and publishes the merged root manifest last; an invalid source layer must fail before any remote writes.
- No credentials, generated tiles/manifests, or R2 configuration are committed. The hand-authored styled image and its source manifest are the deliberate exception.
