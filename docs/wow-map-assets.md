# WoW map assets

Chronicle publishes each dataset's map manifest beneath its configured icon base URL:

```text
<icon-base>/maps/manifest.json
<icon-base>/maps/manifest.original.json
<icon-base>/maps/manifest.styled.json
<icon-base>/maps/manifest.meshes.json
<icon-base>/maps/manifest.renders.json
<icon-base>/maps/original/<tile-id>.webp
<icon-base>/maps/renders/<name>.{png,webp}
<icon-base>/maps/3d/<slug>-open-top.glb
```

The frontend accepts v1 published manifests during migration; all new imports use v2. `make maps` works for each `SERVER` and publishes native artwork under `original/`. Hand-uploaded PNG or WebP renders, styled art and placeable meshes are independent optional layers under `renders/`, `render-styled/` and `3d/`. The publisher merges their root-level source manifests into `manifest.json` after each job. Generated manifests and tiles live under `frontend/imagecache/<server>/maps/`, are ignored by Git, and are published to object storage.

## MPQ-era clients

Turtle WoW, VanillaPlus, AzerothCore 3.3.5a, and the 2.4.3 TBC client use the legacy extractor. It reads `WorldMapArea.dbc`, `WorldMapOverlay.dbc`, `AreaTable.dbc`, and `Map.dbc`, discovers `Interface/WorldMap` BLP files from the MPQ listfiles, converts referenced artwork to WebP, and emits the shared manifest.

```bash
make maps/turtle
make maps/vanillaplus
make maps/azerothcore
make maps/tbc
```

The corresponding public paths are `turtle/maps`, `vanillaplus/maps`, `azerothcore/maps`, and `tbc/maps`. Each dataset's `icon_base_url` must point at the matching server root.

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

Legacy base-zone maps use the twelve standard 256-pixel tiles plus explored overlays from `WorldMapOverlay.dbc`. Every dungeon and raid in `Map.dbc` is included in the instance inventory so Map Foundry can attach manual renders and meshes. Native floors are included when the client contains a complete twelve-tile floor matching that instance. The stock 2.4.3 client does not include dungeon floor artwork, so its instance entries have no native floors.

For Wrath-era clients, the legacy extractor also reads `DungeonMap.dbc` and writes each matching `instances[].floors[].bounds` as the floor's coordinate extent. The frontend uses those bounds to recover yards-per-artwork-unit for normalized UI-map telemetry, including unit-token scale, and to register normalized positions into a cropped WMO mesh's coordinate frame. Artwork dimensions such as `1002 × 668` describe pixels only and must not be treated as physical size. If a client has no usable `DungeonMap` row, bounds remain absent and replay falls back to uncalibrated flat-map sizing; mesh-backed 3D is withheld for normalized telemetry rather than placing units against the wrong crop.

## Modern CASC clients

WoW Forever and current Blizzard Classic products use `extract-wowdata-maps`. See [WoW Forever game-data import](wow-forever-game-data.md#extract-and-publish-ui-maps) for build pinning, published-tile reuse, and concurrency controls.

```bash
SERVER=forever make maps
```

## Dungeon meshes

The Replay Map's "3D map" toggle stands the units on the dungeon's real geometry instead of the flat tiles. The mesh is a glTF binary served from the icon CDN under `3d/<slug>-open-top.glb`, announced by an additive `instances[].mesh` entry in `manifest.json`:

```json
{
  "mapID": 43,
  "mesh": {
    "path": "3d/wailing-caverns-open-top.glb",
    "bounds": { "minX": -389.07001, "maxX": 191.6667, "minY": -370.83331, "maxY": 538.3512 },
    "zMin": -119.1605,
    "zMax": 56.4689,
    "frame": "wow-yup-mirrored-x"
  }
}
```

`bounds` is the mesh's extent in world coordinates (`minX..maxX` world X, `minY..maxY` world Y) and `zMin`/`zMax` its height range. The frontend places the mesh and projects unit positions from these bounds alone, so an instance needs neither tile artwork nor a render for the toggle. `frame` names the glTF axis convention and must be `wow-yup-mirrored-x`: Y-up with X mirrored, glTF `(x, y, z) = (-wow_x, wow_z, wow_y)`, the only frame the frontend places. An instance without a `mesh` entry shows no toggle and requests nothing.

### Floor-aware manual renders and meshes

Manual render and mesh layers retain the legacy map-level fields for single-floor and floorless
instances. Multi-floor publication nests those same payloads under the native floor identifier:

```json
{
  "mapID": 555,
  "floors": [
    {
      "floor": 1,
      "renders": {
        "path": "renders/555-a1b2-floor-1.png",
        "width": 2400,
        "height": 1800,
        "bounds": { "minX": -100, "maxX": 200, "minY": -300, "maxY": 100 }
      },
      "mesh": {
        "path": "3d/555-c3d4-floor-1.glb",
        "bounds": { "minX": -100, "maxX": 200, "minY": -300, "maxY": 100 },
        "zMin": -20,
        "zMax": 15,
        "frame": "wow-yup-mirrored-x"
      }
    }
  ]
}
```

The renders layer uses `floors[].renders`; the meshes layer uses `floors[].mesh`. A layer may also
retain `instances[].renders` or `instances[].mesh` for a legacy map-level asset. Do not copy one
floor's bounds, height range, or calibration to another floor. A floor render and mesh should use the
same horizontal bounds, but each floor is generated and verified from its own selected geometry.
The renderer does not infer floor membership from the WMO. Configure object-prefix selection and/or
world-Z slicing explicitly, or use an OBJ that already contains only that floor.

#### Map Foundry workflow

For multi-floor maps, prefer a deterministic `chronicle-map-foundry-bundle-v1` ZIP built by
`scripts/render-map/tools/foundry_bundle.py`. It contains root `foundry.json` plus canonical assets
such as `maps/533/floor-1/render.png` and `maps/533/floor-1/mesh.glb`. The generator verifies exact
local byte counts and SHA-256 hashes, the 100 MB per-asset limit, unique map and floor IDs, identical
render and mesh bounds, and complete dimensions, Z range, frame, and optional liquid calibration.
It writes `ZIP_STORED` entries with normalized order, timestamps, and permissions for byte-identical
runs. Absolute source paths are not included.

Each bundled floor has `preferred2D`. `renders` selects the calibrated render and is emitted by
default when staging omits the field. `art` requests native floor art where usable. The bundle still
contains the calibrated render and mesh either way.

The Foundry UI extracts the ZIP in the browser, rejects archives over 512 MB, archives with more than
512 entries, and entries not referenced by `foundry.json`, then uploads each asset
individually and saves one draft containing all floor changes. The draft save is a single conditional
write. Asset storage is not transactional, so a failed import may leave unreferenced content-addressed
objects. Importing a bundle never publishes it. Inspect the completed draft and preview every floor
against a real log before publishing. If an unrelated draft already exists, stop rather than replacing
someone else's unpublished work.

Publication is ordered, not transactional. The Foundry validates all referenced assets before writing,
then writes the source-layer manifests, writes the merged reader `manifest.json` last, and clears the
draft afterward. A failed publish can leave source manifests ahead of the reader manifest or retain an
already-published draft; retry publication to reconcile them. Consumers of the merged reader manifest
see either its previous object or the complete replacement object.

### Mesh-only instances

Some dungeons have no native floor artwork (Ragefire Chasm, map 389, and Ruins of Lordaeron, map 2999), so the original manifest has no `instances[]` entry for them. A `meshes` layer entry whose `mapID` is unknown to the original then creates a floorless instance, `{ "mapID", "name", "floors": [], "mesh" }`, taking its `name` from the layer entry (required in that case; for an existing instance the original's name wins and the entry's `name` is ignored). The entry may still carry nothing but `mesh` (and `name`); floors, `renders` or `styled` are rejected; the `renders` layer may also create named floorless instances.

A floorless instance with a placeable `mesh` uses the mesh extent for single-encounter 3D replay, including when a manual render exists. Its PNG or WebP `renders` image is available in the 2D overview; without calibrated image bounds, the overview does not place route or player markers. A floorless instance without a render remains 3D-only, with no 2D artwork or floor selector.

Do not copy mesh bounds from examples or the 2D PNG: derive and verify them from each actual GLB before adding its `mesh` entry.

### Terrain meshes

Ruins of Lordaeron (map 2999, Forever) is a terrain mesh: open sky over a ~570 × 530 yd walled city, exported with `--kind terrain` and published as a floorless instance. The manifest `bounds` are the exact POSITION extent of the GLB and roofs are kept (nothing is ceiling-culled), so without a logged height (see [Unit heights](#unit-heights)) a unit standing inside a building is probed onto its roof.

Zul'Gurub (map 309) is a terrain mesh in the **turtle** namespace, which OctoWoW and Cappy logs read as well as Turtle's: the 1.12 terrain (~1,333 yd square) with its WMOs kept whole (city walls, bridges, huts, the ziggurat), no M2 doodads (trees, small props). Its entry sits on the native instance next to the floor artwork and a calibrated `renders` PNG; bounds x −12600..−11266.67, y −2166.67..−833.33, z −21.85..292.94. The GLB is 38 MB (about half WebP textures, half geometry). Bridges and roofs stand up to ~33 yd over the paths beneath them, so on logs without z, units walking under them are drawn on top. Turtle's own ZG has not been checked against the 1.12 model.

### Unit heights

A unit stands on the mesh at a probed floor height. When its position samples carry a logged height (`MapPositionSample.z`, from 1.12a logs parsed with #1156 or later; interpolated between samples like x and y), the probe starts 2.5 yd above that height and takes the first surface below it, so a unit under a bridge, a roof or a ziggurat tier stands where it was logged. Without z, or when that probe misses the mesh, the probe drops from above the whole mesh and takes the highest surface. The probes only hit upward-facing surfaces, so the underside of a platform is never a floor. The camera's aim point uses the same rule with the median logged height of the units it frames (every unit outside the cinematic camera).

### Liquid colour

The exporter's liquid planes (`liquid_*` nodes) are plain translucent blue. Where the dungeon's liquid is not water, add `liquid` to the mesh entry: `color` is a CSS hex colour (`#rrggbb`) and `opacity` a number in (0, 1]; the frontend sets both on the liquid materials when the mesh loads. Without `liquid` the GLB's own blue shows. The merge rejects any other shape (a named or short colour, an opacity of 0 or above 1, extra fields); the frontend ignores a malformed tint and keeps the mesh.

### Where the GLB comes from

Meshes are produced outside this repository by the `rendered-maps` pipeline (`render_set.py <slug> glb --glb`), which writes `<slug>-open-top.glb` (the WMO with ceilings culled, Blizzard textures embedded, glTF Y-up, centred) and `height.json` beside it. The frontend zeroes the GLB's centring node translations, so the file is used as exported.

`height.json` records the full model's extent as `bounds_wow.min`/`max` triples in the pipeline's own frame, which negates both horizontal world axes. Convert it to the manifest entry as:

| Manifest field | From `height.json`     |
| -------------- | ---------------------- |
| `bounds.minX`  | `-bounds_wow.max[0]`   |
| `bounds.maxX`  | `-bounds_wow.min[0]`   |
| `bounds.minY`  | `-bounds_wow.max[1]`   |
| `bounds.maxY`  | `-bounds_wow.min[1]`   |
| `zMin`         | `bounds_wow.min[2]`    |
| `zMax`         | `bounds_wow.max[2]`    |

Check the result against the GLB before publishing: read the `POSITION` accessors' `min`/`max`, map them with `(wow_x, wow_y, wow_z) = (-x, z, y)`, and the centre should match the entry's centre to within a yard (the open-top cull trims a few yards off the full model's edges, which is fine).

### Adding a dungeon

The GLBs carry Blizzard textures and never enter Git; only the source manifest is tracked.

1. Copy the GLB to `frontend/imagecache/meshes/<server>/<slug>-open-top.glb` (the directory ignores `*.glb`); the manifest `path` is `3d/<that file name>`.
2. Add the instance to `frontend/imagecache/meshes/<server>/manifest.meshes.json`: format `chronicle-wow-map-art-v2`, a product-only `target` (meshes are geometry, carried across builds like styled art), and one `mesh` entry per map ID as above. A missing native instance may instead be created by this meshes layer when its entry supplies a name.
3. Publish the layer. The script refuses to run if any announced GLB is missing beside the manifest, and the merge rejects a bad path, degenerate bounds or an unknown frame before anything is uploaded:

```bash
make maps/forever-meshes-upload
# manifest layer only, when the GLBs are already in the bucket:
make maps/forever-meshes-manifest-upload
# or, from frontend/imagecache with rclone credentials in .envrc:
MAPS_UPLOAD_MODE=meshes SERVER=forever MAPS_DIR=forever/maps R2_PATH=forever/maps ./upload-maps-r2.sh
```

GLBs upload with `Content-Type: model/gltf-binary` and a one-year immutable cache, so a changed mesh needs a new file name (and manifest path), not an overwrite. `MESHES_DIR` overrides the source directory.

Dev, Storybook and production all read the GLBs from the icon CDN (`forever/maps/3d/`); nothing is copied into `public/`.

### CORS

The icon CDN applies its CORS policy to every map asset response, not per object or content type: requests for keys under the map namespace answer with `Access-Control-Allow-Origin: *` and `Vary: Origin`. Nothing extra needs to be set on the R2 bucket for meshes. The frontend uses the canonical asset URL for both ordinary images and CORS-enabled texture or mesh requests, so they share one browser cache entry.

## Manually uploaded Forever maps

The tracked `frontend/imagecache/map-layers/forever/manifest.renders.json` registers hand-uploaded PNG or WebP images at `forever/maps/renders/`. Its product-only target and named entries attach by world `mapID`; unknown IDs create floorless instances. `frontend/imagecache/meshes/forever/manifest.meshes.json` independently registers placeable GLBs with verified bounds and frame (see [Adding a dungeon](#adding-a-dungeon)). No separate path-only 3D layer or generated raw-render layer is published.

```bash
SERVER=forever make maps/renders-upload
make maps/forever-meshes-manifest-upload  # GLBs already uploaded
```

The render upload publishes JSON only: verify PNG or WebP objects, MIME types and CORS first. It requires a v2 native source manifest on R2 but no native floor for RFC or Ruins. The merger rejects unnamed floorless entries, incompatible products and invalid paths. Images without calibrated `renders.bounds` can be displayed but must not be used to place route or player overlays. The `styled` layer remains independent.

## Cleaning generated maps

Generated map manifests and WebP tiles are ignored by Git. Remove them only after verifying the successful upload on R2:

```bash
make clean-maps
```

This removes every `frontend/imagecache/<server>/maps/` directory. Run the appropriate `make maps/<server>` target later to extract and publish native art again. Do not delete older `tiles/` objects while any published manifest still references them.

## Validation

After changing extraction behavior:

```bash
go test ./scripts/dbcdata/cli ./scripts/dbcdata ./database/gamedb/dbcdb
golangci-lint run ./scripts/dbcdata/... ./database/gamedb/dbcdb/...
bash -n frontend/imagecache/upload-maps-r2.sh
bash frontend/imagecache/tests/upload-maps-r2.test.sh  # needs GNU find, jq, Go
git diff --check
```
