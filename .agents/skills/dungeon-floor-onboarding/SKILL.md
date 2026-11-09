---
name: dungeon-floor-onboarding
description: Extracts and validates dataset-specific multi-floor support for Chronicle dungeon and raid replay maps. Use when onboarding another multi-floor dungeon, calibrating inferred floors, or diagnosing ambiguous floor selection without explicit telemetry.
---

# Dungeon floor onboarding

Treat this as calibration, not an invitation to label a run by elapsed time.
Read `render-map` and `replay-map` first. Published artwork alone does not
establish correct inference. The current tooling is offline only; it does not
change Replay Map's manual override, explicit-floor voting, or first-floor fallback.

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
2. Create an external directory, such as `/tmp/chronicle-floor`. Download:
   - `https://icons.chronicleclassic.com/forever/maps/manifest.json` to `manifest.json`.
   - `https://forever.chronicleclassic.com/api/v1/raidlogs/instances/FrBOsyBr9SulZoke`
     to `instance.json`.
   - The same instance API URL plus `/events/unit_position` to `positions.bin`.
   - Each map 90 floor's `mesh.path`, relative to the manifest URL directory,
     to `floor-1.glb` through `floor-4.glb`.
   API requests need `Origin: https://forever.chronicleclassic.com`,
   `Referer: https://forever.chronicleclassic.com/`, `Sec-Fetch-Site: same-origin`,
   `Sec-Fetch-Mode: cors`, and a browser User-Agent. Check HTTP failures before parsing.
3. From `frontend/chronicle`, run:

   ```sh
   node --experimental-strip-types scripts/floor-inference/validate.mjs \
     /tmp/chronicle-floor scripts/floor-inference/gnomeregan-forever.json
   pnpm exec vitest run --project unit src/pages/Instance/EventsPanels/Map/floorInference.test.ts
   ```

4. Inspect external `floor-report.json`. Exit 2 means an annotated start was wrong
   or unknown, not a tool crash. `support-v1/floor-N.json` contains derived indexed
   geometry with dataset/map/frame/source SHA-256 provenance. Do not commit it.
   `gnomeregan-result.json` is the checked-in aggregate baseline, not a success claim.

## Onboard another dungeon

1. Publish or obtain correctly partitioned per-floor meshes using `render-map`.
   Numeric floor membership must be verified before inference. Bounds are only a
   broad-phase check: Gnomeregan's overlapping bounds cannot distinguish its floors.
2. Copy the fixture shape in `scripts/floor-inference/gnomeregan-forever.json`.
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
Geometry requires a strict party majority of singleton candidates. Ambiguous
positions may retain an anchor briefly, but do not refresh its age.

The fixture uses a two-second party evidence window and a 15-second maximum
continuity age as conservative experimental limits, not calibrated universal
constants. Logged Z permits support within three yards, also an explicit
experimental tolerance. Record and validate any changes on held-out runs.

Stop runtime activation when coverage fails, annotated starts are wrong/unknown,
frame registration is unverified, or only one calibration log has been tested.
Gnomeregan currently fails two of six start labels despite complete union coverage.
The engine must not conceal that uncertainty by picking the first candidate.

Runtime integration and support-artifact hosting are **not implemented** here.
Before adding them, agree on a compact versioned artifact and dataset-keyed loading
contract. Do not download every full textured floor mesh during ordinary replay as
an unreviewed shortcut. Preserve manual override and explicit telemetry precedence,
add integration tests, update the replay legend, and verify forward/backward seeking
and missing assets before shipping. Parser enrichment additionally needs a separate
inferred-source/version field rather than overwriting the raw telemetry floor.
