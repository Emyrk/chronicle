# Meshy input spec

What a still must be for Meshy Image-to-3D to return a usable mesh.
Sourced 2026-09-27 from Meshy's API docs and help center (links at the
bottom). Re-check the docs before trusting a number older than a month.

## Hard requirements (a still that fails one is not handed off)

| Property | Spec | Source |
|---|---|---|
| Format | Real PNG bytes, not a renamed JPEG. API accepts .jpg .jpeg .png; web app also .webp | API docs, help center |
| File size | Under 20 MB (web app limit; API documents none) | help center |
| Resolution | **2048×2048**, square. Floor is 1040 px for multi-view, 512 px single; "2K to 4K is better" for print | multi-view guide, print guide |
| Background | Plain white, nothing else in frame. No gradient, no floor line, no backdrop texture | help center |
| Subject count | Exactly one object. The base is part of it, attached | help center |
| Framing | Whole figure + base visible, filling **70–90%** of frame height, small margin on every edge | help center |
| Lighting | Even, diffuse, soft-box. No hard cast shadow, no rim light, no glow | help center |
| Camera | Eye-level at the figure's mid-height, long lens (flat perspective). Never top-down or bottom-up | help center |
| Occlusion | Nothing cropped, nothing hidden behind another part | multi-view guide |

## Sculpt rules (what makes the mesh printable at 32mm)

Meshy documents that hair strands, thin wires, glass and reflective surfaces
reconstruct badly. For a mini that means:

- thick, chunky volumes; weapons and staffs as thick as a finger of the figure
- weapons held against or close to the body, never floating free
- hair, fur, flame, lightning as solid sculpted masses
- cloaks closed and hugging the body, never an open thin sheet
- matte surface — gloss and metallic highlights read as geometry
- limbs slightly apart from the torso so they do not fuse, but no wide gaps

## Views

Meshy takes 1–4 images. With `meshy-7.1`/`latest` the **first image is the
front view**; the rest are order-free.

| View | Filename | Camera |
|---|---|---|
| front | `front.png` | facing the figure |
| back | `back.png` | 180° |
| side | `side.png` | true 90° profile, figure's left |
| three-quarter | `three-quarter.png` | 45° front-left |

`back` is not in issue #178's view list and should be: Meshy's own guide
names a missing back view as the usual cause of a wrong back, and says front
+ back alone beats any single image.

**Consistency is the hard part.** Meshy needs the same object at the same
scale, pose and lighting in every view. Four independent generations will be
four different figures. So: render `front` first, get it approved, then
render every other view with the approved `front.png` passed as an
`input_references` anchor (downscaled to 1024 px JPEG, per
`PLAYBOOK.md`). A view that drifts from the front is worse than no view — drop it
from the upload rather than send it.

## Settings to test with

`mini.py mesh` sends these (`scripts/mini_lib/meshy.py`
`PRODUCTION_SETTINGS`); a manual web-app upload (`import-mesh`) should use
the same so both paths mean the same thing.

| Field | Value | Why |
|---|---|---|
| endpoint | `POST /openapi/v1/image-to-3d` (one still) · `/openapi/v1/multi-image-to-3d` (2–4) | |
| `ai_model` | `latest` (meshy-7.1) | |
| `should_texture` | `false` | mesh-only: print minis are painted by hand, and it is the cheap tier |
| `pose_mode` | `""` | keep the sculpted pose; `a-pose` would re-pose it for rigging |
| `image_enhancement` | `true`, then `false` as an A/B | default rewrites the input; unknown which is better for us |
| `should_remesh` | `false` | keep raw geometry; decimate later in Blender |
| `topology` | `triangle` | printing does not want quads |
| `geometry_resolution` | `standard` first | `2k`/`4k` only if standard loses the face |
| `target_formats` | `["glb","stl"]` | glb to inspect, stl to print |
| `symmetry_mode` | omit | deprecated, no effect |

Cost per Meshy's pricing page: mesh-only 5–20 credits per task depending on
model; textured 15–35. Remesh 5. Meshy credits are a separate prepaid
balance, not OpenRouter (`MESHY_API_KEY`, from the environment or local.yaml's `env_file`).

## Test matrix (first Meshy session)

Each row is one Meshy task on the same boss. Log every row in
`meshy-tests/LOG.md`.

| # | Input | Question it answers |
|---|---|---|
| 1 | `front.png` alone | baseline |
| 2 | `front.png` + `back.png` | does a back view fix the back? |
| 3 | front + back + side | is a third view worth a render? |
| 4 | row 1 with `image_enhancement: false` | does Meshy's enhancer help or hurt a generated still? |
| 5 | grey-primer `front.png` alone | does an unpainted sculpt give cleaner geometry than a painted one? |

Row 5 is why rosters can set `finish: grey`: with
`should_texture: false` the paint carries no information to Meshy, and
painted colour boundaries may be read as surface detail.

## After the mesh (from Meshy's print guide)

- Default output is around 600K faces; print target is **20K–50K**.
  Decimate after judging the raw mesh, not before.
- "Analyze Printability" is free; "Repair Printability" is 10 credits.
- Minimum wall 0.8 mm (2× a 0.4 mm nozzle). At 32 mm tall that is 2.5% of
  the figure's height — a staff or tail thinner than that in the still
  will not print on FDM.
- STL carries no units; scale is set in the slicer. Binary STL is the safe
  export, 3MF if units or colour matter.

## Pass criteria for a mesh (the operator's gate)

- one connected shell, base attached
- recognisable silhouette from front and side
- no fused limbs, no missing weapon, no paper-thin sheet
- back is plausible, not a smeared mirror of the front

## Sources

- https://docs.meshy.ai/en/api/image-to-3d
- https://docs.meshy.ai/en/api/multi-image-to-3d
- https://docs.meshy.ai/en/api/pricing
- https://help.meshy.ai/en/articles/15723519-how-to-get-better-image-to-3d-results-in-meshy
- https://www.meshy.ai/tutorials/multi-view-image-to-3d
- https://help.meshy.ai/en/articles/9996860-how-to-use-meshy-image-to-3d
- https://www.meshy.ai/tutorials/photo-to-3d-printable-model
