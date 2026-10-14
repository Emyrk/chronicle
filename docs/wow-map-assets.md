# WoW map assets

Chronicle publishes each dataset's map manifest beneath its configured icon base URL:

```text
<icon-base>/maps/manifest.json
<icon-base>/maps/manifest.original.json
<icon-base>/maps/manifest.rendered.json
<icon-base>/maps/manifest.styled.json
<icon-base>/maps/manifest.meshes.json
<icon-base>/maps/original/<tile-id>.webp
<icon-base>/maps/3d/<slug>-open-top.glb
```

The frontend accepts v1 published manifests during migration; all new imports use v2. `make maps` works for each `SERVER` and publishes native artwork under `original/`. Raw geometry, hand-authored art and dungeon meshes are independent optional layers under `render/`, `render-styled/` and `meshes/`. The publisher merges their root-level source manifests into `manifest.json` after each job. Generated manifests and tiles live under `frontend/imagecache/<server>/maps/`, are ignored by Git, and are published to object storage.

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

`bounds` is the mesh's extent in world coordinates (`minX..maxX` world X, `minY..maxY` world Y) and `zMin`/`zMax` its height range. The frontend places the mesh and projects unit positions from these bounds alone, so an instance needs neither tile artwork nor a rendered layer for the toggle. `frame` names the glTF axis convention and must be `wow-yup-mirrored-x`: Y-up with X mirrored, glTF `(x, y, z) = (-wow_x, wow_z, wow_y)`, the only frame the frontend places. An instance without a `mesh` entry shows no toggle and requests nothing.

### Mesh-only instances

Some dungeons have no in-game map at all (vanilla Ragefire Chasm, map 389, whose mesh is not published at the moment; Ruins of Lordaeron, map 2999, is mesh-only today), so the original manifest has no `instances[]` entry for them. A `meshes` layer entry whose `mapID` is unknown to the original then creates a *mesh-only* instance, `{ "mapID", "name", "floors": [], "mesh" }`, taking its `name` from the layer entry (required in that case; for an existing instance the original's name wins and the entry's `name` is ignored). The entry may still carry nothing but `mesh` (and `name`); floors, `rendered` or `styled` are rejected, as is any layer other than `meshes` naming an unknown map.

The frontend treats `floors: []` plus a placeable `mesh` as "3D only": the Replay Map opens with the "3D map" switch on (and disabled, there is nothing else to show), the mesh's extent is the ground from the first frame, the floor selector is hidden, and the 2D paths (the multi-encounter route overview and the WebGL-unavailable fallback) show "No map artwork for this instance" instead of tiles. The map gallery lists the instance with a text card. No per-boss artwork calibration applies, since there is no artwork.

```json
{
  "mapID": 389,
  "name": "Ragefire Chasm",
  "mesh": {
    "path": "3d/ragefire-chasm-open-top.glb",
    "bounds": { "minX": -416.2582, "maxX": 102.9279, "minY": -108.4728, "maxY": 275.3513 },
    "zMin": -66.1637,
    "zMax": 59.4058,
    "frame": "wow-yup-mirrored-x",
    "liquid": { "color": "#d66020", "opacity": 0.85 }
  }
}
```

### Terrain meshes

Ruins of Lordaeron (map 2999, Forever) is the first terrain mesh: open sky over a ~570 × 530 yd walled city, exported with `--kind terrain` and published as a mesh-only instance like Ragefire Chasm. The manifest `bounds` are the exact POSITION extent of the GLB and roofs are kept (nothing is ceiling-culled), so a unit standing inside a building is probed onto its roof.

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
2. Add the instance to `frontend/imagecache/meshes/<server>/manifest.meshes.json`: format `chronicle-wow-map-art-v2`, a product-only `target` (meshes are geometry, carried across builds like styled art), and one `mesh` entry per map ID as above. The map ID must exist in the published original manifest.
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

### Trying a mesh before it is on the CDN (dev manifest overlay)

`VITE_MAP_MANIFEST_OVERLAY` names a URL of a meshes layer in the `manifest.meshes.json` shape that the frontend merges over the fetched map manifest, client-side, with the publisher's rules: `chronicle-wow-map-art-v2`, a product-only `target` matching the manifest, one entry per `mapID` carrying only `mesh` (and `name`); an entry for an existing instance attaches the mesh, one for an unknown `mapID` creates a mesh-only instance. A bad overlay fails the manifest load with the reason, rather than being skipped. It is read only in development builds (`import.meta.env.DEV`); production never looks at it.

`.env.development` sets it to `/dev-manifest/forever.meshes.json`, served from the gitignored `frontend/chronicle/public/dev-manifest/`:

```bash
cd frontend/chronicle
mkdir -p public/dev-manifest
cp ../imagecache/meshes/forever/manifest.meshes.json public/dev-manifest/forever.meshes.json
HOST=https://forever.chronicleclassic.com pnpm dev
```

The live page then shows the 3D map for a Wailing Caverns or Ruins of Lordaeron log and lists the instances under Technical → Maps, with the GLBs read from the CDN. The overlay is only needed until the published `manifest.json` carries the `mesh` entries. Stories seed their manifest directly and do not use the overlay.

### CORS

The icon CDN applies its CORS policy per request origin, not per object or content type: a request with an allowlisted `Origin` for any key under `forever/maps/`, including a `.glb` that does not exist yet, answers with `Access-Control-Allow-Origin` and `Vary: Origin`. Nothing extra needs to be set on the R2 bucket for meshes. The frontend still appends `?cors` to cross-origin texture and mesh URLs, because a response cached without `Origin` carries no CORS headers.

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
bash frontend/imagecache/tests/upload-maps-r2.test.sh  # needs GNU find, jq, Go
git diff --check
```
