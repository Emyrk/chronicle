---
name: make-minis
description: Orchestrator procedure for turning a WoW dungeon's bosses into printable 3D miniatures (plus painted boss portraits) with the mini-maker CLI — roster → stills → Meshy → compressed meshes → published per-boss folders under the mini-maker workdir (dungeons/<dungeon>/<boss>/) and, on the operator's explicit go, to the Chronicle Miniature Foundry. Use whenever the user asks to "make minis for <dungeon>", make/generate a mini, miniature, figure or 3D model of a WoW boss, add a dungeon to mini-maker, re-mesh/re-render a boss, make boss portraits, hands you a Meshy .glb for a boss, or asks about mini-maker — even if they don't name the CLI. Proven end-to-end on Wailing Caverns (9 bosses, 2026-10-13).
---

# make-minis — dungeon → reviewed boss minis

**Read `LOCAL.md` first** when it exists: `scripts/mini-maker/LOCAL.md`, else
`~/.config/chronicle-mini-maker/LOCAL.md` (the first found). It holds the operator's rules
(approval gates, spend caps, naming, machine notes). **Where LOCAL.md and this skill disagree,
LOCAL.md wins.** Everywhere below, "the operator" is the person you are working for; their
approvals are theirs alone (see LOCAL.md for who may give them).

You are the ORCHESTRATOR. The CLI (`scripts/mini-maker/scripts/mini.py` in the chronicle
checkout, call that dir `$MM`) already does the real work; your job is to drive it, show the
operator the real output at each stage, and wait for their own eyes on it. Never write pipeline
code from this skill — a new CLI feature is a mini-maker ticket, not a run.
Read `$MM/CLAUDE.md`, `$MM/README.md`, `MESHY.md` and
`PLAYBOOK.md` once per session; this skill assumes them.

Blizzard IP: everything here is **private/local only**. Nothing generated is ever
committed to a repo; it all lives in the workdir (`workdir` in local.yaml, default
`~/.cache/chronicle-mini-maker/`, call it `$W`). Never upload, share or publish a still,
mesh or portrait anywhere outside this machine, except the Foundry publish in section 7.

**The user needs their own accounts and keys:** a Meshy account/API key
(`MESHY_API_KEY`, prepaid credits) and an OpenRouter account/API key (`OPENROUTER_API_KEY`).
If either is missing, stop and ask; never hunt for one on disk.

## Tell the user the flow BEFORE you spend anything

Say this in plain words first (adapt the wording, keep every point):

1. I first generate **2D stills** of each boss (front + back) for you to **review and approve
   or reject**. Nothing 3D is made until you approve the 2D.
2. From the approved stills I then make the **3D mesh** (Meshy), which you review again.
3. Texturing is **optional and costs extra Meshy credits**. Ask whether they want the mesh
   **untextured** (print-ready geometry, ~20-30 credits per boss) or **textured** (+10 credits
   per boss for the retexture, section 4b), and say that difference before running it. Always
   `--dry-run` first and state the cap.
4. Each gate is your decision; I never approve on my own judgement.

**Why the gates are non-negotiable:** every paid stage is the operator's money —
OpenRouter dollars for stills/portraits, Meshy credits for meshes — and not
reversible once called. The CLI enforces two stop points
(`stills_approved`, `mesh_approved`). At each one, show the operator the file and
wait for their word; never look at it yourself and decide it's good enough on
their behalf, even if you're probably right.

## Stop points at a glance

| # | Where | What the operator decides | Spend if yes |
|---|---|---|---|
| 1 | step 1 | the boss list + sculpt descriptions in the roster | none |
| 2 | Stage A | "render stills for <bosses>" | ~$0.20 per boss |
| 3 | Stage B | stills look right → `approve --stage stills` | none (unlocks Meshy) |
| 4 | Stage C | "send to Meshy" | ~20–30 Meshy credits per boss |
| 5 | mesh gate | mesh looks right → `approve --stage mesh` | none |
| 6 | portraits | "make portraits" | ~$0.04 per boss |

Compress and publish are local and free once the mesh gate is open.

## 0. Setup, once per session

```
cd $MM                                       # scripts/mini-maker in the chronicle checkout
PY=$(python3 scripts/mini_lib/config.py --python)   # local.yaml `python`, else this python3; needs Pillow + PyYAML
python3 scripts/mini_lib/config.py           # prints local.yaml/LOCAL.md in effect, the workdir ($W), checks it
# keys: OPENROUTER_API_KEY, MESHY_API_KEY from the environment or local.yaml `env_file` — never print either
mini() { "$PY" scripts/mini.py "$@"; }
K=<chronicle checkout>/.agents/skills/make-minis   # tools/: retexture, texglb, ground, sheet, chronicle_publish
```

Python 3.12 (no venv yet: README "Quick start"). `D=<dungeon-slug>`,
kebab-case (`shadowfang-keep`, `the-deadmines`). Bosses are plain slugs
(`kresh`), never prefixed — the dungeon folder namespaces them.

## 1. The roster

If `dungeons/$D/roster.yaml` exists, use it as-is (don't re-derive
descriptions). Otherwise:

```
mini new-dungeon $D
```

and fill `bosses:` in. The template's comments are the house sculpt style —
follow them: thick chunky volumes; staffs/weapons touch a hand AND the
base; tails, coils, vines are one fat mass fused to the body or base; legs
merge into the base; no thin spikes, no thin sheets (fins, frills, wings
are thick slabs), no floating sparkles; glow is a paint accent, never
geometry. Write a `# Shape:` comment per boss. `desc` is appearance only —
**no names, no lore** (proper nouns come back as painted lettering);
`name` never reaches the stills prompt. `portrait:` is separate key art —
lore words are fine there. Set `portrait_style:`'s ATMOSPHERE phrase for
the dungeon.

Get the boss list from the operator (or propose the dungeon's canonical bosses and
let them trim it). Ask about shapeshifters (humanoid vs animal form), rotating
or optional bosses and adds up front. For ZG it was animal forms, all four
Edge of Madness bosses, and adds.

**Reference images** (to write the descs from and to compare stills
against): Wowhead blocks fetches, so use the warcraft.wiki.gg API and prefer
the "(Classic)" image variants. Save them to `dungeons/$D/refs/<slug>.<ext>`
with a `refs/SOURCES.md`. The images go in the workdir (`$W/dungeons/$D/refs/`), only
`SOURCES.md` goes in the checkout (`$MM/dungeons/$D/refs/`). Refs are local only and never
sent to a paid API.
`tools/sheet.sh` builds ref | front | back review rows, which the operator asked for.
ImageMagick needs `-font /System/Library/Fonts/Helvetica.ttc`. Show them the roster and get their OK before step 2. Check
the prompts for free:

```
mini render --dungeon $D --dry-run
```

## 2. Stage A — stills (~$0.10/image → ~$0.20 per boss)

State the cost for the bosses named, get the operator's go, then:

```
mini render --dungeon $D --only <boss>[,<boss>...]
```

**Read `$W/work/$D/<boss>/front.png` and `back.png` with the Read tool so they
render inline** — never describe them from `meta.json`. Ask plainly: does
this pass `MESHY.md`'s still checklist (plain white background, whole
figure + base filling the frame, reads as a physical sculpt, no
thin/floating parts, no lettering)?

- **Rejected** → `mini approve --dungeon $D --only <boss> --stage stills --reject`,
  adjust `desc`/`notes` in the roster, rerun. One or two informed
  adjustments, not a loop; each rerun is another ~$0.20 — say so.
- **Approved** — only on the operator's own words:
  `mini approve --dungeon $D --only <boss> --stage stills`

## 3. Stage C — Meshy (~20–30 credits per boss)

`mini mesh --dungeon $D --only <boss> --dry-run` shows exactly what would be
sent. State the cost, get the operator's go, then drop `--dry-run`. It downloads
`$W/work/$D/<boss>/mesh/raw.glb`/`raw.stl`, logs the task to
`$W/meshy-tests/LOG.md`, and opens the mesh gate (`mesh_pending`).

**A mesh the operator made themselves in Meshy's web UI** (already paid): register it
(copied, never moved) — ask for the path, don't search their disk:

```
mini import-mesh --dungeon $D --only <boss> --glb <path> [--stills-from work/$D/<other-dir>]
```

### The mesh gate (both paths)

A `.glb` can't render inline and Quick Look won't preview it — offer
`open $W/work/$D/<boss>/mesh/`, or a quick in-browser
viewer (Artifact) if they want to rotate it. Print the pass criteria (one
connected shell, base attached; recognisable silhouette front and side; no
fused limbs, no missing weapon, no paper-thin sheet; back plausible, not a
smeared mirror) and wait for their verdict.

- **Approved** → `mini approve --dungeon $D --only <boss> --stage mesh`
- **Rejected** → same with `--reject`; ask whether to re-mesh (new spend)
  or rework the stills first.

## 4. Compress + publish (local, free)

```
mini compress --dungeon $D --only <boss>
mini publish  --dungeon $D --only <boss>
```

Compress writes `print.stl` (~35K faces), `web.glb` (Draco), `play.glb`
(~15K tris, Meshopt, ≤140 KB) and `play-15k.glb` into `work/$D/<boss>/mesh/`.
Report the real numbers from `meta.json` `stage_d`, not from memory. A play
tier over its byte budget is a stop-and-report, not a retry (verdan on
Wailing Caverns is the precedent).

Publish copies print/web/play/raw + `stills/` + `hero.yaml` into
`dungeons/$D/<boss>/` byte-for-byte and rebuilds
`dungeons/$D/stills-contact.jpg` — Read the contact sheet so the operator sees the
set. Nothing generated is committed: stills, meshes, hero.yaml and the contact sheet stay in
the workdir. Only a roster change (and `refs/SOURCES.md`) is a normal chronicle change, and
only when the operator asks for a commit.

## 4b. Texture (10 Meshy credits per boss) — hand-run until `mini texture` exists

Only after the mesh gate. Tools live in this skill's `tools/`; they run inside the workdir (paths below are workdir-relative)
with `PY` as the interpreter and read local.yaml / `env_file` themselves:

```
"$PY" $K/tools/retexture.py $D <boss>     # front still as style image → dungeons/$D/<boss>/textured/raw-textured.glb
PY=$PY $K/tools/texglb.sh $D <boss>                   # → play.glb, web.glb, and play-grounded.glb (the one to upload)
```

- Meshy holds at most **10 pending tasks**; an 11th returns
  `429 NoMorePendingTasks` (nothing created, nothing charged). Launch in
  batches of ≤10 and re-run the refused ones.
- **Ground before upload.** Meshy's output is centred on the origin at ±1;
  Chronicle's map assumes compress's shape (base at y=0, footprint diameter
  1, then `BOSS_MINI_SIZE` 2.6). Uploading the raw play.glb made every ZG,
  Onyxia and Kresh mini half-buried and ~2x size (fixed 2026-10-17).
  `tools/ground.py` applies stage_d's footprint transform as a parent node,
  leaving the meshopt buffers untouched. A grounded file reads `bboxMin` y = 0
  in `gltf-transform inspect`.
- QA before upload: render front and back of each textured GLB with headless
  Chrome + three.js (swiftshader). Give it a 60s virtual-time budget, or
  heavier models time out blank.
- Compress's untextured play tier can miss its 140 KB budget on dense meshes
  (Thekal, Hakkar at 142 KB). That's stop-and-report; the textured
  play-grounded.glb is unaffected.

## 7. Publish to Chronicle (prod, shared by every Chronicle server)

Needs the operator's explicit yes in chat, every time (the generic gate; LOCAL.md says who may give it).
Never publish on your own initiative, and never in a session that was only asked to make or
review minis. `tools/chronicle_publish.py plan.json`
does the whole flow and refuses an ungrounded file, a pending draft, or an
entry id another mini already owns:

```
[{"name": "zg-jeklik", "file": "dungeons/zul-gurub/jeklik/textured/play-grounded.glb", "entry_ids": [14517]}]
```

Without `--publish` it uploads and saves the draft and prints the diff;
`--publish` then publishes and checks the live manifest and that every GLB
returns 200 at its local size. The hosts are local.yaml `foundry.api` (default
`https://telemetry.chronicleclassic.com/internal/api/v1/miniatures`) and `foundry.cdn`
(default `https://icons.chronicleclassic.com`). The full sequence, in order:

0. **Auth.** The Foundry sits behind Cloudflare Access: every call goes through
   `cloudflared access curl <url> -s ...` (cloudflared 2026.10 wants the URL straight after
   `curl`, before any curl flag). If it asks you to log in, that is the operator's browser
   login (`cloudflared access login <api url>`); never work around it.
1. **Ground** each file first (section 4b; `tools/ground.py in.glb out.glb`, or `texglb.sh`'s
   `play-grounded.glb`). The tool refuses a file whose scene bbox is not base at y=0 with
   height 0.4–2.5 ("not grounded: run tools/ground.py first").
2. **plan.json** as above (`file` is workdir-relative). Names are `<dungeon-prefix>-<slug>`.
3. `GET <api>` → `{has_draft, draft_version, published, draft}`. The tool stops if
   `has_draft` is true (someone's draft is pending: ask the operator, never discard it), and
   if an entry id already belongs to a different mini name.
4. `POST <api>/assets -F file=@<file>` per mini → `{"path": "miniatures/<sha256 of file>-<filename>"}`
   (must be a valid GLB, ≤100 MB; the upload is immutable and content-addressed).
5. `PUT <api>/draft {"version": null, "miniatures": [...]}` — the list is `published.miniatures`
   with each planned name replaced (same name) or appended, `{name, path, entry_ids}`. Returns
   `draft_version`. Visible to nobody yet; the tool prints replace/add per mini. **Stop here for
   the operator's go if you were not already given it.**
6. `--publish`: `POST <api>/publish {"version": <draft_version, quotes included>}` →
   `{"published": true, "manifest": "miniatures/manifest.json"}`. It fails if the draft changed
   or an uploaded asset is missing.
7. **Verify** (the tool does this and prints `OK`/`BAD` per mini): fetch
   `<cdn>/miniatures/manifest.json?v=<random>` (the manifest is cached 1 h, hence the
   cache-buster) and check every planned `path` is in it, then `GET <cdn>/<path>` with
   `Origin: https://octo.chronicleclassic.com` returns 200 at exactly the local file size.
   Report the real output; a `BAD` is stop-and-report.

A pending draft you must clear is `DELETE <api>/draft {"version": <draft_version>}`, only on
the operator's say-so.

- Names are `<dungeon-prefix>-<slug>` (`zg-`, `ony-`, `wc-`). Entry ids come
  from chronicle `hostiles.go` (`git show origin/main:...` in the chronicle checkout). Check a real OctoWoW lockout too: the
  Octo API (`https://octo.chronicleclassic.com/api/v1/raidlogs/instances/<id>`)
  needs `Origin`/`Referer: https://chronicleclassic.com`. OctoWoW reuses
  different ids sometimes (Thekal is 14599 there, 14509 in vanilla), so a mini
  can carry both.
- The manifest is `cache-control: max-age=3600`. A browser that already loaded
  it keeps the old one up to an hour, so verify with `?v=<random>` and tell the operator
  to hard-refresh.

## 5. Portraits (~$0.04 each)

```
mini portraits --dungeon $D --dry-run     # prompts + which already exist + cost
mini portraits --dungeon $D [--only a,b] [--force a,b]
```

Existing jpgs are skipped unless `--force`d (each reroll is real spend).
Read the results inline for the operator.

## 6. Roster / auto mode — only when the operator explicitly asks

Once any boss has cleared both gates by hand, `mini render --dungeon $D --auto`
runs A→D unattended for the rest of the roster, still hard-failing on
anything machine-checkable. **Never reach for `--auto` on your own** — it's
for "do the rest now". State the total estimate (bosses × ~$0.20 + Meshy
credits) first. Publish afterwards, and show the operator the contact sheet.

## Where this can go wrong

- Don't batch bosses through Stage A/C that the operator didn't name — each is
  spend they haven't necessarily budgeted.
- Never route around a gate by hand-editing `meta.json`.
- A failed Meshy task or a still failing the hard checks (wrong size,
  non-PNG) is stop-and-report — no silent retries; credits are real.
- Never commit `.glb`/`.stl`/images; never copy meshes anywhere outside
  the workdir. The one exception is a Chronicle publish the operator
  said yes to (section 7).
- Never upload an ungrounded GLB (section 4b).
- Things to look for on review that the checklist misses: stray marks that
  read as lettering (Mar'li's back), invented props (Hakkar's sceptres), a
  missing round base (Ohgan), and mirrored backs (Jeklik).
