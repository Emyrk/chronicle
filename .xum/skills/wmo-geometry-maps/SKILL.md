---
name: wmo-geometry-maps
description: Generates coordinate-faithful top-down dungeon maps from WoW WDT and WMO geometry, and compares them with Blizzard artistic floor maps. Use when an instance lacks usable minimap tiles, when validating world-coordinate transforms, or when investigating distorted dungeon artwork such as Wailing Caverns.
compatibility: Requires wowdata, Python 3, Rust/Cargo, and network access to the selected WoW CASC source.
metadata:
  type: workflow
  binding: advisory
---

# WMO geometry maps

Generate an exploratory top-down SVG from a global-WMO dungeon. Keep this pipeline separate from the published Forever map-art pipeline until the generated output, coordinate transform, floor handling, and asset contract have been reviewed.

The bundled tools are:

- `scripts/wmo-file-ids.py`: reads reversed-FourCC chunks, exports full global-WMO placement metadata from a WDT, and extracts group FileDataIDs from a WMO root.
- `scripts/render-wmo-map/`: parses WMO group geometry with `wow-wmo`, projects it top-down, colors triangles by elevation and face orientation, and writes an auto-fitted SVG.

Read `references/wailing-caverns.md` when reproducing the original experiment, checking expected IDs and geometry counts, or reviewing why a generated map cannot use the artistic floor's global transform.

## Contents

- [Workflow](#workflow)
- [Interpreting the result](#interpreting-the-result)
- [Gotchas](#gotchas)
- [Self-check](#self-check)

## Workflow

### 1. Resolve and pin the game build

Use the same target as the dataset under investigation. Resolve `latest` once, then pass the exact build to every later command.

```bash
WOWDATA="${WOWDATA:-$(command -v wowdata)}"
SOURCE="${WOWDATA_SOURCE:-remote}"
REGION="${WOWDATA_REGION:-us}"
PRODUCT="${WOWDATA_PRODUCT:-wow_classic_beta}"
LOCALE="${WOWDATA_LOCALE:-enUS}"
TARGET=(--source "$SOURCE" --region "$REGION" --product "$PRODUCT" --locale "$LOCALE")
json_only() { awk 'found || /^\{/ { found=1; print }'; }

BUILD="$($WOWDATA casc info "${TARGET[@]}" --build latest | json_only | jq -r '.data.buildName')"
TARGET+=(--build "$BUILD")
printf 'Using target %s/%s/%s/%s build=%s\n' "$SOURCE" "$REGION" "$PRODUCT" "$LOCALE" "$BUILD"
```

The defaults are Chronicle's Forever target. Override the four `WOWDATA_*` variables before running the snippet for any other dataset.

Do not mix WDT, root WMO, group WMO, DB2, or artistic-map assets from different builds.

### 2. Find the map WDT

Query the `Map` DB2 row and capture `WdtFileDataID`.

Set `MAP_ID` to the dungeon being investigated. For example, Wailing Caverns is map 43.

```bash
: "${MAP_ID:?set MAP_ID to the dungeon Map.ID}"
OUT="$(mktemp -d)"

$WOWDATA db2 rows Map --id "$MAP_ID" "${TARGET[@]}" \
  | json_only > "$OUT/map.json"
jq -e '.data.rows | length == 1 and .[0].WdtFileDataID != 0' \
  "$OUT/map.json" >/dev/null
WDT_ID="$(jq -r '.data.rows[0].WdtFileDataID' "$OUT/map.json")"
MAP_DIR="$(jq -r '.data.rows[0].Directory' "$OUT/map.json")"
printf 'Map %s directory=%s WDT=%s\n' "$MAP_ID" "$MAP_DIR" "$WDT_ID"
```

A WDT with a `MODF` chunk points to one or more global WMO roots. This workflow does not apply to an ordinary ADT-backed map or a map that already has suitable `world/minimaps/...` tiles.

### 3. Export the WDT and global WMO root

```bash
SKILL=.xum/skills/wmo-geometry-maps

$WOWDATA file export --file-data-id "$WDT_ID" --output "$OUT/map.wdt" "${TARGET[@]}"
python3 "$SKILL/scripts/wmo-file-ids.py" wdt-placements "$OUT/map.wdt" \
  > "$OUT/placements.json"
jq . "$OUT/placements.json"
jq -e 'length == 1' "$OUT/placements.json" >/dev/null
jq -e '.[0].position | all(. == 0)' "$OUT/placements.json" >/dev/null
jq -e '.[0].rotation | all(. == 0)' "$OUT/placements.json" >/dev/null

ROOT_ID="$(jq -r '.[0].fileDataID' "$OUT/placements.json")"
$WOWDATA file lookup --file-data-id "$ROOT_ID" "${TARGET[@]}"
$WOWDATA file export --file-data-id "$ROOT_ID" --output "$OUT/root.wmo" "${TARGET[@]}"
```

The bundled renderer intentionally supports exactly one origin-positioned, unrotated global-WMO placement. Stop on a multi-root, translated, or rotated WDT. WoW placement vectors require coordinate-system handling that this experiment has only verified for the zero placement used by Wailing Caverns. Extend and test placement composition or transforms before using this workflow for another shape.

Use the FileDataID from the WDT. Do not substitute a similarly named legacy WMO from the listfile. A name match can refer to obsolete geometry with unrelated coordinates.

### 4. Export every WMO group

Modern WMO roots carry a `GFID` chunk containing group FileDataIDs.

```bash
python3 "$SKILL/scripts/wmo-file-ids.py" wmo-groups "$OUT/root.wmo" > "$OUT/group-ids.txt"
mkdir -p "$OUT/groups"

index=0
while read -r group_id; do
  printf -v filename 'group_%03d.wmo' "$index"
  $WOWDATA file export --file-data-id "$group_id" \
    --output "$OUT/groups/$filename" "${TARGET[@]}"
  index=$((index + 1))
done < "$OUT/group-ids.txt"

printf 'Exported %s WMO groups\n' "$index"
```

An empty `GFID` result means this root uses a different group-discovery scheme. Stop and inspect the root and listfile rather than guessing sequential filenames.

### 5. Render an auto-fitted top-down map

The default projection maps WoW `-Y` to screen-right and `-X` to screen-down. It preserves one uniform scale across both axes.

```bash
cargo run --release \
  --manifest-path "$SKILL/scripts/render-wmo-map/Cargo.toml" -- \
  "$OUT/groups" "$OUT/placements.json" "$OUT/geometry.svg" 1002 668
```

Open `geometry.svg` in a browser or image viewer. On Linux, `xdg-open "$OUT/geometry.svg"` is convenient.

To make a WebP when the frontend dependencies are installed:

```bash
SVG="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$OUT/geometry.svg")"
WEBP="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$OUT/geometry.webp")"
(
  cd frontend/chronicle
  node -e 'require("sharp")(process.argv[1]).webp({quality:90}).toFile(process.argv[2])' "$SVG" "$WEBP"
)
```

The renderer prints vertex bounds and triangle count to stderr. Save those values with the artifact because they are useful when checking telemetry coordinates.

### 6. Compare against artistic artwork

Compare three views:

1. Blizzard floor art by itself.
2. Generated geometry by itself.
3. A semi-transparent overlay using known world-coordinate anchors.

Use boss positions or other verified telemetry points as anchors. Fit a global affine transform only as a diagnostic. Report residual error for every anchor. Large or region-dependent residuals mean the art is locally distorted and needs local calibration, not a more complicated global fit.

For Wailing Caverns, Chronicle already stores boss pins and local calibration behavior in `frontend/chronicle/src/pages/Instance/EventsPanels/Map/mapModel.ts`. Reuse those anchors when reproducing the comparison.

## Interpreting the result

The raw render includes floors, ceilings, walls, exterior shells, props included in group geometry, and rooms stacked at different elevations. A top-down projection collapses all Z levels. For the supported single, origin-positioned, unrotated placement, it applies the WDT scale before projection. It is not automatically a clean navigation map.

For a production-quality map, add these as explicit, testable stages:

1. Keep upward-facing candidate triangles and reject near-vertical walls.
2. Prefer collision or walkable surfaces when the source exposes them.
3. Split disconnected elevation bands into floors.
4. Preserve world bounds and the exact world-to-pixel transform in metadata.
5. Validate the transform with real unit-position telemetry.
6. Decide how floors and assets fit the shared map manifest before publishing.

Do not silently use an artist-map transform for generated geometry. Geometry and artwork have different coordinate models.

## Gotchas

- WoW chunk tags are stored reversed on disk. `FDOM` is `MODF`; `DIFG` is `GFID`.
- The first uint32 of each 64-byte WDT `MODF` placement is the referenced WMO FileDataID for modern files. The helper also records position, rotation, bounds, and scale so unsupported transforms can fail safely.
- `GFID` is an array of little-endian uint32 group FileDataIDs.
- Root WMO files hold metadata. Group WMO files hold the `MOVT` vertices and `MOVI` triangle indices rendered by this tool.
- Do not connect or aggregate telemetry across different units as one path. Group events by unit GUID first.
- Do not publish generated assets through `make maps` as part of an experiment. Read the `forever-map-assets` skill before changing the production manifest or upload layout.

## Self-check

- The build is exact and shared by every export.
- The WDT contains `MODF`, every selected root came from that chunk, and the placement is within the renderer's supported origin-positioned and unrotated subset.
- Every group came from the root's `GFID` chunk.
- The renderer reports nonzero triangles and finite bounds.
- The output uses uniform scale and records its orientation.
- Sample telemetry points land on plausible geometry.
- Any artist-map overlay reports anchor residuals instead of claiming a globally accurate fit.
- Generated files remain outside the repository unless the user explicitly asks to productize them.
