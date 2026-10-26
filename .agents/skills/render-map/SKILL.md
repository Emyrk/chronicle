---
name: render-map
description: Produce deterministic, versioned top-down TEXTURED renders of a WoW dungeon map (albedo, water mask, shaded) and, with --glb, a usable cutaway 3D model (GLB with elevations + 16-bit height map) straight from the Blizzard CDN (or a 1.12 MPQ client) — for chronicle's Replay Map 3D/2D layers, overlays, 3D viewers, or any "give me the real floor of <dungeon> with colours" ask — and publish them through the Map Foundry when the operator says go. Use for "render <dungeon> map", "textured top-down of <instance>", "re-render at 4x", "3D model / GLB of <dungeon>", "add <dungeon> to the replay map", "publish <dungeon> mesh".
---

# render-map — WoW dungeon → versioned top-down textured renders (+ GLB, + Map Foundry)

**Read `LOCAL.md` first** when it exists: `scripts/render-map/LOCAL.md`, else
`~/.config/chronicle-render-map/LOCAL.md` (the first found). It holds the operator's rules: approval
gates, reference sets, private-server rules, downstream consumers, naming. **Where LOCAL.md and this
skill disagree, LOCAL.md wins** (the same contract as `CLAUDE.local.md`).

Toolchain: `scripts/render-map/` in the chronicle checkout (call it `$RM`; run the tools from there).
Read `$RM/README.md` once per session; it has the process diagram, the pass table and the paid-for
gotchas; `$RM/LEARNINGS.md` has what each one cost. Settings come from `local.yaml` (same lookup as
LOCAL.md; template `local.example.yaml`): `.venv/bin/python -I tools/rmconfig.py` prints them and the
**workdir** (call it `$W`), where every map, render, cache and publish record lives. Nothing
Blizzard-derived ever goes into the chronicle repo; the tools refuse a workdir inside a git repo with
a remote — do not work around that.
Python: ALWAYS local.yaml `python` if set, else `$RM/.venv/bin/python`, with `-I`. Blender: local.yaml
`blender` (4.3; render_set refuses others). No venv yet → README "Quick start".

You do NOT eyeball geometry, orientation or alignment. Orientation is `rot:` in `map.yaml`;
registration onto a reference is a numeric fit with an IoU in `align.json`. Your visual
work is limited to sanity-reading the result (ceiling gone? water where pools are? no
holes where floor should be?) and reporting it.

## Steps

1. **Map folder.** `$W/maps/<slug>/map.yaml` exists? If not, write one from the README ("Quick
   start", or the annotated one in "Adding a map"): set `directory` (grep `$W/data/wdt-index.csv` for
   the dungeon name; missing → `tools/fetch_map.py --refresh-wdt-index`), `product`, `region`, leave
   `build:` out for the very first fetch. A NEW Forever map (numeric directory, e.g. "Excavation Site:
   Wetlands" = 2998) is in no listfile: get the live build
   (`curl -s http://us.patch.battle.net:1119/wow_classic_beta/versions`), then
   `curl -sL 'https://wago.tools/db2/Map/csv?build=<x.y.z.build>' | grep -i '<name>'`
   and pin `wdt_fid:` from the `WdtFileDataID` column (plus `directory: "<numeric id>"`).
2. **Fetch.** `tools/fetch_map.py <slug>`. It detects the kind — `wmo`
   (cave/building) or `terrain` (ADT tiles: heightmap + baked ground textures + water +
   placed WMOs, converted by `adt2obj.py`; NO M2 doodads — trees, rocks, crates, scaffolds
   are absent, say so). For terrain set `crop: {x: [..], y: [..]}` (world yards) in
   `map.yaml` FIRST: locate the area on the minimap stitch (`render_set.py <slug> look`
   before any ADTs are fetched gives `v000` with `world_transform` in its manifest), else
   you fetch and mesh the whole map (39 tiles / 2.8M tris for Excavation Site). It prints the live build;
   write it into `map.yaml build:` so later fetches refuse drift. `$W/maps/<slug>/fetch.json`
   (keep it) records the build, every FileDataID and the sha256 of every raw file. It ABORTS on anything but
   one origin-placed, unrotated global WMO (or a `placed_wmo:`) — report the placement dump, do not hack around it.
3. **Render.** `tools/render_set.py <slug> <label> --note "<why>"`.
   Default 2400 px; `--width 9600` for 4x. The run self-checks determinism (two 600 px
   renders must be pixel-identical), refuses a Blender other than 4.3, and writes
   `$W/maps/<slug>/renders/vNNN-<label>/` including `preview-*.webp` (1600 px, each <= 1 MB)
   for sharing. If the workdir is a (remote-less) git repo, commit manifests/previews.json after a run, not images.
   Never write into an existing version folder; never pass an output path by hand.
   For a native instance floor, configure `floor: <integer>` or a `floor:` mapping in `map.yaml`,
   or pass `--floor N`. A floor run is named `vNNN-floor-N-<label>` and its GLB is
   `<slug>-floor-N-open-top.glb`; leaving floor unset preserves every legacy name. The renderer does
   not infer membership. When one OBJ contains several floors, set explicit
   `floor.object_include_prefixes`, `floor.object_exclude_prefixes`, and/or `floor.z_min` / `floor.z_max`.
   Prefix selection and Z bisect apply before both top-down framing and GLB culling. Empty selectors,
   bad Z ranges, a selection that removes everything, or a frame prefix that no longer matches aborts.
4. **3D model (optional).** Add `--glb` to the same `render_set.py` call (or run it as its own
   version: `render_set.py <slug> glb --glb --note "..."`). It writes `<slug>-open-top.glb`
   (the cutaway: ceilings, vault fragments, upper walls, hanging decals and overhanging water
   removed by the SUPPORT CULL in `tools/export_glb.py`), `height.png` (16-bit elevation in the
   same camera frame as the passes; `height.json` has the z range and the centring offset; the
   grey is linear since 2026-10-18 — older versions are sRGB-encoded, their `encoding` lacks the
   "linear" prefix — and Pillow drops 16-bit RGBA to 8 bit: read it the way
   `tools/check_log_positions.py` does), and
   `perspective-*.png` proofs rendered from the re-imported GLB. `--glb-full` adds the uncut
   model; `--glb-format AUTO` embeds PNG instead of WebP (4x bigger, no EXT_texture_webp
   needed). The cull is numeric — floor = upward patches >= 10 sq yd, keep a face iff floor
   surface within 8 yd (3 yd for downward faces), props resting on floor kept whole — and its
   knobs go through `--glb-args "--wall-cap 6"`. Compare against the cave GLB in your reference
   set (LOCAL.md). Known remainder: rim bands whose top is a 200-400 sq yd patch over a pool pass as
   floor (same local shape as a bridge); say so, do not hand-edit the mesh.
   **Terrain maps — the Ruins of Lordaeron GLB recipe:**
   (a) crop + `atlas_chunk_px: 512` + `rot: -90` in `map.yaml`, as for the 4x passes — the crop
   is the GLB's extent; (b) `fetch_map.py <slug>` so the OBJ has adt2obj's uid dedupe
   (`fetch.json adt_stats.wmo_duplicate_uids` present); (c) `render_set.py <slug> glb --glb
   --note "..."`, default width, NO `--glb-args`. render_set adds `--kind terrain
   --smooth-prefix terrain_ --frame-include-prefix terrain_` (same flags as the passes).
   Defaults that made it: `--bury-depth 0.5 --hole-depth 3 --straddle-depth 10
   --terrain-px-per-yard 6`, `--roof-cull` OFF (roofs kept). Same contract as the WMO GLB
   (files, `height.json` keys, frame `wow-yup-mirrored-x`, centring on node translations,
   `liquid_*`). (d) Verify: GLB POSITION extent (translations zeroed) == `bounds_wow`;
   `height.png` size/alpha == `dry.png`; perspective + `view_glb.py --focus all` show no slab
   under a cut edge and no floating piece. A slab under a cut edge = something underground
   survived: hide the liquids before blaming water (LEARNINGS 2026-10-14). The knob table is in
   README "Terrain maps"; `--m2` with `--glb` is still refused.
5. **Read the result.** Open `textured.png` (downscale for viewing). Check: ceilings gone,
   water on pools and rivers but not on bridges, no transparent holes inside floor
   (compare `dry.png` alpha; small round holes are doodad plugs and are expected).
   Terrain: `align.json` IoU against `minimap.png` (Blizzard's render of the same tiles) is
   the transform check — read it before looking; then compare rivers and buildings with
   `minimap.png` to catch a mirrored splat axis or a mis-rotated WMO.
   If the map is rotated against what the user wants: change `rot:` and render again — a
   new version, not an edit. `rot: -90` = north up / east right (minimap convention);
   `rot: 90` is south up. Terrain:
   if the whole map comes out uniformly tinted, the water pass had no blue — check
   `water.png` first, not the compositor. With `--glb`: open `preview-perspective-open-top.webp` — no
   floating vault pieces, mounds/stalagmites still on the floor, water not hanging past the
   room; compare `preview-height.webp` hole pattern against the previous version's.
6. **Report** the version folder, the IoU (if a reference is set), the coverage numbers
   from the manifest, the preview sizes, and anything the self-check or fetch refused. Name
   the version (`vNNN-<label>`) whenever you refer to an image. "What good looks like" is your
   reference set in LOCAL.md (cave passes, terrain passes, terrain GLB); none set → say so and
   compare with the previous version of the same map.
7. **Into chronicle's 3D replay (only when the operator asks).** Learned on Zul'Gurub (chronicle #1166/#1167);
   the consumer side is `.agents/skills/replay-map` and `docs/wow-map-assets.md` ("Dungeon meshes").
   - **Check against a real log first:** `tools/check_log_positions.py <version dir> --instance <id>
     [--host <chronicle host>]` (default host: the first of local.yaml `log_hosts`) prints the manifest
     `mesh` entry and checks the log against it. Want: 100% of samples inside the bounds; with z, a median
     `logged z − top surface` near 0 (the linear ZG export: +0.0 yd, 92.7% within 3 yd). The roof/canopy
     table is how often the no-z fallback (highest hit) lifts a unit onto something. A log parsed before
     chronicle #1156 has NO z — a reparse adds it. WMO versions get the same height checks (negated log
     x/y; Molten Core 2026-10-18). Find a log with `unit-position` in its `capabilities` (needs SuperWoW):
     `/api/v1/raidlogs/recent?offset=N` pages the host's public list (few logs have it: one fork host had
     1 of 171 MC logs, another 0 of 52). Save the stream (`events/unit_position`) for `--stream` reuse.
   - **Manifest entry:** bounds = `height.json` `frame_world` as-is (terrain; it already has the
     horizontal negation), WMO = `bounds_wow` with both horizontals negated (`minX = -max[0]`,
     `maxX = -min[0]`, same for y); `zMin`/`zMax` from `height`, frame `wow-yup-mirrored-x`. Both
     tools print the entry; use theirs.
   - **A mesh alone shows no toggle.** Chronicle offers "3D map" only on an instance whose
     artwork has world bounds; a native floor without bounds (ZG) resolves to the zone map. Publish
     a 2D render beside the mesh with the SAME bounds, made by `tools/chronicle_render.py <version>
     [--source <4x version>] --stream <saved unit_position>`: it crops the passes' 1 % camera margin (a
     plain downscale is 2 % too small: ZG's first publish) and turns a WMO pass 180° (pipeline frame;
     chronicle draws north up, west left). It writes `$W/maps/<slug>/published/<map_id>-<slug>[-floor-N]-<vNNN>-<pass>-<width>.png`.
     Without a floor it prints the legacy `{mapID, renders}` instance entry. With a floor it prints
     `{mapID, floors: [{floor, renders}]}`. A `--source` version must record the same floor. Its
     `--stream` check must read ~100 %.
   - **Preview before publishing:** Playwright on the real community page with
     `page.route("https://icons.chronicleclassic.com/<namespace>/maps/**")` serving a local
     manifest.json (live one + the new entry) and the local GLB/PNG — prod code, real log, nothing
     uploaded. Map button → boss in the left list → wait for "Follow" → screenshot the canvas.
   - **Lava streams down walls** (Molten Core `bm_brspire_lavafloortrans`) slope upward, so they are
     FLOOR seeds and survive 140 yd above the floor: `--glb-args "--seed-exclude lavafloortrans"`.
   - **Size:** ZG's 38 MB terrain GLB (510k faces) was ready 3.1 s after the toggle, +~200 MB heap.
     Textures are about half the file: the knob if a map is too heavy.
   - **Publish** — only on the operator's explicit go, naming the map and the namespace. See
     "Publishing through the Map Foundry" below; never with R2 tokens.

## Publishing through the Map Foundry

The Foundry is the telemetry worker (`frontend/telemetry/src/routes/maps.ts`, schema in
`frontend/telemetry/src/maps/manifest.ts`; UI at `https://<host>/internal/maps`). Host and default
namespace: local.yaml `foundry` (`host` default `telemetry.chronicleclassic.com`). Namespaces:
`forever, kronos, epoch, turtle, tbc, vanillaplus, warmane, ascension, azerothcore`; one namespace can
serve several servers (LOCAL.md says which, and what to tell the operator about it).

**Gate.** Publishing changes what every chronicle reader of that namespace sees. Do nothing below
the backup without the operator's explicit go for this map + namespace, after they saw the check
numbers and the preview. No go → stop at the preview and report.

**Auth.** `/internal/*` sits behind Cloudflare Access; the worker itself checks nothing else.
`cloudflared access login https://$HOST` once, then every call is
`cloudflared access curl https://$HOST/internal/api/v1/maps/$NS... <curl args>`. Do NOT send an
`Origin` header (non-GET requests with a foreign Origin or `Sec-Fetch-Site: cross-site` get 403).

**Sequence** (`$API = https://$HOST/internal/api/v1/maps/$NS`, `$PUB = $W/maps/<slug>/published`):

1. **Back up the reader manifest** (the only rollback: there is no rollback or asset-delete route):
   `curl -s "https://icons.chronicleclassic.com/$NS/maps/manifest.json?b=$(date +%s)" > $PUB/$NS-manifest.before-<date>-<slug>.json`.
   Record `len(instances)` and `len(maps)` (the world maps) and the current entry for this `mapID`.
2. **Read the state:** `GET $API` → `draft_version` (null when no draft), `published` and `draft`
   (`renders` / `meshes`, each `{format, target, instances: [...]}`), and the per-instance view.
   A draft you did not make (`has_draft: true`) → stop and ask: it is someone else's unpublished work.
3. **Upload assets:** upload one floor at a time with `POST $API/assets/meshes` and
   `POST $API/assets/renders`, multipart `-F file=@<path> -F mapID=<id>`. The upload is an asset step;
   assign the returned path to a floor in the draft. Meshes: strict GLB 2.0; renders: PNG/WebP ≤ 32768 px; ≤ 100 MB each.
   The Foundry names the file itself, content-addressed
   (`3d/<mapID>-<sha256[:16 hex]>-<slugified filename>.glb`, `renders/<mapID>-...png`): use the
   returned `path` (and, for renders, `width`/`height`). Never write a literal `<slug>-open-top.glb`
   path into a draft or a ticket. Upload the GLB from the version folder and the PNG from `$PUB`.
4. **Save the draft:** `PUT $API/draft` with JSON `{"version": <draft_version>, "renders": [...],
   "meshes": [...]}`. Each array is the layer's FULL instance list — every existing entry from step 2
   unchanged, plus/replacing this `mapID` and floor; a missing entry or floor is unpublished. Preserve
   every other floor and any legacy map-level field. Entries:
   - legacy render: `{"mapID": N, "renders": {"path", "width", "height", "bounds": {minX,maxX,minY,maxY}}}`
   - floor render: `{"mapID": N, "floors": [{"floor": F, "renders": {...}}]}`
   - legacy mesh: `{"mapID": N, "mesh": {"path", "bounds": {...}, "zMin", "zMax", "frame": "wow-yup-mirrored-x"}}`
   - floor mesh: `{"mapID": N, "floors": [{"floor": F, "mesh": {...}}]}`
   A mesh payload may include `"liquid": {"color": "#rrggbb", "opacity": (0,1]}`. `liquid` tints
   `liquid_*` meshes (lava: the map.yaml `water_color` as hex, opacity 0.85).
   - a mapID not in the namespace's original manifest also needs `"name"` (creates a floorless instance).
   Unknown fields are rejected; 409 = version mismatch or lock (reload state, redo). The response
   carries the new `draft_version`.
5. **Check the draft:** `GET $API/instances/<mapID>/preview` shows the merged `renders`/`mesh` next to
   `published_renders`/`published_mesh`. Bounds identical on both layers; paths are the uploaded ones.
6. **Publish:** `POST $API/publish` with `{"version": <draft_version from step 4>}`. It verifies every
   referenced asset exists, writes `manifest.renders.json`, `manifest.meshes.json` and finally
   `manifest.json`, then deletes the draft. Publishing is atomic even when the draft contains several
   floor uploads; never describe an uploaded or drafted floor as live before this succeeds.
7. **Post-check** (fetch with a cache-busting query; plain CDN JSON is cached up to an hour):
   - the new `manifest.json` keeps `len(instances)` and `len(maps)` from step 1 (plus one instance if
     the map was new), and only this `mapID`'s entry changed (diff against the backup);
   - every published asset, fetched from `https://icons.chronicleclassic.com/$NS/maps/<path>`,
     sha256-matches the local file it was uploaded from.
   Anything off → report it and offer the rollback: a draft with the backup's entries, published.
8. **Record it:** write (or append a dated section to) `$PUB/README.md`: date, namespace (and which
   servers read it), "on the operator's go", the CDN paths, the local source of each (version folder +
   command that built it), the entry JSON, the instance/world-map counts kept, the sha match, the log
   check (or why there was none), and the backup file name for rollback.

## Private-server (1.12 MPQ) clients

Which source a fork's map renders from is the operator's rule (LOCAL.md). The usual one: if the
fork's dungeon is identical, use the CDN (1.60) model; if the fork changed it or added content,
render from the fork's 1.12 files. Clients are local.yaml `mpq_clients.<name>`; every `--client` and
map.yaml `client:` takes the name. Before rendering a raid for a fork, run
`tools/mpq_wmo_diff.py <cdn-slug> --client <name>` and read the fork's inventory
(`tools/mpq_inventory.py --client <name> --md ...`; LOCAL.md says where it lives). Compare decoded
vertices and area, not triangles: CDN Classic is stock 1.12 retriangulated. A changed WMO map renders
through `source: mpq` (README "1.12 clients"; a placed WMO in a terrain WDT through `placed_wmo:`).
A changed TERRAIN map has no MPQ reader yet: stop and report. Never write into a client directory
(the chain opens archives read-only; someone plays from it).

## Terrain ("world") maps — the recipe that produced the Ruins of Lordaeron passes

The deliverable is **`shaded-water-aligned.png`** (sun + sky shading, water composited, registered
onto the minimap frame); `textured-aligned.png` is the flat variant. Your terrain reference set is in LOCAL.md.

1. **Look render first, full map, no crop:** `render_set.py <slug> look --width 2400`. Open
   `preview-textured.webp` and `minimap.png` side by side and find the dungeon's subject.
2. **Crop to the subject, tightly.** Pixels in a terrain render are spread over the whole frame,
   so a 9600 px set of a 1600-yd map is 6 px/yard (mush); the same set cropped to a 550-yd city is
   17 px/yard. Convert preview pixels to world yards with the frame printed in `log.txt`
   (`bounds lo=(x,y,z) hi=(x,y,z)`): with `rot: -90`, image top = x max, bottom = x min,
   left = y max, right = y min, and scale = preview px / frame yards. Or on `minimap.png`
   (tiles of `tile_px`): world x = 17066.67 − (tile_y + py/tile_px)·533.33,
   world y = 17066.67 − (tile_x + px/tile_px)·533.33. Add ~15 yd margin; chunks snap outward to
   33.3-yd borders anyway. Write `crop: {x: [..], y: [..]}` + the measurement as a comment in
   `map.yaml`. A dungeon is usually smaller than the look render suggests — Lordaeron is only
   inside the city walls, not the city plus its lake front. When in doubt, ask the operator
   which part is the dungeon, with the look preview.
3. **`atlas_chunk_px: 512`** in `map.yaml` for a 4x set (64 px per texture repeat, ≈1 texel per
   output px at 12–17 px/yard). 128 is only for a 2400 px look. Bake v2 prefilters the textures;
   v1 (before 2026-10-14) did not and is why the first terrain sets looked like static.
4. **Re-run `fetch_map.py <slug>`** after any `crop`/`atlas_chunk_px` change — it is what
   rebuilds `raw/obj/<slug>.obj` and `fetch.json` (`crop_tiles`); render_set does not. Downloads
   are skipped, atlases are cached per (tile, px, bake version), so this is a minute, not a fetch.
5. Render the 4x set. For terrain maps render_set automatically frames the camera on terrain
   only (a WMO whose origin is inside the crop but whose body is not would widen the frame) and
   smooth-shades the heightmap. Expect the IoU to read lower than on a cave (0.87 for a crop vs
   0.99 for Wailing Caverns): it is measured against a stitch of whole minimap tiles.
6. Each crop change = a new version with a `--note` saying what the crop is and why; keep the
   wider one (it is the comparison).

Known limits on terrain: no M2 doodads unless `--m2` (another session's spike; trees, lamps,
crates), a faint shading seam at tile borders in the shaded pass, and lava/water both come
from MH2O/MLIQ (tint via `water_color`/`water_tint` in `map.yaml`).

## What is deterministic, and what is not

- Deterministic (measured): same raw/ + same tool hashes + same args → pixel-identical
  passes. Previews: same Pillow version → same bytes.
- Pinned, not frozen: the CDN only serves the CURRENT build. `build:` makes fetch refuse
  drift; it cannot fetch an old build. `raw/` is therefore the reproducibility anchor —
  do not delete it, and verify a re-fetch against `fetch.json`.
- A new build of the same map may move geometry (Forever re-exported Wailing Caverns
  once already): treat it as a new fetch + new version, and re-check any reference alignment.

## Rules

- Versioned, append-only outputs: never overwrite a version, so what generated what stays
  identifiable. A tweak = a new `vNNN`, with a `--note`.
- Cycles only. Workbench on macOS/Metal is non-deterministic (random geometry drops); the
  self-check exists to catch any such regression — if it fails, stop and report.
- Water is a 3D pass (`--water-mask`), composited afterwards. A 2D mask paints bridges.
- Coordinate conventions come from data, never from memory: chunk positions were read off
  `MCNK`, placement frame off `MODF` vs tile bounds, rotation by exhaustive search against
  `MODF` extents (adt2obj re-verifies every placement, aborts > 1 yd). Do the same for any
  new file type: find the field that encodes the answer and fit to it.
- Pin the build; record provenance. `fetch.json` + `manifest.json` are the answer to
  "what generated this"; keep them with the images if you copy images elsewhere
  (`cp` the whole `vNNN-*` folder, or at least the manifest).
- Edits to the tools change every future manifest's tool hashes — fine, that is the point;
  say which script changed and why in the `--note` of the next render. Gate WMO-path tool changes on
  a re-render of a known GLB version with its args: byte-identical GLB, pixel-identical passes.
- Blizzard IP: local only. Nothing from the workdir goes into the chronicle repo or any repo with a
  remote; never post renders publicly — GLBs included (they embed the textures). The Foundry
  publish is the one sanctioned way out, and only on the operator's go.
