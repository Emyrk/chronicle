# mini-maker

A WoW dungeon's boss list → reviewed, compressed, printable Meshy
miniatures, one folder per boss, published to the Chronicle Miniature Foundry
when the operator says go. A local CLI pipeline you drive with your own AI
agent (the `make-minis` skill in `.agents/skills/make-minis/`). Not an app,
not a service. Blizzard IP: **private/local use only, nothing generated is
committed** — all state lives in a workdir outside the checkout.

You need your **own Meshy and OpenRouter accounts and API keys**
(`MESHY_API_KEY`, `OPENROUTER_API_KEY`).

## What will happen when you run it

Your agent must tell you this in plain words before it spends anything:

1. It first generates **2D stills** of each boss (front + back) for you to
   **review and approve or reject**. Nothing 3D is made until you approve the 2D.
2. From the approved stills it then makes the **3D mesh** (Meshy), which you
   review again.
3. Texturing is **optional and costs extra Meshy credits**. You choose: an
   **untextured** mesh (print-ready geometry) or a **textured** one; the agent
   says the credit difference before running it. Every paid step is
   `--dry-run` first, with the cap stated.
4. Each gate is your decision; the agent never approves on its own judgement.

## Quick start

```
cd scripts/mini-maker
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt   # Pillow, PyYAML; Node for npx
cp local.example.yaml local.yaml      # optional: workdir, python, env_file, Foundry hosts
.venv/bin/python scripts/mini_lib/config.py                             # shows what is in effect
mini() { .venv/bin/python scripts/mini.py "$@"; }

mini new-dungeon shadowfang-keep      # writes dungeons/shadowfang-keep/roster.yaml; add >=1 boss (copy its commented example)
mini render --dungeon shadowfang-keep --dry-run    # free: prints every prompt, writes nothing
```

With no `local.yaml` the workdir is `~/.cache/chronicle-mini-maker/`. A
`workdir` inside a git repo that has a remote is refused. Settings and your own
rules are looked up in `scripts/mini-maker/` first, then
`~/.config/chronicle-mini-maker/` (`local.yaml`, `LOCAL.md`; examples committed,
real ones gitignored).

## Pipeline

```
new-dungeon <slug>          scaffold dungeons/<slug>/roster.yaml, then fill in bosses
  → Stage A  render         front still first, then the back anchored to it
  → Stage B  approve --stage stills   (gate: stills_pending -> stills_approved)
  → Stage C  mesh           Meshy multi-image-to-3d, mesh-only
  →          approve --stage mesh     (gate: mesh_pending -> mesh_approved)
  → Stage D  compress       print.stl, web.glb (Draco), play.glb (Meshopt)
  → publish                 copy into dungeons/<slug>/<boss>/ + refresh contact sheet
portraits                   painted boss key art (separate from the minis)
```

Every command takes `--dungeon <slug>`. The dungeon folder namespaces
everything; boss slugs are plain (`kresh`, not `wc-kresh`):

| What | Where | Path |
|---|---|---|
| Roster (the only input, tracked) | checkout | `scripts/mini-maker/dungeons/<slug>/roster.yaml` |
| Working state | workdir | `work/<slug>/<boss>/` |
| Published minis | workdir | `dungeons/<slug>/<boss>/` |
| Portraits | workdir | `dungeons/<slug>/portraits/<boss>.jpg` |
| Billed-call logs | workdir | `cost.log`, `meshy-tests/LOG.md` |

## Run

```
export OPENROUTER_API_KEY=... MESHY_API_KEY=...  # or local.yaml `env_file`; never printed or written
mini() { .venv/bin/python scripts/mini.py "$@"; }   # bash/zsh, from scripts/mini-maker/

mini new-dungeon shadowfang-keep                   # then edit its roster.yaml
mini render    --dungeon wailing-caverns --dry-run # free: prints every prompt
mini render    --dungeon wailing-caverns --only kresh
mini approve   --dungeon wailing-caverns --only kresh --stage stills
mini mesh      --dungeon wailing-caverns --only kresh [--dry-run]
mini approve   --dungeon wailing-caverns --only kresh --stage mesh
mini compress  --dungeon wailing-caverns --only kresh
mini publish   --dungeon wailing-caverns --only kresh
mini portraits --dungeon wailing-caverns [--only kresh] [--force kresh] [--dry-run]

# once one boss (any dungeon) is manually mesh_approved:
mini render --dungeon wailing-caverns --auto

# a raw mesh downloaded from Meshy's web UI instead of Stage C:
mini import-mesh --dungeon wailing-caverns --only kresh --glb ~/Downloads/kresh.glb
```

Tests: `.venv/bin/python -m pytest tests` (or
`.venv/bin/python -m unittest discover -s tests`) — no network, no subprocess, no
paid call.

### CLI surface

| Command | Stage | What it does |
|---|---|---|
| `new-dungeon <slug>` | setup | Write `dungeons/<slug>/roster.yaml` from a commented template carrying the house sculpt style. Refuses to overwrite. |
| `render --dungeon D [--only a,b] [--dry-run] [--auto]` | A (+ C/D with `--auto`) | Render stills. `--dry-run` writes nothing, calls no API. `--auto` chains A→C→D unattended once any boss in any dungeon is manually `mesh_approved`. |
| `approve --dungeon D --only boss --stage stills\|mesh [--reject]` | B / C | Flip a gate. Refuses unless the gate is `_pending`. |
| `mesh --dungeon D --only a,b [--dry-run]` | C | Submit a `stills_approved` boss to Meshy, poll, download, open the mesh gate. |
| `compress --dungeon D --only a,b` | D | Decimate + compress a `mesh_approved` boss. |
| `publish --dungeon D --only a,b` | publish | Copy a compressed, `mesh_approved` boss into `dungeons/D/<boss>/`; refresh `dungeons/D/stills-contact.jpg`. |
| `import-mesh --dungeon D --only boss --glb path [--stills-from dir]` | C (alt) | Register a web-UI Meshy download as `mesh/raw.glb`; opens the gate as `mesh_pending`, never approved. |
| `portraits --dungeon D [--only a,b] [--force a,b] [--dry-run]` | art | Painted portraits from the roster's `portrait:` + `portrait_style:`. Skips existing jpgs unless `--force`d. |

## Roster

```yaml
name: Wailing Caverns
portrait_style: >-            # appended to every portrait: "<portrait>. <portrait_style>"
  richly textured oil painting ...
bosses:
  # Shape: bulky quadruped, shell.
  - slug: kresh               # kebab-case; the folder name everywhere
    name: Kresh               # display only — never reaches the stills prompt
    desc: ...                 # appearance only, no proper nouns
    palette: [moss green, slate gray, pale crystal teal]
    views: [front, back]
    finish: painted           # painted | grey
    notes: ...                # sculpt constraints (house style below)
    back: From behind, ...    # required with a back view
    portrait: ...             # portrait prompt; lore words fine here
```

**House sculpt style** (what Meshy reconstructs and a printer prints —
proven on Wailing Caverns): thick chunky volumes; every prop, tail, coil,
vine fused to the body or base; legs merge into the base; no thin spikes,
no thin sheets (frills, fins, wings are thick slabs with no holes), no
floating parts; glow/magic is a paint accent, never geometry. The
`new-dungeon` template carries the full list as comments.

## Gates and spend

Two gates, never skipped, never auto-approved by the CLI itself:

- **Stills** (`stills_status`): `stills_pending` → `stills_approved` /
  `stills_rejected`. `mesh` refuses a boss that isn't `stills_approved`.
- **Mesh** (`mesh_status`): `mesh_pending` → `mesh_approved` /
  `mesh_rejected`. `compress` and `publish` refuse a boss that isn't
  `mesh_approved`; `publish` also refuses one without a Stage D result.

`--auto` only skips the human judgement call once some boss has already been
carried through `mesh_approved` by a real `approve` (`mesh_approved_by:
"manual"`); it never bypasses a machine-checkable failure and never widens
the roster beyond what the roster / `--only` names.

Spend: stills ~$0.10/image (Gemini 3.1 Flash Image, 2048²) → ~$0.20 per
boss; Meshy ~20–30 credits per mesh task; portraits ~$0.04 each (Seedream
4.5). Every billed OpenRouter call is appended to the workdir's `cost.log`, every Meshy
task to its `meshy-tests/LOG.md`. Tests and `--dry-run` cost nothing.

## Stage D — compression

`@gltf-transform/cli@4.5.0` via `npx` (no Blender on this host; its
`simplify` + `draco` + `meshopt` cover it). gltf-transform has no STL
exporter, so `scripts/mini_lib/glbtools.py` (stdlib) writes `print.stl`.

- **print.stl** — simplified to the 20K–50K printable range (target 35K).
- **web.glb** — simplified to ≤150K faces, then Draco-compressed (~400 KB).
- **play.glb** — ~15K triangles pre-crease, crease-split normals at 45°,
  base at y=0, x/z centred on the base footprint, scaled so the footprint
  diameter is 1.0, Meshopt-compressed. Byte budget 140 KB (110 KB gz) —
  Stage D fails loudly over budget rather than silently degrading
  (verdan-the-everliving: 1.6 KB over, so it has no `stage_d` record and
  `publish` refuses it until that's resolved).
- **play-15k.glb** — lighter ~9K crowd tier, same treatment (stays in
  `work/`; not published).

All play tiers are simplified from `raw.glb`, not from `web.glb`. Axes:
Meshy's front faces +Z, up is +Y; no rotation is applied. `meta.json`
records face counts, bytes, footprint, scale and `base_diameter` (mean x/z
extent of the decoded base slice) per tier. Stage C always requests
`should_texture: false`, so there is no textured variant to re-encode.

## Publish

`publish` copies, byte-for-byte, from `work/<dungeon>/<boss>/`:

```
dungeons/<dungeon>/<boss>/
  print.stl     # Stage D, ~35K faces, for printing
  web.glb       # Stage D, Draco, for viewers
  play.glb      # Stage D, ~15K tris, Meshopt, base y=0, footprint 1.0
  raw.glb       # the untouched Meshy mesh (source for texturing / re-compress)
  stills/       # front.png (+ back.png) the mesh was built from
  hero.yaml     # the normalized boss record the stills were rendered from
```

It never re-compresses, never deletes anything else in the boss folder
(e.g. a hand-made `textured/`), and then rebuilds
`dungeons/<dungeon>/stills-contact.jpg`: one 400 px column per published
boss (sorted by slug), front on top, back below. All of it stays in the workdir; none of it is committed.

## Working-state contract

```
work/<dungeon>/<boss>/
  front.png, back.png   # Stage A
  prompt.txt            # exact prompt per view
  hero.yaml             # normalized record
  meta.json             # model, size, seed, cost per view, both gates +
                        # who/when, Meshy task id/settings/credits, Stage D
                        # face counts, bytes, footprint, base_diameter
  mesh/
    raw.glb, raw.stl    # Stage C download
    print.stl, web.glb, play.glb, play-15k.glb   # Stage D
```

Filenames are the interface. Do not rename them.

## Layout

| Path | What |
|---|---|
| `MESHY.md` | Meshy input spec, settings, pass criteria |
| `PLAYBOOK.md` | Stills prompt blocks and rules |
| `dungeons/<slug>/` | One per dungeon: `roster.yaml` (+ `refs/SOURCES.md`). Everything generated goes to the workdir |
| `scripts/mini.py` | The CLI |
| `scripts/mini_lib/` | heroes (roster) / prompts / imagegen / meshy / gate / glbtools / footprint / normals / stage_a / stage_c / stage_d / publish / portraits / scaffold / import_mesh |
| `scripts/migrate_wc_work.py` | One-off, already run: moved `work/wc-<boss>/` to `work/wailing-caverns/<boss>/` |
| `.agents/skills/make-minis/` | The orchestrator skill ("make minis for <dungeon>") with its `tools/` (retexture, texglb, ground, sheet, chronicle_publish); lives at the chronicle repo root |
| `scripts/mini_lib/config.py` | `local.yaml` lookup, the workdir and its git-remote check, `env_file` |
| `local.example.yaml`, `LOCAL.example.md` | Committed examples of the gitignored `local.yaml` / `LOCAL.md` |
| `reference/gen.py` | Original OpenRouter image helper, reference only |
| workdir `meshy-tests/LOG.md` | Every billed Meshy task |
| workdir `cost.log` | Every billed OpenRouter call |
