# WoW map assets

Chronicle publishes each dataset's map manifest beneath its configured icon base URL:

```text
<icon-base>/maps/manifest.json
<icon-base>/maps/manifest.original.json
<icon-base>/maps/manifest.rendered.json
<icon-base>/maps/manifest.styled.json
<icon-base>/maps/manifest.meshes.json
<icon-base>/maps/original/<tile-id>.webp
<icon-base>/maps/meshes/<map-id>.glb
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

The Replay Map's "3D map" toggle stands the units on the dungeon's real geometry instead of the flat tiles. The mesh is a glTF binary served from the icon CDN under `meshes/<map-id>.glb`, announced by an additive `instances[].mesh` entry in `manifest.json`:

```json
{
  "mapID": 43,
  "mesh": {
    "path": "meshes/43.glb",
    "bounds": { "minX": -389.07001, "maxX": 191.6667, "minY": -370.83331, "maxY": 538.3512 },
    "zMin": -119.1605,
    "zMax": 56.4689,
    "frame": "wow-yup-mirrored-x"
  }
}
```

`bounds` is the mesh's extent in world coordinates (`minX..maxX` world X, `minY..maxY` world Y) and `zMin`/`zMax` its height range. The frontend places the mesh and projects unit positions from these bounds alone, so an instance needs neither tile artwork nor a rendered layer for the toggle. `frame` names the glTF axis convention and must be `wow-yup-mirrored-x`: Y-up with X mirrored, glTF `(x, y, z) = (-wow_x, wow_z, wow_y)`, the only frame the frontend places. An instance without a `mesh` entry shows no toggle and requests nothing.

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

1. Copy the GLB to `frontend/imagecache/meshes/<server>/<map-id>.glb` (the directory ignores `*.glb`).
2. Add the instance to `frontend/imagecache/meshes/<server>/manifest.meshes.json`: format `chronicle-wow-map-art-v2`, a product-only `target` (meshes are geometry, carried across builds like styled art), and one `mesh` entry per map ID as above. The map ID must exist in the published original manifest.
3. Publish the layer. The script refuses to run if any announced GLB is missing beside the manifest, and the merge rejects a bad path, degenerate bounds or an unknown frame before anything is uploaded:

```bash
make maps/forever-meshes-upload
# or, from frontend/imagecache with rclone credentials in .envrc:
MAPS_UPLOAD_MODE=meshes SERVER=forever MAPS_DIR=forever/maps R2_PATH=forever/maps ./upload-maps-r2.sh
```

GLBs upload with `Content-Type: model/gltf-binary` and a one-year immutable cache, so a changed mesh needs a new file name (and manifest path), not an overwrite. `MESHES_DIR` overrides the source directory.

For local development, `VITE_DUNGEON_MESH_BASE` (set to `/dungeon-meshes` in `.env.development`) makes the frontend read `<base>/<file>` for the manifest's file name instead of the CDN, so `frontend/chronicle/public/dungeon-meshes/43.glb` serves the Wailing Caverns entry under `pnpm dev` and Storybook.

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
