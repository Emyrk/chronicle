# Local height calibration lab

This tool builds **private local demo assets**, not production parser output or
published map support. It reads one selected encounter from a modern advanced
combat log, pins a reviewed GLB by SHA-256, extracts geometry candidates in
Blender, and invokes the actual `walkableFloors.ts` resolver. It never changes the
raw log or patches the solver. No generated assets belong in Git.

## Requirements and one-command reproduction

Use Python 3.11+, Node 22 with `--experimental-strip-types`, Blender 4.3 with its
bundled NumPy, and the repository checkout. No image decoder or browser is needed.
From the repository root:

```sh
python3 frontend/chronicle/scripts/height-calibration/prepare.py \
  --log "$PRIVATE_LOG" \
  --mesh "$REVIEWED_GLB" \
  --calibration frontend/chronicle/src/pages/Instance/EventsPanels/Map/height-calibrations/forever-dalaran-atrexis.json \
  --raw-map 1416 --attempt 1 \
  --blender "$BLENDER" \
  --out "$EXTERNAL_WORKDIR/height-lab-v1" \
  --image "$REGISTERED_PNG" --height-json "$RENDER_HEIGHT_JSON"
```

`--out` must be absent or empty and outside every Git checkout. Omit both image
arguments for a mesh-only fixture. If supplied, `--image` must be a registered PNG
and `--height-json` must be its renderer `height.json`. Its `frame_world` horizontal
bounds must match the raw GLB extent within 0.01 yard. This checks the declared
frame, not the image pixels' registration; the operator must review registration.
The command intentionally refuses a mismatched mesh hash, unreviewed calibration,
unsupported GLB frame, incomplete encounter, or unexpected raw snapshot map.

The output root contains:

- `fixture.json`: `MapFixture`, including an embedded local manifest;
- `tracks.json`: numeric `references`, precomputed `tracks[reference][guid]`, optional
  `tracks.auto`, `resolvedReferences`, and per-reference `totalNodes`/`missingNodes`
  diagnostics;
- `provenance.json`: calibration, raw source/mesh hashes, tool hashes and versions,
  explicit raw-to-demo map mapping, geometry coverage and limitations;
- `maps/map.glb`, and `maps/map.png` if requested.

The demo's icon base is `/dalaran-demo`; manifest paths are relative to its `maps/`
subdirectory through the existing map URL helpers. Launch the local story:

```sh
cd frontend/chronicle
CHRONICLE_STORY_ASSETS="$EXTERNAL_WORKDIR/height-lab-v1" pnpm storybook
```

Open `Instance/Map/MapView3D` / `DalaranLocalHeightLab`. Do not publish Storybook
with these assets configured. Do not commit the log, GUID observations, candidates,
fixtures, derived tracks, images or GLBs. Names are anonymized but raw GUIDs and
source hashes remain private identifiers, so the output is **not anonymized data**.
The tool prints aggregate counts only and records no absolute input paths.

## Calibration and repeatability

The reviewed JSON contract is:

```json
{
  "version": 1,
  "id": "reviewed-calibration-revision",
  "dataset": "forever",
  "datasetId": "b69b601c-d247-44c6-9cb6-3f71053fd052",
  "mapID": 2959,
  "encounterID": 3311,
  "encounterName": "Atrexis the Grave Knight",
  "enemyEntry": 247126,
  "referenceZ": 60,
  "meshSHA256": "<sha256 of exact reviewed GLB bytes>",
  "frame": "wow-yup-mirrored-x",
  "review": {"status": "operator-reviewed", "note": "<review context and limitations>"}
}
```

`enemyEntry` is optional and marks the encounter enemy in the demo. `--attempt`
selects the 1-based encounter occurrence, not the nth successful kill. The encounter
start's map must match `mapID`. `--raw-map` declares the snapshot map explicitly;
without it, only snapshots matching the reviewed mapID are accepted. Normalization
is recorded in provenance and changes only demo rows, never the source.

A mesh change requires a new reviewed calibration revision and explicit operator
review of the reference height, frame and map mapping. Do not automatically update
`meshSHA256`. Changing `referenceZ` is an experimental anchor choice, not a statement
that the selected surface is correct. The lab compares the reviewed reference with
60, 80, 100, 110 and automatic inference. The solver's `referenceY` receives raw
height because this offline adapter uses one scene unit per yard. Downward drops
remain allowed under production costs. No new maximum-drop rule is introduced.

Run the command twice into distinct output roots and compare SHA-256 hashes of
`fixture.json`, `tracks.json`, `provenance.json` and copied assets. With identical
inputs, scripts, production solver, Node and Blender versions they should match.
No timestamps, random IDs or absolute paths enter the output. For independent
pipeline inspection, `tracks.mjs --help` describes the query and solve passes;
`cast.py` runs only inside Blender with arguments after `--`.

## Recalibrate an encounter

1. Obtain the private source log and exact GLB used by the replay. Preserve the old
   calibration revision so its review can be reproduced.
2. Independently identify the playable layer (for Atrexis, the operator confirmed
   the sewers), then choose a provisional world-yard `referenceZ`. A reference is
   not a constant Z imposed on every player.
3. Copy the calibration to a new revision ID and run the command above. A new mesh
   requires explicitly recording its SHA-256; never refresh the hash automatically.
4. In Storybook compare Current, automatic, and reference modes. Watch the entire
   encounter, scrub backwards, and inspect stairs, overlapping rooms, geometry gaps,
   and legitimate downward drops. Adjust the reference and regenerate as needed.
5. Require zero missing nodes for the reviewed reference, but do not confuse that
   coverage gate with correctness. Review other attempts or independent logs when
   available. Record the reviewer conclusion and limitations in `review.note`.
6. Run the tool checks and replay tests, compare repeat outputs, and commit only
   reviewed metadata/tooling. A geometry change requires renewed visual review.
   Publishing assets is a separate operator-approved operation.

The first reviewed example is Atrexis/reference **60 yards**: the operator checked
that he is in the sewers and that this reference looks correct in the demo. This
is a single-encounter calibration, not validation of every Dalaran encounter.

## Tool checks

```sh
python3 -B -m unittest discover -s frontend/chronicle/scripts/height-calibration -p 'test_*.py'
node --test frontend/chronicle/scripts/height-calibration/tracks.test.mjs
python3 frontend/chronicle/scripts/height-calibration/prepare.py --help
node --experimental-strip-types frontend/chronicle/scripts/height-calibration/tracks.mjs --help
```

The synthetic tests include school conversion, explicit map mapping, snapshot
deduplication/facing, incomplete encounters, solver reference selection and missing
node rejection. No private fixture or timing-dependent assertions enter tests.

## Important limitations

- This is a narrow advanced-log fixture adapter, **not the full combat parser**.
  It extracts positions/health from 19-field advanced snapshot blocks, cast
  successes, damage/heal amounts from those advanced records, and deaths. It omits
  crits, overheal, absorbs, cast durations, ownership, and other combat semantics.
  Classes are unknown. Raw school bitmasks are converted to Chronicle's enum;
  composite masks use the first matching school bit rather than inventing an enum.
- The log's local wall clock has no timezone. Synthetic UTC dates preserve relative
  encounter offsets, not real UTC event times. Snapshot duplicates at the same
  unit/offset use the last record. Rows are sorted by offset; facing is preserved.
- Only flat root-node, uncompressed, indexed triangle GLBs in the reviewed
  `wow-yup-mirrored-x` frame are supported. Root centering translations are removed
  as replay does. Rotations, scales, nested transforms, skins and morphs are refused.
- Blender filters front-facing walkable solid triangles and double-sided `liquid_`
  nodes using the production 50-degree slope threshold. Repeated vertical probes
  merge surfaces within 0.00001 yard. This is an offline geometry adapter, **not a
  claim of exact production three.js/BVH candidate parity**. Coverage and ambiguity
  counts describe candidates, not floor correctness.
- Tracks contain **inferred experimental heights, not logged Z**. Uncovered nodes
  are omitted in exploratory modes with warnings. Any missing node at the reviewed
  reference fails the build to avoid silently bridging an unsupported gap. Stepped
  intermediate positions are derived samples, not observations.
  One reviewed encounter and even full geometric coverage establish no floor ground
  truth, held-out accuracy, or guarantee for stairs, roofs, bridges, gaps or falls.
  The reference can select a buried terrain surface. Inspect alternatives and keep
  raw/current mode available. Do not present these tracks as recorded telemetry.
