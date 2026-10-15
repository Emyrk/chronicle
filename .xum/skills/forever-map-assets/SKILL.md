---
name: forever-map-assets
description: Extracts, validates, merges, and publishes Chronicle map artwork for Forever and legacy WoW servers. Use when changing native map extraction, renders, meshes, styled layers, source manifests, map Make targets, or per-server icons.chronicleclassic.com assets.
metadata:
  type: workflow
  binding: advisory
---

# Forever map assets

Use the server-aware native extractor and independently published artwork sources. `SERVER=forever make maps` refreshes native art **only**; legacy servers use their own extractors. Plain `make maps` uses the Makefile default `SERVER` (not Forever). Never publish merely to inspect.

## Sources and contracts

The frontend reads `<icon-base>/maps/manifest.json`, merged from root-level `manifest.original.json` (native maps, floors and target), optional `manifest.renders.json` (PNG), `manifest.meshes.json` (placeable GLB) and `manifest.styled.json` (hand-styled image). All use `chronicle-wow-map-art-v2`. Original targets identify product/build/region/locale; independent sources use the same product only. Source layers attach by world `mapID`, never replace native metadata, and must have a `name` to create a floorless instance absent from original.

| Source in Git or generated locally | Entry | Asset path | Use |
| --- | --- | --- | --- |
| `frontend/imagecache/<server>/maps/manifest.original.json` | maps, floors | `original/<FileDataID>.webp` | Extracted native tiles; generated files ignored by Git. |
| `frontend/imagecache/map-layers/<server>/manifest.renders.json` | `renders: {path,width,height,bounds?}` | `renders/*.png` | Hand-uploaded 2D images; bounds are optional until calibrated. |
| `frontend/imagecache/meshes/<server>/manifest.meshes.json` | `mesh: {path,bounds,zMin,zMax,frame,liquid?}` | `3d/*.glb` | Placeable replay model; derive and verify coordinates against actual GLB. |
| `frontend/imagecache/styled-maps/<server>/manifest.styled.json` | `styled: {path,width,height,source,bounds}` | `render-styled/*` | Hand-styled image with calibrated overlay bounds. |

There is **no** public `rendered` or path-only `3d` layer. The standalone `render-wowdata-maps` CLI may generate local `manifest.generated-renders.json` and `renders/` PNGs, but `make maps` does not publish them or replace the tracked manual source. Do not infer 2D PNG bounds from mesh bounds or image dimensions. Uncalibrated images must not place route or player markers. `frame` for meshes is `wow-yup-mirrored-x`; check the renderer's `height.json` and GLB POSITION extents before publishing. See `docs/wow-map-assets.md` for calibration and exporter details.

## Procedure

1. Inspect metadata locally without uploading tiles:
   ```bash
   out="$(mktemp -d)"
   go run ./scripts/dbcdata extract-wowdata-maps --metadata-only --out="$out"
   jq '{target, maps: (.maps|length), instances: (.instances|length)}' "$out/manifest.original.json"
   # Legacy: go run ./scripts/dbcdata extract-legacy-maps --server=turtle --metadata-only --out="$out"
   ```
2. Add manual PNG metadata to `map-layers/<server>/manifest.renders.json` or mesh metadata to `meshes/<server>/manifest.meshes.json`; keep other entries. Verify uploaded asset paths exist before manifest-only publication. Do not commit GLBs or generated tiles.
3. Validate before publishing:
   ```bash
   go test ./scripts/dbcdata/cli ./scripts/dbcdata
   bash -n frontend/imagecache/upload-maps-r2.sh frontend/imagecache/tests/upload-maps-r2.test.sh
   bash frontend/imagecache/tests/upload-maps-r2.test.sh
   make -n SERVER=forever maps
   make -n SERVER=turtle maps
   git diff --check
   ```
4. Publish **only when requested** with the correct `SERVER` and R2 credentials. For native art use `SERVER=forever make maps` or `make maps/turtle` (also `azerothcore`, `tbc`). For independent sources use `SERVER=forever make maps/renders-upload`, `make maps/forever-meshes-upload` (local GLBs), `make maps/forever-meshes-manifest-upload` (GLBs already uploaded), or `make maps/forever-styled-upload`.
5. Verify the merged manifest and referenced objects on R2; the public URL can cache JSON for up to an hour. Only then run `make clean-maps` if desired: it removes **all servers'** generated `frontend/imagecache/<server>/maps/` directories. Never delete assets still referenced by published manifests; a reuse-manifest export does not restore reused tiles locally.

## Publishing invariants

`frontend/imagecache/upload-maps-r2.sh` gathers the changed local source and unchanged sources from R2, validates the **whole** merge before any writes, publishes only the selected layer's files, then publishes the merged `manifest.json` last. A layer-only upload requires `manifest.original.json` already on R2. `renders` and `meshes-manifest` modes upload metadata only. Native tile paths can still reference `tiles/` from earlier published manifests: keep those objects until references are replaced. Exact build resolution (`--build latest`) happens once per extraction and is recorded as a concrete build, never `latest`; `WOWDATA_BUILD` pins an older build.

Relevant code: `scripts/dbcdata/cli/{extractwowdatamaps,mergewowdatamaps}.go`, `frontend/imagecache/upload-maps-r2.sh`, `Makefile`, `frontend/chronicle/src/pages/Technical/mapGallery.ts`, and `frontend/chronicle/src/pages/Instance/EventsPanels/Map/`. For mesh coordinate derivation and CORS, consult `docs/wow-map-assets.md`.
