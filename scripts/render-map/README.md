# render-map

Deterministic top-down **textured** renders of WoW dungeon maps, straight from the Blizzard
CDN (or a 1.12 MPQ client), with no GUI, plus a cutaway 3D model (GLB) and the calibrated 2D
render chronicle's Replay Map shows. One folder per map, one versioned folder per render, and a
manifest in each that says exactly what produced it. The agent skill that drives it is
`.agents/skills/render-map/SKILL.md`; publishing to chronicle goes through the Map Foundry (see the skill).

**Local use only (Blizzard assets).** The code lives here; every fetched file, render, GLB and
manifest lives in the **workdir**, outside this repo (default `~/.cache/chronicle-render-map/`).
The tools refuse a workdir inside any git repository that has a remote, and
`scripts/render-map/.gitignore` drops images/GLBs/BLPs as a second line of defence. Nothing here
is wired into the Makefile, CI or any package manifest.

## Quick start (nothing → a rendered `v000`)

Needs: macOS or Linux, Python 3.11+ (validated on 3.12; use `python3.12 -m venv` if your `python3`'s venv/ensurepip is broken), `git`, `cmake`, `clang++` (CascLib build), Blender **4.3**
(default path `/Applications/Blender.app/Contents/MacOS/Blender`; elsewhere → `blender:` in local.yaml).

```bash
cd scripts/render-map
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # numpy, Pillow, PyYAML
.venv/bin/python -I tools/rmconfig.py        # prints the settings in use + the workdir (optional: local.yaml)
W=~/.cache/chronicle-render-map              # the default workdir
mkdir -p $W/maps/ragefire-chasm && cat > $W/maps/ragefire-chasm/map.yaml <<'YAML'
name: Ragefire Chasm
map_id: 389
directory: OrgrimmarInstance     # world/maps/<directory>/<directory>.wdt, via data/wdt-index.csv
product: wow_classic_beta        # Blizzard CDN product (Forever = Classic beta line)
region: us
rot: -90                         # north up, east right
water_tint: 0.7                  # MLIQ liquid here is lava
water_color: "214,96,32"
YAML
.venv/bin/python -I tools/fetch_map.py ragefire-chasm     # builds CascLib (~1 min), wdt-index.csv, prints the build
# pin it: add `build: <printed build>` to map.yaml, so later fetches refuse drift
.venv/bin/python -I tools/render_set.py ragefire-chasm first --note "first render"
# -> $W/maps/ragefire-chasm/renders/v000-first/  (textured.png, preview-*.webp, manifest.json, ...)
```

The first `fetch_map.py` builds CascLib + `cache/casc/cascget` and, when `data/wdt-index.csv` is
missing, downloads the community listfile to build it (`--refresh-wdt-index` rebuilds it).

## Local settings: `local.yaml` and `LOCAL.md`

Both are gitignored and looked up in `scripts/render-map/` first, then
`~/.config/chronicle-render-map/` (survives worktrees and fresh checkouts); the first one found
is used whole.

- **`local.yaml`** (template `local.example.yaml`) — machine settings the tools read: `workdir`,
  `blender`, `python` (interpreter for render_set's sub-steps), `mpq_clients` (name → 1.12 client
  dir, read-only), `foundry` (`host`, `namespace`), `log_hosts` (`check_log_positions.py --host`
  default). Every key is optional; the defaults are in `tools/rmconfig.py`.
- **`LOCAL.md`** (template `LOCAL.example.md`) — the operator's rules: approval gates, reference
  sets, private-server rules, downstream consumers, naming. The skill reads it first; it wins
  where it disagrees with the skill.

## The process (same for every map)

```
   <workdir>/maps/<slug>/map.yaml (directory / product / build / rot / reference)
                     │
 1. fetch_map.py ────┤  data/wdt-index.csv → WDT fid → MODF → root WMO fid → GFID → groups
                     │  + textures (CascLib, CDN)         → raw/fetch.json (build, fids, sha256)
                     │  wmo2obj.py: WMO → OBJ/MTL + BLP→PNG, water (MLIQ) as liquid_* objects
                     ▼
 2. render_set.py ───┤  self-check: two 600 px renders must be byte-identical
                     │  blender_topdown.py (Cycles, CPU): dry / water-mask / shaded passes
                     │  composite_water.py: dry + depth-tested water → textured.png
                     │  align_to_real.py (optional): register onto a reference frame
                     ▼
  <workdir>/maps/<slug>/renders/vNNN[-floor-N]-<label>/{dry,water,shaded,textured,shaded-water}.png
                                                + *-aligned.png, preview-*.webp (<= 1 MB each),
                                                  align.json, previews.json, log.txt, manifest.json
                     │
 4. --glb: export_glb.py ┤  same OBJ -> <slug>-open-top.glb (support cull, WebP textures, Y-up,
                     │   centred), height.png (16-bit elevation, same frame), perspective-*.png
                     ▼   proofs from the re-imported GLB; height.json; all in the same vNNN folder
```

```bash
# once
.venv/bin/python -I tools/fetch_map.py wailing-caverns            # ~1 min, ~35 MB
# every render (nothing is ever overwritten; NNN increments)
.venv/bin/python -I tools/render_set.py wailing-caverns my-label --note "why this run"
.venv/bin/python -I tools/render_set.py wailing-caverns 4x --width 9600
.venv/bin/python -I tools/render_set.py wailing-caverns glb --glb      # + cutaway 3D model
```

Always `.venv/bin/python -I` (numpy, Pillow, PyYAML), or local.yaml `python:`. Blender 4.3
(local.yaml `blender:`). Run the tools from `scripts/render-map/`; slugs resolve under the workdir.
First `fetch_map.py` builds CascLib + `cache/casc/cascget` (needs `cmake`, `clang++`; ~1 min).

## Map Foundry bundles (preferred for multi-floor maps)

After every floor has a calibrated render and mesh, collect their local paths and metadata in one
staging JSON, then build a deterministic import bundle:

```bash
.venv/bin/python -I tools/foundry_bundle.py \
  ~/.cache/chronicle-render-map/maps/naxxramas/naxxramas-foundry-stage.json
# validate only, without writing a ZIP
.venv/bin/python -I tools/foundry_bundle.py --check <staging.json>
# optional explicit destination
.venv/bin/python -I tools/foundry_bundle.py <staging.json> <bundle.zip>
```

The current single-map staging shape is:

```json
{
  "namespace": "azerothcore",
  "mapID": 533,
  "name": "Naxxramas",
  "floors": [
    {
      "floor": 1,
      "name": "The Arachnid Quarter",
      "preferred2D": "renders",
      "render": {
        "path": "/absolute/local/render.png",
        "width": 2400,
        "height": 1638,
        "bounds": {"minX": 2925.3887, "maxX": 3564.1309, "minY": -3811.5806, "maxY": -2875.6465},
        "bytes": 4079884,
        "sha256": "..."
      },
      "mesh": {
        "path": "/absolute/local/mesh.glb",
        "bounds": {"minX": 2925.3887, "maxX": 3564.1309, "minY": -3811.5806, "maxY": -2875.6465},
        "zMin": 245.5746,
        "zMax": 436.5089,
        "frame": "wow-yup-mirrored-x",
        "bytes": 17733256,
        "sha256": "..."
      }
    }
  ]
}
```

`preferred2D` is optional in staging and defaults to `renders` in `foundry.json`. Use `renders` for
the calibrated render, or `art` to request native floor art where usable. The tool also accepts a
shared `namespace` plus a `maps` array, rejects duplicate map or floor IDs, verifies every local
file's exact byte count and SHA-256, requires identical render and mesh bounds, validates complete
render and mesh calibration, and enforces the Foundry's 100 MB per-asset limit.

The output is a `ZIP_STORED` archive with `foundry.json` at its root and canonical entries such as
`maps/533/floor-1/render.png` and `maps/533/floor-1/mesh.glb`. ZIP timestamps, permissions, JSON,
entry names, and entry order are normalized, so identical staging metadata and asset bytes produce
an identical bundle. Absolute local paths never enter `foundry.json`.

Import the ZIP through the Map Foundry UI. The browser extracts it locally, validates
`chronicle-map-foundry-bundle-v1`, rejects archives over 512 MB, archives with more than 512 entries,
and unreferenced entries, uploads the contained files individually, and saves one draft.
The draft update is one conditional write, but asset storage is not transactional. A failed import can
leave unreferenced content-addressed objects. Importing never publishes; inspect the draft and preview,
then wait for the operator's explicit publish approval.

## Two kinds of map

| kind | detected by | what you get |
|---|---|---|
| **wmo** (caves, buildings: Wailing Caverns) | WDT `MODF` = one global WMO | Cycles passes: dry / water-mask / shaded / textured / shaded-water, any resolution |
| **terrain** (outdoor-style: Excavation Site: Wetlands) | WDT `MAIN` tiles, no `MODF` | the same Cycles passes from the ADT geometry: heightmap mesh + ground textures baked from the splat layers + water (MH2O) + placed WMOs, **no M2 doodads** (trees, rocks, crates, scaffolds); plus `minimap.png`, Blizzard's own 512 px/tile top-down of the same tiles, which is the alignment reference |

Terrain, in detail (`tools/adt2obj.py`, run by `fetch_map.py`):

- **Crop.** `map.yaml crop: {x: [min, max], y: [min, max]}` in world yards limits which CDN split
  ADTs are fetched, which chunks are meshed and which placements are kept. The MPQ path stores every
  active monolithic ADT for stable named provenance, then applies the crop while meshing.
  Without a crop the whole map is fetched and rendered (Excavation Site = 39 tiles, 2.8M tris,
  217 MB OBJ, five Blender imports of ~2 min each). Find the region of interest on the
  minimap stitch and convert pixels to yards with the manifest's `world_transform`.
- **Layouts.** CDN terrain keeps root, texture, and object data in split ADTs. A 1.12 MPQ terrain
  uses one monolithic `XX_YY.adt`; `adt2obj.py` selects the layout from `fetch.json` and normalizes it
  in memory, without synthesizing split files, so the existing atlas, OBJ, and GLB stages stay shared.
- **Heightmap.** `MCNK.position` is `(world x, world y, z)` of the chunk's +x/+y corner;
  `IndexX` runs along −y, `IndexY` along −x; 145 heights per chunk (9×9 outer + 8×8 inner),
  holes from the high-res 64-bit mask when flag 0x10000 is set, else the 4×4 low-res mask.
- **Ground textures.** `MDID` (tex0) lists texture file ids; BLP2 raw BGRA (encoding 3) is decoded directly when Pillow cannot read it. Per chunk `MCLY` layers (texture,
  flags, alpha offset) and `MCAL` alpha maps: 8-bit when MPHD has 0x4 or 0x80 (big alpha /
  height texturing), RLE when the layer flag 0x200 is set, else 4-bit with the last row and
  column duplicated. Textures repeat 8× per chunk. One atlas per tile, `atlas_chunk_px` per
  chunk (default 128 → 2048 px per tile ≈ 3.8 px/yard; 512 for a 4x render). Each texture is
  box-filtered down to `atlas_chunk_px / 8` px per repeat before sampling (bake version 2;
  v1 took 1 source texel in 32 unfiltered, which turned 1024 px grass into speckle — the
  reason the first terrain renders looked worse than the WMO ones). Atlases are cached in
  `raw/obj/textures/atlas_<tile>_<px>px_b<bake>.png`, so a bake change never reuses a stale one.
- **Water.** `MH2O`: per chunk a header (instances offset, layer count), per instance type,
  vertex format, min/max height, sub-rectangle, exists bitmap and vertex data. Heights are
  read only when they lie within [min, max] (the vertex-format field is a LiquidObject id in
  modern files, so the layout is not knowable from it); otherwise the layer is flat.
- **Placed WMOs.** obj0 `MODF`: file id (flag 0x8), position in the file frame
  (`world x = 17066.67 − pos.z`, `world y = 17066.67 − pos.x`, `world z = pos.y`), rotation
  in degrees, scale/1024. Rotation convention, found by exhaustive search against the
  stored extents (0.00 yd error on 7 placements incl. pitch/roll):
  `v' = Ry(ry + 180°) · Rx(−rx) · Rz(−rz)` applied to the WMO-local point mapped into the
  file frame as `(−y, z, −x)`. Every placement is re-verified against its `MODF` extents
  (header bounding box transformed); > 1 yd aborts.
- **Verification.** `render_set.py` stitches Blizzard's minimap of the same tiles into the
  version folder and registers `textured.png` onto it (`align.json` IoU). The IoU is a
  silhouette fit (crop rectangle vs tile block), so it catches scale/translation, not a
  180° roll (0.80 vs 0.96 on Excavation Site — it dropped, but not to zero). Compare rivers and
  buildings with `minimap.png` by eye for orientation; `rot` is a config value, change it
  and render a new version.
- **Water colour.** `map.yaml water_tint` (0..1) and `water_color` ("r,g,b") override the
  cave defaults (0.42 / 78,150,196); the marsh needed 0.6 / 64,138,196 to read at all.

## Adding a map

1. `mkdir <workdir>/maps/<slug>` and write `map.yaml` (the quick start's, or the annotated one below):
   `directory` = the `world/maps/<dir>/` name (grep `data/wdt-index.csv`), `product`,
   `region`, `build` (pin it: run fetch once with no `build:` to learn the live one, then
   write it in), `rot` (90 keeps the WoW -Y→right, -X→down convention), optional `reference`.
   **New Forever maps have numeric directories and are not in any listfile.** Find them in
   the live Map table instead and pin `wdt_fid` directly:
   `curl -sL 'https://wago.tools/db2/Map/csv?build=<build>' | grep -i '<name>'` → column
   `WdtFileDataID` (that is how Excavation Site: Wetlands was found: ID 2998, fid 7252920).

```yaml
# One map = one folder. Everything the tools need to fetch + render it deterministically.
name: Wailing Caverns
map_id: 43                      # Map.db2 ID (informational; chronicle_render names its output with it)
directory: WailingCaverns       # world/maps/<directory>/<directory>.wdt -> data/wdt-index.csv
wdt_fid: 791429                 # pinned FileDataID of the WDT (resolved from the index if absent)
product: wow_classic_beta       # Blizzard CDN product (Forever = Classic beta line)
region: us
build: 70374                    # pinned CDN build; fetch refuses a different one unless --allow-build-drift
rot: 90                         # camera roll: 90 = WoW -Y -> screen right, -X -> screen down; -90 = north up
reference: ../some-frame.png    # optional, relative to the map folder: register renders onto this frame
reference_bg: 12,17,20          # that image's flat background colour
# terrain only: crop: {x: [min, max], y: [min, max]}  (world yards)   atlas_chunk_px: 512   (4x sets)
# frame_include_all: true  # include placed WMOs outside the cropped terrain in the camera/GLB frame
# frame_include_prefix: wmo_248358  # select what sets bounds; object_exclude_prefix: terrain_ drops blank terrain entirely
# minimap: false  # only when this CDN product omits MAID textures; disables reference alignment / IoU
# water_tint: 0.7  water_color: "214,96,32"          (lava; defaults 0.42 / 78,150,196)
# source: mpq  client: <mpq_clients name>             (1.12 client, see below)  placed_wmo: <fid or name>
# allow_stale_placement_bounds: true  # placed WMO only: explicit exception for a known-stale MODF bbox
```
2. `tools/fetch_map.py <slug>`. It detects the kind. It aborts, on purpose, on multi-WMO
   or rotated/translated placements, and on terrain tiles without minimap ids — extend
   deliberately.
3. `tools/render_set.py <slug> first`. Open `textured.png`; if the map is rotated against
   what you want, change `rot` and render again (new version).

## Rendering one floor at a time

Leave `floor` out for the legacy single-floor workflow. Its version folders and GLBs keep their old
names. For an instance floor, set a non-negative integer ID in `map.yaml` or pass `--floor N`.
A configured floor produces `vNNN-floor-N-<label>`, `<slug>-floor-N-open-top.glb`, floor metadata in
`manifest.json` and `height.json`, and a floor-qualified `chronicle_render.py` PNG name. `--floor`
overrides only the identifier; geometry selectors still come from `map.yaml`.

The renderer cannot infer which geometry belongs to a floor. If the fetched OBJ contains several
floors, describe membership explicitly. Prefixes match Blender object names before framing and
before the top-down and GLB culls. Z limits bisect geometry at world-Z planes. Include prefixes are
an allowlist, exclude prefixes apply after it, and both may be combined with either or both Z limits:

```yaml
floor:
  id: 2
  object_include_prefixes: [group_20, liquid_]  # include liquid_ explicitly when this floor needs water
  object_exclude_prefixes: [group_20_ceiling]
  z_min: -30
  z_max: 15.5
```

A scalar is valid when the OBJ already contains only that floor:

```yaml
floor: 2
```

Invalid IDs, empty prefix lists, unknown floor keys, `z_min >= z_max`, selectors that remove every
object, and frame selectors that no longer match selected geometry abort the run. A minimap-only
terrain fetch can carry floor metadata only when its source image is already floor-specific; it
rejects geometry selectors because there is no OBJ to select. Inspect object names in the OBJ or
Blender import log and choose selectors from evidence. Do not use Z alone where ramps, stairs, or
rooms from adjacent floors overlap that range.

Render and calibrate each floor in its own run:

```bash
.venv/bin/python -I tools/render_set.py shadow-labyrinth glb --floor 1 --glb --note "floor 1 only"
.venv/bin/python -I tools/chronicle_render.py "$W/maps/shadow-labyrinth/renders/v012-floor-1-glb"
```

`chronicle_render.py` prints a complete layer instance entry. Without a floor it retains the legacy
`{"mapID": N, "renders": {...}}` shape. With a floor it prints
`{"mapID": N, "floors": [{"floor": F, "renders": {...}}]}`. A `--source` pass must record the same
floor as the GLB version, in addition to having the same camera frame.

## 1.12 clients (`source: mpq`) — private-server forks (OctoWoW, Cappy)

Which source a fork's raid renders from is the operator's rule (see LOCAL.md); the usual one: a raid
identical on the server's client renders from the CDN (1.60 models), one the fork changed renders from
the fork's own 1.12 files. `tools/mpq_chain.py` reads a
client's `Data/` read-only through StormLib (built into `cache/mpq/`, pinned by
`tools/mpq/STORMLIB_COMMIT`) in WoW.exe's load order: base archives, then `patch.MPQ`, then
`patch-?.MPQ` by name (later wins).

```bash
# --client = a key of local.yaml mpq_clients (or a path to the client dir holding Data/)
.venv/bin/python -I tools/mpq_chain.py --client <name> archives           # load order
.venv/bin/python -I tools/mpq_chain.py --client <name> list 'world\wmo\dungeon\kl_onyxiaslair\*'
.venv/bin/python -I tools/mpq_wmo_diff.py <cdn-slug> --client <name> --json …  # CDN vs stock vs fork
.venv/bin/python -I tools/mpq_inventory.py --client <name> --md <workdir>/data/<name>/inventory.md
```

- **Diff first.** `mpq_wmo_diff.py` compares DECODED geometry. CDN Classic WMOs are the stock 1.12
  ones retriangulated (Onyxia: −32 % triangles, 97.6 % of vertices shared, area within 0.02 %), so
  compare vertex sets and area. Triangle-for-triangle matching says "different" when the content is
  the same (70 %).
- **Render a fork's WMO map**: `map.yaml` with `source: mpq`, `client: <mpq_clients name>` (a path
  also works), `directory:` (no product/build/wdt_fid; e.g. `name`, `map_id: 249`,
  `directory: OnyxiaLairInstance`, `rot: -90`, lava `water_tint`/`water_color`), then
  `fetch_map.py` and `render_set.py` as usual. `fetch.json` records the archive chain (name, bytes,
  sha256), the winning archive per file and every fetched-file sha256. The client can change under you
  (a launcher update); compare `fetch.json → archives` before trusting an old raw/.
- **A terrain WDT whose raid is one placed WMO** (Blackwing Lair: 16 tiles of outdoor dressing, the
  raid is `blackrock_upper_guild.wmo` in ADT 33_45 at yaw 35°): `placed_wmo:` in map.yaml (CDN: the
  root FileDataID; MPQ: the file name). fetch_map reads the ADTs for that WMO's MODF (one uniqueID),
  checks the placement against the MODF extents (adt2obj convention, < 1 yd) and writes the OBJ in a
  global WMO's frame, so the rest of the WMO pipeline and chronicle_render work unchanged. A custom
  client can replace the WMO without refreshing the WDT's cached MODF bounds; only for that evidenced
  case, set `allow_stale_placement_bounds: true`. Position and rotation still come from the MODF, while
  `fetch.json` records the extent error, `bounds_verified: false`, and `stale_bounds_allowed: true`.
- **Render a fork's 1.12 terrain map** with the same `source: mpq`, `client`, and `directory` fields.
  Active `MAIN` tiles are fetched by name as `raw/adt/XX_YY.adt`; named minimap and `MTEX` BLPs are
  resolved through the same archive chain. `fetch.json` records `layout: monolithic-1.12`, tile range,
  MPHD flags, texture names and archive winners, archive/file hashes, and omitted M2 counts. The reader
  supports legacy monolithic `MCNK` heights and holes, `MCLY`, 2048-byte 4-bit `MCAL`, and optional
  `MH2O`. M2 doodads are counted but not meshed. Any ADT `MODF` placement aborts rather than silently
  dropping WMO geometry; add explicit legacy MODF support before rendering such a terrain map.
- Inventory of what a fork's custom patches touch: `mpq_inventory.py --custom-from <first custom
  archive>` (OctoWoW: patch-3..A) writes it as Markdown.

## Determinism, by construction

- **Pinned build.** `map.yaml build:` must equal the live CDN build or fetch aborts
  (`--allow-build-drift` to override). `maps/<slug>/fetch.json` (keep it) records build,
  every FileDataID and the sha256 of every raw file; the manifest copies the key fields.
  The CDN only serves the *current* build, so the pin refuses drift rather than time-
  travelling: **`raw/` is the reproducibility anchor** — keep it (~35 MB per map),
  and verify a re-fetch against `fetch.json`.
- **Pinned tooling.** CascLib at `tools/casc/CASCLIB_COMMIT`; every tool script's sha256 is
  in the manifest; `render_set.py` refuses a Blender other than 4.3 (`--allow-blender-drift`).
- **Deterministic renderer.** Cycles on CPU, fixed seed, fixed sample counts (4 albedo /
  32 shaded), no denoiser, no adaptive sampling. **Workbench is not used**: on macOS/Metal it
  dropped random geometry between identical runs (37–40 % alpha coverage).
- **Self-check every run.** `render_set.py` renders the dry pass twice at 600 px and
  refuses to continue unless the two renders are pixel-identical (file bytes differ: Blender
  stamps PNG metadata, so compare `sha256_pixels`, not `sha256_file`).
- **Versioned outputs.** `renders/vNNN-<label>/` is append-only. Re-rendering with the same
  settings gives the same `sha256_pixels` (compare `manifest.json → outputs`).
- **No eyeballing of geometry.** Orientation is a config value; registration onto a
  reference is a numeric fit (scale + translation, IoU reported in `align.json`).

## What each pass is

| file | what | how |
|---|---|---|
| `dry.png` | albedo, no water, ceilings removed | emission shader per texture → the pixel is the texel |
| `water.png` | floors white / water blue, depth-tested | a bridge above the water hides it |
| `shaded.png` | diffuse + sun + grey sky | depth cues for ledges, stairs |
| `textured.png` | dry + smoothed water tint + shoreline | `composite_water.py` |
| `shaded-water.png` | shaded + the same water | |
| `*-aligned.png` | in the reference image's pixel frame | `align.json` has the matrix |
| `preview-*.webp` | 1600 px, each ≤ 1 MB, for sharing/chat | `preview.py`; `previews.json` has sizes + source pixel hash |
| `<slug>-open-top.glb` | cutaway 3D model, textures embedded, glTF Y-up, centred | `export_glb.py` (`--glb`); see "3D export" |
| `<slug>-full.glb` | every face, ceilings included (`--glb-full`) | |
| `height.png` | 16-bit elevation of the open-top mesh, same frame as the passes | grey = (z − z_min)/(z_max − z_min), linear (Raw view transform) since 2026-10-18; older versions are sRGB-encoded (their `height.json` `encoding` has no "linear" prefix), linearise them; Pillow keeps only 8 of the 16 bits — `tools/check_log_positions.py` reads both correctly |
| `perspective-*.png` | 3/4 proof renders from the re-imported GLB | back faces transparent = what a culling viewer shows |

## 3D export (`--glb`)

The OBJ already is the full WMO mesh with elevations; `export_glb.py` turns it into a GLB a
viewer can load and cuts it open so you can look down into it. The cut is the **support cull**,
every step numeric (seven Wailing Caverns iterations got there; each hypothesis that failed is a
LEARNINGS line):

1. weld coincident vertices and join all WMO groups into one mesh, so walls share edges with
   floors across group seams;
2. FLOOR = upward faces (normal z > 0.5) in edge-connected patches ≥ 10 sq yd (one patch holds
   87 % of Wailing Caverns' walkable area);
3. islands: with a FLOOR face = cave body; without, resting on floor (lowest vertex ≤ 1 yd above
   it) and ≤ 12 yd tall = prop, kept whole (stalagmites, rocks); otherwise judged per face;
4. per face: downward faces keep iff FLOOR surface within 3 yd of the centroid (a lip, not a
   ceiling); other non-FLOOR faces keep iff FLOOR surface within 8 yd of the centroid, by BVH
   nearest point; a small upward patch with no floor within 40 yd below is a floor island, kept;
5. water tiles keep iff floor within 40 yd below (trims the pool plane hanging outside a room).

Knobs: `--wall-cap`, `--undercut-cap`, `--seed-min-area`, `--rest-tol`, `--prop-max-height`,
`--island-depth`, `--water-support`, `--seed-exclude <texture substrings>` (those faces are never FLOOR,
judged as walls; Molten Core needs `lavafloortrans` for the lava streams down Ragnaros' walls), via
`render_set.py --glb-args "..."`. Known remainder: a
rim band whose top surface is a 200–400 sq yd patch stacked over a pool floor passes as FLOOR
(same local shape as a real bridge), and so do decals hanging from it. The next deterministic
knob, not built: drop seed patches < ~500 sq yd whose faces mostly have other floor beneath.

GLB conventions: centred (bbox XY centre → 0, z_min → 0; offset in `height.json`, so the GLB
does **not** share the raw WoW frame of the PNG passes), Principled materials (texture, rough 1,
no specular), alpha-keyed WMO materials → `alphaMode MASK`, back-face culling on, water =
translucent blue double-sided, WebP textures (`EXT_texture_webp`; `--glb-format AUTO` for PNG,
~4× bigger). Wailing Caverns: 12 MB WebP / 39 MB PNG open-top.

**The contract both kinds share** (chronicle's Replay Map reads it; `docs/wow-map-assets.md`
"Dungeon meshes" in the chronicle repo): `<slug>-open-top.glb` + `height.png` (16-bit) +
`height.json` (`bounds_wow {min,max}`, `offset_applied`, `height {z_min, z_max, rot, width, ...}`,
`support_cull`, `support_cull_args`, `reimport`) + `perspective-*.png`. Vertices are in the
**pipeline frame**, which negates both horizontal WoW axes, so glTF `(x, y, z) = (-wow_x, wow_z,
wow_y)` (chronicle: frame `wow-yup-mirrored-x`); the centring offset lives ONLY on the top-level
node translations (no rotation/scale on any node), so zeroing them restores the raw frame and the
POSITION extent equals `bounds_wow`. Water = separate `liquid_*` meshes (chronicle tints them per
map). Chronicle's manifest `bounds` = `bounds_wow` with both horizontal axes negated.

### Terrain maps — the recipe that produced the Ruins of Lordaeron terrain GLB

The reference terrain GLB (Ruins of Lordaeron). Reproduce it, or do the same for another terrain map, like this:

1. **Crop first** (`map.yaml crop:`), as for the 4x passes. Lordaeron: inside the city walls,
   `x [1345, 1895], y [-10, 490]`; `atlas_chunk_px: 512`; `rot: -90`. The crop IS the GLB's extent.
2. **Rebuild the OBJ**: `.venv/bin/python -I tools/fetch_map.py <slug>` (minutes; downloads are
   cached). It must postdate adt2obj's uid dedupe (2026-10-14): check `fetch.json adt_stats` has
   `wmo_duplicate_uids`. Lordaeron: 1 duplicate (city WMO 114612), 588,778 triangles, OBJ sha
   `adc89254…`.
3. **Run**: `.venv/bin/python -I tools/render_set.py <slug> glb --glb --note "..."` (default
   `--width 2400`). No `--glb-args`; every knob below at its default. render_set adds for a terrain
   fetch: `--kind terrain --smooth-prefix terrain_ --frame-include-prefix terrain_` (the last only
   with a crop; the passes get the same flags) and `--height-width <width> --rot <map.yaml rot>
   --image-format WEBP --skip-full`.
4. **Verify** (what the Lordaeron GLB passed): POSITION min/max of the GLB with node translations zeroed,
   mapped to the pipeline frame `(x, -z, y)`, equals `height.json bounds_wow` (Lordaeron: 0.0
   deviation); `height.png` has `dry.png`'s size and alpha (Lordaeron: 2400x2259, IoU 0.998, the rest =
   WMO beyond the crop in the camera margin); `view_glb.py --focus all` and
   `preview-perspective-open-top.webp`: no slabs/sheets under the cut edges, no floating pieces,
   pools have floors.

What the export does (`export_glb.py --kind terrain`; same files, same `height.json` keys plus
`kind`, `faces_open_top`, `terrain_atlases`, `frame_world`; same frame, centring, `liquid_*`):

| step | rule | knob = Lordaeron value |
|---|---|---|
| frame | x/y of the `terrain_` objects (crop snapped to 33.3-yd chunks), z from everything; WMOs/water bisected at the 4 planes, so `bounds_wow` IS the crop | `--frame-include-prefix terrain_`, `--frame-exclude-prefix` (m2_ with --m2) |
| no support cull | open sky: nothing to take off the top | — |
| buried cull | a non-terrain face goes iff every vertex is buried: terrain more than `bury-depth` above it; under a terrain HOLE (a WMO that replaces the ground), more than `hole-depth` below the ground filled across the hole AND covered by solid geometry above (a pool floor under water is not covered) | `--bury-depth 0.5`, `--hole-depth 3`, `--keep-buried` off |
| straddle | a face whose centroid is more than `straddle-depth` below ground also goes (one tall face from the Undercity up past the surface) | `--straddle-depth 10` |
| probes | clamped 1 cm inside the frame (a ray from a vertex ON the edge grazes the border and misses) | — |
| roofs | placed WMOs kept WHOLE | `--roof-cull` OFF (`--roof-min-drop 2`, `--roof-max-drop 25`) |
| terrain | welded + smooth-shaded, as in the passes | `--smooth-prefix terrain_` |
| atlases | 8192 px/tile bake downscaled, cropped to the UVs in use | `--terrain-px-per-yard 6` |
| frame turn | adt2obj writes TRUE world coords, wmo2obj the pipeline frame (both horizontals negated): the terrain model is turned 180 deg about z before export; `height.png` is rendered unturned with the passes' camera | — |

`--roof-cull` (opt-in): buildings with MOGP-interior (`0x2000`) groups only — on Lordaeron that is
the city WMO 114612 alone (197 interior groups after the buried cull: throne room, gatehouses,
towers; the seven small ruins and three 3937974 props are single exterior groups). FLOOR = upward
faces of interior groups; a face of ANY group of that placement with |nz| > 0.25 over a FLOOR
2..25 yd below goes. At 25 yd: tower/gatehouse ceilings (7.7k faces), not the dome (~100 yd over
the throne room); `--roof-max-drop 150` opens the dome raggedly. Chronicle (since #1167) stands a
unit on the first surface below its LOGGED z; only a log without z falls back to the HIGHEST hit,
and then, with roofs kept, a unit inside the throne room stands on the dome.

Lordaeron GLB result: 582,860 faces in; clip −29,925; buried −376,560 (the Undercity, 80 of them straddling); 176,375 faces = 178,234 triangles out; open-top GLB 15.6 MB, of which images 3.97 MB. Dead ends on the way: `LEARNINGS.md` 2026-10-14.

Ceiling removal: faces whose geometric normal points down (`nz < -0.15`) are deleted; back
faces render transparent. `--floors-only` additionally drops walls. The camera frame is
computed on the full model before any pass drops objects, so all passes share one frame.
Alpha = not-geometry everywhere, so a pass doubles as a floor mask.

## Known limits

- Doodads (M2 props: mushrooms, roots, bones, braziers) are not exported; the small white
  holes in Wailing Caverns' overgrown chamber are mesh holes those props plug.
- On the CDN path, textures referenced by name (`MOTX`) instead of FileDataID abort fetch;
  every Forever-build WMO seen so far uses FileDataIDs. The `source: mpq` path (below) is name-based.
- Stacked floors collapse into one view; the pass with the higher floor wins.

## Gotchas already paid for (do not rediscover)

- MLIQ vertex heights are **absolute**; adding the base z sinks the water to twice its depth.
- Modern groups use `MPY2` (u16 flags, u16 material, `0xFFFF` = none), not `MOPY`.
- CascLib opens a product's "latest" build; pinning is by refusing drift, not by build key.
- CascLib without a listfile cannot open `world/maps/x/x.wdt` by name → `data/wdt-index.csv`,
  and new maps with numeric directories are in no listfile at all → wago.tools Map CSV.
- A terrain tile's look is largely M2 doodads (812 on one Excavation Site tile); the
  geometry render has none of them. The minimap stitch (`minimap.png` in every terrain
  version) shows what they add; M2 support is the next piece if that matters.
- MODF rotation is not noggit's convention for this data; do not guess rotations, verify
  against the `MODF` extents (adt2obj does, every placement).
- `MH2O` liquid vertex format cannot be trusted in modern files (LiquidObject ids); read
  heights only if they fit the instance's [min, max].
- Scripts that `main()` at import time cannot be reused; `wmo2obj.py` is importable now.
- Camera roll: `rot: 90` is NOT north-up. Blender's camera right vector at roll θ is
  (cos θ, sin θ): θ = 90 → right = +Y (west), up = −X (south). Wailing Caverns keeps 90
  because its stylize reference is in that frame; terrain maps use `rot: -90` (north up,
  east right, same as Blizzard's minimap). An Excavation Site render with `rot: 90` was the 180° mistake.
- Water sheets must read from above whatever their winding: the liquid shader is
  double-sided (no back-face transparency) and MH2O quads are wound counter-clockwise.
  One Excavation Site render had the water invisible, and the compositor then tinted the
  WHOLE map because it fell back to "alpha = water" — it now only falls back when the water
  pass has no white floors at all (a `--liquid-only` pass).
- A terrain crop crosses tile borders; 850 yd became 9 tiles (3×3). Expect that.
- Blender 4.2+: `Material.blend_method` is read-only; alpha behaviour is set in the node tree.
- bmesh face normals can be stale after `from_mesh`; compute the triangle normal yourself.
- The OBJ importer sets every material to HASHED and wires image alpha → Principled Alpha;
  WoW stores non-opacity data in some textures' alpha, so rebuild the node tree.
- WoW UV `v` is top-down; OBJ wants `1 - v`.
- Liquid vertices have no UVs: keep separate `v` and `vt` index bases in the OBJ writer.
- Pixel-radius parameters (water smoothing) scale with `width / 2400`.
- Cycles ignores `use_backface_culling`; a proof render of a GLB must inject a Backfacing →
  Transparent mix or it shows the far walls' back faces as "floating" geometry.
- Blender 4.2+ glTF exporter: `blend_method` cannot be set; `alphaMode MASK` comes from a
  Math > Greater Than node between texture alpha and Principled Alpha.
- Do not export vertex colours (`export_vertex_color="NONE"`): three.js multiplies `COLOR_0`
  into the texture automatically and WoW's baked light makes everything dark.
- Ray casts for "is there floor under this face" have a blind spot: a face on a mound's side,
  pushed sideways, still sits over the mound and misses the floor. BVH nearest-point does not.
- A WMO (or doodad) spanning tiles is listed in EVERY overlapping tile's obj0 with the same
  uniqueId; place each uid once. Lordaeron's city WMO was meshed twice (510k coincident
  triangles, invisible in every pass, doubled the GLB).
- A WMO that replaces the ground sits in a terrain HOLE: "is there terrain above this?" says
  no for everything beneath it. Fill the heightfield across holes before asking "how deep".
- A terrain block has no side walls: anything left under the ground (even one tall face that
  pokes above it) shows under the cut edge in a 3/4 view.
- A ray from a vertex exactly ON the frame edge grazes the terrain's border edge and misses;
  clamp probes inside the frame.
- PIL reads a 16-bit RGBA PNG as 8-bit; check the IHDR bit depth (byte 24 = 16) or decode raw.

## Layout

```
scripts/render-map/            (this repo: code + docs only)
  tools/          fetch_map.py  render_set.py  preview.py  blender_topdown.py  wmo2obj.py  adt2obj.py
                  composite_water.py  align_to_real.py  export_glb.py  casc/{cascget.cpp,CASCLIB_COMMIT}
                  mpq_chain.py  mpq_wmo_diff.py  mpq_inventory.py  mpq/{mpqget.cpp,STORMLIB_COMMIT}
                  chronicle_render.py  check_log_positions.py  view_glb.py  rmconfig.py  (+ m2/diag spikes)
  local.example.yaml  LOCAL.example.md   -> local.yaml / LOCAL.md (gitignored; or ~/.config/chronicle-render-map/)
  .venv/          (gitignored)

<workdir>/                     (default ~/.cache/chronicle-render-map/; never inside a repo with a remote)
  data/           wdt-index.csv (built from the community listfile on first use)
  maps/<slug>/    map.yaml  fetch.json  raw/ (wmo: wmo+blp+obj; terrain: minimap/ adt/ terrain-textures/
                  wmo/<fid>/ obj/)
                  renders/vNNN-<label>/  (images, GLBs, manifest.json, align.json, previews.json, log.txt)
                  published/  (chronicle_render.py output, manifest backups, README.md publish record)
  cache/          CascLib/StormLib builds, CDN cache, listfile
```

The workdir may be a git repo of its own (to version manifests next to the tools that made them),
but only one with no remote: Blizzard-derived files must stay private, GLBs included (they embed the
textures). Never post renders publicly.
