# Mini stills — playbook

Prompt rules for miniature stills. They started as a reversal of a
card-art playbook (poster art wants the opposite of a Meshy input on every
axis). `MESHY.md` is the authority on what the image must be — this file
is how to ask for it. `scripts/mini_lib/prompts.py` assembles the blocks
below from a roster record.

The blocks below are proven: they produced the Wailing Caverns stills
(2026-10-13, 9 bosses, front + back), and those meshed cleanly in Meshy.
For what to write in a boss record's `desc`/`notes`, the house sculpt style
in the `new-dungeon` template (and README "Roster") is the rule.

## Model

`google/gemini-3.1-flash-image`, `size: "2048x2048"`, about $0.10 an image.
Seedream 4.5 draws a good front but cannot turn the figure: the anchored
back changed pose and the unanchored back drew two figures.

## Reversed from poster art

Poster art wants off-centre, cropped, dramatic, flat-ink poster. A Meshy input
wants the opposite on every axis.

| Poster art | Mini still |
|---|---|
| off-centre, bold crops, subject may exit frame | dead centre, whole figure in frame |
| flat screen-print inks, halftone, linework | 3D sculpted volume, matte |
| dramatic negative space, rim light | even soft-box light, no shadow |
| illustrate the effect, withhold the hero | the hero, full body, nothing else |
| 4:3, 7.5% edge crop pass | 1:1, no crop pass |
| POSTER-STYLE block | never — it produces a 2D drawing of a figure |

## Carried over unchanged

- **No proper nouns in the prompt.** Boss `name` never reaches the prompt;
  only `desc`, `palette`, `notes`. Names come back as painted lettering.
- **Negatives as positive prose**, then the literal tail
  `no text, no lettering, no border, no frame, no watermark`.
- **Seedream ignores `aspect_ratio`, honours `size`.** Send `"2048x2048"`.
- **Signature objects simple and early in the prompt.** Compound weapon
  descriptions drift.
- **Gloss magnets.** Lightning, flame, glow pull toward digital gradients.
  Here they must also be solid: `lightning sculpted as thick solid bolt
  shapes fused to the wheel`.
- **Letterform traps.** `rune-etched` → letters. Say `abstract angular
  knotwork, no letterforms`.
- **"Tile"/"sheet" invites a grid.** Never say turnaround, character sheet,
  or reference sheet — they return several figures in one image. Assert
  `one single figure, one single view`.
- **Reference anchors downscaled to ~1024 px JPEG** before use.
- **Approve the anchor before anything depends on it.** Front first, gate,
  then the other views.
- **Log real spend** from `usage.cost`.

## Prompt blocks

Assembled in this order: SUBJECT → SCULPT → VIEW → SHOT → TAIL.

**SUBJECT** — from the boss record:
`{desc}. Colours: {palette}. {notes}.`

**SCULPT** (painted arm):
`A single tabletop board-game miniature figure, a hand-painted collectible
sculpt with simplified chunky toy-like volumes and thick sturdy shapes,
matte paint, standing in a stable iconic pose on one round scenic base that
is attached under its feet. Every part of the figure is solid and connected
to the body; hair, cloth and effects are sculpted as thick solid masses.`

**SCULPT** (grey arm — replaces the palette line):
`…an unpainted miniature sculpt in uniform matte light-grey primer…`

**VIEW** — one of:
- front: `Seen straight from the front.`
- back: `The same figure seen from directly behind.`
- side: `The same figure seen in true side profile from its left.`
- three-quarter: `The same figure seen from a front three-quarter angle.`

For every view except front, add: `This is the identical miniature shown in
the reference image — same pose, same proportions, same base, same scale —
rotated in place. The camera has not moved.`

**SHOT**:
`Studio product photograph on a plain pure-white seamless background, camera
at the figure's mid-height, long lens with flat perspective, even soft
diffuse lighting from all sides with no cast shadow. The whole figure and
its base are fully visible and centred, filling most of the frame with a
small white margin on every side. One single figure, one single view.`

**TAIL**:
`no text, no lettering, no border, no frame, no watermark`

## Back-view rule

Add one sentence saying what is visible from behind and what is hidden:
`From behind only the closed cloak, the back of the head and the heels are
visible; the warhammer is in front of the body and completely hidden by it.
The back of the cloak is plain.` Drop any "carries no X" sentence from the
notes for the back view — it summons X.

## Still open

1. Painted vs grey primer — which gives Meshy cleaner geometry? (Meshy test)
2. Side and three-quarter views. One side attempt returned a front.
3. `seed`. Never sent; untested on Gemini.
4. The contact shadow under the base. Present on every still.
