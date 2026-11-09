---
name: dungeon-floor-onboarding
description: Extracts and validates dataset-specific multi-floor support for Chronicle dungeon and raid replay maps. Use when onboarding another multi-floor dungeon, calibrating inferred floors, or diagnosing ambiguous floor selection without explicit telemetry.
---

# Dungeon floor onboarding

Treat this as calibration, not an invitation to label a run by elapsed time.
Read `render-map` and `replay-map` first. Published artwork alone does not
establish correct inference. Replay loads optional versioned support artifacts. Manual override and explicit-floor
telemetry stay authoritative. Missing, stale, invalid or unvalidated support keeps
the existing first-floor fallback. No generated artifact is enabled by default.

## Inputs and boundaries

Collect a dataset ID, map ID, coordinate space, published manifest, one versioned
mesh per floor, public instance metadata and its binary `unit_position` stream.
Keep downloaded meshes, personal logs, decoded observations and derived support
outside Git. Commit only tooling, annotation metadata, hashes and aggregate results.
Do not publish anything without explicit operator approval.

Use independent operator labels for **encounter starts**. Record encounter UUID,
expected floor and the whole-second offset relative to the first encounter start.
Never interpret those labels as transition timestamps. Match them to metadata;
if the offset differs or multiple starts match, ask instead of guessing. Separate
training/calibration runs from held-out validation runs before enabling inference.

## Reproduce the Gnomeregan evaluation

1. Install frontend dependencies with `pnpm install --frozen-lockfile` in
   `frontend/chronicle`. Requires Node 22 with `--experimental-strip-types`.
2. Download exact inputs outside Git. Run from the repository root:

   ```sh
   export W=/tmp/chronicle-floor
   mkdir -p "$W"
   curl -fL https://icons.chronicleclassic.com/forever/maps/manifest.json -o "$W/manifest.json"
   API=https://forever.chronicleclassic.com/api/v1/raidlogs/instances/FrBOsyBr9SulZoke
   for item in metadata positions; do
     URL="$API"; OUT=instance.json
     if [ "$item" = positions ]; then URL="$API/events/unit_position"; OUT=positions.bin; fi
     curl -fL -H 'Origin: https://forever.chronicleclassic.com' \
       -H 'Referer: https://forever.chronicleclassic.com/' \
       -H 'Sec-Fetch-Site: same-origin' -H 'Sec-Fetch-Mode: cors' \
       -A 'Mozilla/5.0 Chrome/130' "$URL" -o "$W/$OUT" || exit 1
   done
   python3 - <<'PYDOWNLOAD'
   import json, os, pathlib, subprocess
   root = pathlib.Path(os.environ['W'])
   manifest = json.loads((root / 'manifest.json').read_text())
   for floor in next(m for m in manifest['instances'] if m['mapID'] == 90)['floors']:
       subprocess.run(['curl', '-fL', 'https://icons.chronicleclassic.com/forever/maps/' + floor['mesh']['path'],
                       '-o', str(root / ('floor-%s.glb' % floor['floor']))], check=True)
   PYDOWNLOAD
   ```

3. From `frontend/chronicle`, run:

   ```sh
   node --experimental-strip-types scripts/floor-inference/validate.mjs \
     /tmp/chronicle-floor scripts/floor-inference/gnomeregan-forever.json
   pnpm exec vitest run --project unit src/pages/Instance/EventsPanels/Map/floorInference.test.ts
   ```

4. Inspect external `floor-report.json`. Exit 2 means an annotated start was wrong
   or unknown, or candidate parity failed, not a tool crash. Other nonzero codes
   indicate input/tool failures. `support/<mapID>-<sha256>.json` contains indexed
   geometry; `floor-support-descriptor.json` pins its checksum, dataset/map/frame,
   floor IDs and source mesh SHA-256s. Do not commit derived assets or diagnostic
   observations. `gnomeregan-result.json` records the single-log calibration result,
   not held-out accuracy. Require `uncovered === 0` separately from the anchor gate.

## Onboard another dungeon

1. Publish or obtain correctly partitioned per-floor meshes using `render-map`.
   Numeric floor membership must be verified before inference. Bounds are only a
   broad-phase check: Gnomeregan's overlapping bounds cannot distinguish its floors.
2. From `frontend/chronicle`, copy the fixture shape in
   `scripts/floor-inference/gnomeregan-forever.json`.
   Replace dataset, map, instance, labels and geometry source paths and SHA-256s.
   Hash the exact downloaded bytes (`sha256sum floor-*.glb`). Never silently refresh
   pinned hashes when artwork changes; create a reviewed calibration revision.
3. Keep coordinate registration explicit. The validator accepts world telemetry
   and `wow-yup-mirrored-x` meshes only. It removes root centering translations just
   like `MapScene3D`, then casts at `(-worldX, worldY)` in the GLB horizontal plane.
   Other coordinate spaces or mesh frames require a separate verified adapter.
4. Run extraction and validation. The decoder retains unit, timestamp, map and
   explicit-floor presence. Only party members vote. Missing sample map IDs use
   the independently checked encounter map, never arbitrary map guessing.
5. Review union coverage, ambiguous coverage, per-encounter counts and the estimate
   at each labeled start. Inspect wrong starts against mesh membership and actual
   party positions. Do not substitute the encounter's majority floor for its start.
6. Repeat on held-out logs and synthetic tests covering overlapping floors,
   telemetry precedence, ties, same-time duplicates, gaps and backward seeking.
   Test explicit Z separately if available. Ground-truth labels never enter inference.

## Engine contract and failure gates

`Map/floorInference.ts` is a pure causal engine over candidate-floor observations.
Callers partition by dataset, map and coordinate space and supply party members
only. Keep inferred results separate from raw `sample.floor`. Manual floor choice
remains above any automatic selection in the caller. Explicit telemetry wins over
geometry; conflicting telemetry remains unknown. Each unit gets one recent vote.
Geometry requires a singleton anchor compatible with every recent party sample.
Contradictory or unsupported samples prevent a fresh geometric anchor. Ambiguous
positions may retain an anchor briefly, but do not refresh its age. Synthetic
cached snapshots never vote, including those retimestamped to encounter start.
Offline replay can fill unknowns from fresh evidence up to five seconds ahead,
within the same encounter and without crossing sample gaps over two seconds.
It never overwrites known geometric or explicit telemetry estimates. Live causal
callers omit lookahead. This is a party display estimate, not individual truth.

The fixture uses a two-second party evidence window and a 15-second maximum
continuity age as conservative experimental limits, not calibrated universal
constants. Logged Z permits support within three yards, also an explicit
experimental tolerance. Record and validate any changes on held-out runs.

Stop runtime activation when `uncovered !== 0`, annotated starts are wrong/unknown,
frame registration is unverified, or only one calibration log has been tested.
Ambiguous coverage is reported separately; it is not an uncovered sample and it
is not proof of correctness. Gnomeregan passes six calibration anchors only after
synthetic provenance handling and bounded replay lookahead. No held-out run has
been validated, so its descriptor remains `validated: false`. Never infer general
accuracy from six anchors. See `frontend/chronicle/scripts/floor-inference/DIAGNOSIS.md`.

## Artifact and local preview contract

The texture-free artifact uses `indexed-f32-le-u32-le`: base64 little-endian
float32 XYZ vertices and uint32 triangle indices per floor. It preserves source
geometry precision, not a raster approximation. The validator reports raw JSON,
gzip and original GLB byte counts and compares every observed candidate set against
mesh raycasts. Require zero candidate mismatches. The runtime validates provenance,
SHA-256, bounds allocation sizes, indexes projected triangles and uses optional Z.

`useMapScene` precomputes separate tracks per encounter, independent of playback
seek order. Descriptor loading uses React Query keyed by descriptor and icon base.
No parser/schema rewrite is needed; `map.processor.ts` retains existing synthetic
provenance, while inferred floors never replace raw `sample.floor`.

For local preview, add the descriptor as the instance's `floorSupport` in a local
copy of the manifest and route that manifest plus `support/` requests to the
external files. Run Vite on port 5199 and open the real instance with
`?floorInferencePreview=1`. This bypasses `validated:false` only in development;
it does not bypass hashes, dataset/map identity or source-path checks. Keep the
backend and real position stream available. Do not change production manifests
just to preview. Test manual floors, explicit telemetry, forward/backward seeks,
missing artifacts, stale source paths and switching datasets. Update the legend
whenever user-facing behavior changes.

## Foundry staging and publication

Only on explicit operator approval, stage the JSON through the Foundry's dedicated
multipart `assets/support` endpoint with `mapID`, `file` and JSON `floorSupport`
descriptor fields, under the normal authenticated namespace route. Use the existing
Foundry authentication flow; never embed credentials in this skill or scripts.
Do not use generic arbitrary JSON uploads or assume ZIP imports include support.
Inspect `frontend/telemetry/src/routes/maps.ts` for the current route prefix.

Drafts may contain `validated:false` for preview. Publication must reject that
state. Complete held-out evaluation and inspect the support/source byte hashes
before a reviewed descriptor sets `validated:true`. Publishing verifies actual
support and source mesh bytes and rejects stale paths or checksums. When source
meshes change, regenerate and revalidate the support artifact rather than retaining
old provenance. Production publication remains a separate operator approval.
