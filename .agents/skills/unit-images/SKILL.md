---
name: unit-images
description: Produces and publishes consistent creature model portraits for Chronicle's unit-images manifest. Use when making boss headshots, rendering WoW creature portraits, assigning creature entry IDs, preparing unit image plans, or updating the shared unit image Foundry.
metadata:
  type: workflow
  binding: advisory
---

# Unit images

Create square portraits from the real WoW creature models, review them as a set, then publish them through Chronicle's shared unit image Foundry. This workflow is for portraits and headshots only. Do not invoke the miniature, Meshy, or AI-painted portrait pipelines.

## Rules

- Render the source creature model and skin from the configured WoW client. Do not synthesize or redraw the creature.
- Default to the `headshot` label. Add `full` only when the operator explicitly asks for a full-body variant.
- Keep generated images and extracted models out of git. Store them under `.tmp-unit-images/<set>/` or another ignored local work directory.
- Treat the repository's encounter identities as the source of truth for creature entry IDs.
- Use one manifest record per boss. Name records `<instance-prefix>-<boss-slug>`, for example `mc-ragnaros`, and set `display_name` to the canonical human-readable boss name used for name lookup.
- Never publish a draft until the operator has reviewed the actual contact sheet and explicitly approved publication.
- Publishing affects every Chronicle server. Upload immutable images first and publish `manifest.json` last.

## Workflow

### 1. Build the roster

1. Read the instance's encounter definitions and ranking rules.
2. List every boss requested by the operator. Exclude trash, adds, and miniature-only subjects unless explicitly requested.
3. Record each boss's canonical creature entry ID.
4. Resolve the creature display ID, model path, and skin from the target client data. Prefer the local creature cache or imported world data. A canonical Classic database may fill missing cache records, but verify the result against the client DBCs.
5. Save a local `roster.json` with this shape:

```json
[
  {
    "name": "mc-ragnaros",
    "display_name": "Ragnaros",
    "entry_ids": [11502],
    "model": "Creature\\Ragnaros\\Ragnaros.m2",
    "skin": "RagnarosSkin",
    "render": { "rotation_y": 0, "target_y": 0.68, "view_height": 0.5 }
  }
]
```

`target_y` and `view_height` are fractions of the model's bounding-box height. Tune them per boss after reviewing the first render.

### 2. Extract the models

Convert the client models to textured GLBs with Chronicle's extractor. Pass the resolved skin explicitly so shared model files, such as Flamewakers, get the correct boss colors.

```bash
go run ./scripts/dbcdata extract-models \
  --server turtle \
  --out .tmp-unit-images/<set>/models \
  --model 'Creature\\Ragnaros\\Ragnaros.m2=Creature\\Ragnaros\\RagnarosSkin.blp'
```

The skin normally lives beside the model. Preserve client path capitalization. `CreatureModelData` may report legacy `.mdx` names, but the MPQ stores the converted model as `.m2`; change the extension to `.m2` before extraction.

### 3. Render headshots

Install the existing frontend dependencies if needed:

```bash
pnpm -C frontend/chronicle install --frozen-lockfile
```

Run `scripts/render-headshot.mjs` once per extracted GLB:

```bash
node .agents/skills/unit-images/scripts/render-headshot.mjs \
  --model .tmp-unit-images/<set>/models/ragnaros.glb \
  --output .tmp-unit-images/<set>/headshots/ragnaros.png \
  --target-y 0.68 \
  --view-height 0.5
```

The renderer uses the checked-in frontend's Three.js and Playwright dependencies, the system Chromium, a 1024 by 1024 canvas, the model's Stand animation, and the same fixed dark stylized presentation for every portrait.

Portrait criteria:

- Face or defining upper-body feature is the focal point.
- Major horns, shoulders, or elemental silhouette remain readable.
- Do not crop through the eyes, jaw, or defining head ornament.
- Keep a small margin around the silhouette. Do not shrink the subject to show the full body.
- Background, lighting, camera angle, and output size remain consistent across the set.
- Shared models with different skins must remain visually distinguishable.

Adjust `--rotation-y`, `--target-y`, and `--view-height`, then rerender. Do not edit pixels by hand to repair a bad camera angle.

### 4. Review the set

Build a labeled contact sheet from the rendered PNGs. `ffmpeg` is acceptable when ImageMagick or Pillow is unavailable. Attach the contact sheet in chat and wait for the operator's visual approval. Do not infer approval from silence or from a request to continue generating.

Review for:

- correct model and skin;
- recognizable boss identity;
- consistent scale and framing;
- no missing texture, clipped geometry, blank frame, or animation distortion;
- no accidental full-body miniature composition.

### 5. Prepare the manifest plan

The renderer always writes PNG. Convert approved PNGs to high-quality WebP, then create a local plan containing only `headshot` unless another label was requested:

```json
[
  {
    "name": "mc-ragnaros",
    "display_name": "Ragnaros",
    "entry_ids": [11502],
    "images": {
      "headshot": "/absolute/path/to/ragnaros-headshot.webp"
    }
  }
]
```

Dry-run the merge:

```bash
frontend/imagecache/upload-unit-images-r2.sh plan.json
```

The dry run must show no duplicate entry ownership, duplicate paths, unsupported image types, or missing files.

The browser Foundry at `/internal/unit-images` is an equivalent publishing path. Use it when interactive crop adjustments are easier. Save a draft first, then show the exact draft diff before requesting publish approval.

### 6. Publish and verify

Only after explicit operator approval:

```bash
frontend/imagecache/upload-unit-images-r2.sh plan.json --publish
```

Or publish the reviewed draft in the Unit Image Foundry. After publication:

1. Fetch `https://icons.chronicleclassic.com/unit-images/manifest.json`.
2. Confirm every expected name, entry ID, and `headshot` path.
3. Fetch every new image URL and require HTTP 200.
4. Confirm each object is an image and the expected byte size is nonzero.
5. Report the exact published boss count and any bosses intentionally omitted.

## Gotchas

- `CreatureDisplayInfo` provides the display's model ID and texture variation. `CreatureModelData` provides the model path, usually with a legacy `.mdx` extension that must become `.m2` for MPQ extraction.
- Creature caches only contain creatures the client has encountered. Missing cache entries do not mean the entry ID is wrong.
- Several Molten Core Flamewaker bosses share the Salamander model. Their explicit skin override is required.
- The model extractor names output files from the model basename. Shared-model bosses overwrite one another if extracted into the same directory. Use a separate extraction directory per skin or rename each GLB immediately.
- The manifest permits arbitrary labels, but consumers expect lowercase labels and currently use `headshot`.
- Immutable assets are not deleted when a manifest record changes. Replacing a crop creates a new content-addressed object.

## Self-check

- [ ] Roster matches repository encounter identities.
- [ ] Every boss has a verified entry ID, display ID, model path, and skin.
- [ ] Portraits use real client models, not AI art or miniature renders.
- [ ] Contact sheet received explicit operator approval.
- [ ] Dry run passed.
- [ ] Publish received separate explicit approval.
- [ ] Live manifest and every CDN image were verified.
