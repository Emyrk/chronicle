---
name: replay-map
description: >
  The instance page's replay Map panel (3D view, unit tokens, combat effects,
  target frames, walk mode, live-session presence) and its public legend page
  at /map-legend. Use when: changing anything the map draws or how it looks
  (tokens, halos, target lines, effects, cast icons, combat text, health bars,
  colours, timings), its controls or settings tabs, the unit frames, or
  walk mode's WoW creature characters (adding models with extract-models),
  so the legend page stays in parity with the code.
advertise: true
---

# Replay map

The Map panel draws a fight in 3D with three.js. The map legend explains every
visual on it, and is shown in two places from one component (`MapLegend`):
the `/map-legend` page (Tools & FAQ → "Replay map legend") and the Map panel's
`?` explainer (`Map/Map.explainer.tsx`, under the summary and tips). **Any change to what the map
draws, how it animates, or how it is controlled must update the legend in the
same change.** A change is not done until the legend matches it.

## Files

```
frontend/chronicle/src/pages/Instance/EventsPanels/Map/
├── Map.tsx               # Panel: overlays, target frames state, settings, walk button
├── MapView3D.tsx         # React bridge: pushes props into the scene
├── MapScene3D.ts         # three.js scene: tokens, effects, bars, camera, walk, presence
├── unitTokenArt.ts       # Token art: canvas drawing + layout constants, NO three.js
├── unitTokens.ts         # Wraps unitTokenArt canvases in three.js textures
├── mapPalette.ts         # Other map colours (bars, cast arc, interrupt label, walk avatar)
├── replayEffects.ts      # Which effects play when: kinds, timings, colours, schools
├── mapModel.ts           # healthBarColor, MAX_HEALTH_BARS, RECENT_HEALTH_MS, projection
├── mapControls.ts        # Keys and MAP_CONTROL_KEYBINDS (help text)
├── mapViewSettings.ts    # Saved display settings: CAST_MODES, ABOVE_DISC_MODES, defaults
├── MapSettingsOverlay.tsx# The settings dialog: tabs (Display, Effects, World, Controls, Character)
├── walkAvatars.ts        # Walk-mode characters: creature roster, CDN URL, clip names
└── TargetFrames.tsx      # Selected / Target / Target's target frames

scripts/dbcdata/cli/extractmodels.go
                          # `extract-models`: vanilla M2 creatures -> animated .glb

frontend/chronicle/src/pages/Instance/EventsPanels/Map/Map.explainer.tsx
                          # The panel's "?": summary, tips, and the legend as its guide

frontend/chronicle/src/pages/MapLegend/
├── MapLegend.tsx         # The legend: sections, captions, controls table (shown in both places)
├── MapLegendPage.tsx     # /map-legend: back link, title, intro, then MapLegend
├── legendArt.tsx         # Token, BossToken, Ground: draws with unitTokenArt
└── legendEffects.tsx     # Effect demos (SVG/CSS) timed from replayEffects
```

## How parity is kept

The legend imports the map's own sources wherever it can, so most changes flow
through on their own:

| Legend shows | Comes from |
|---|---|
| Token discs, notch, halos, pins, cast arc, sigil, ticks, boss pin, dashes | `unitTokenArt.ts` draw functions (same pixels as the map) |
| Token sizes, halo/arc/shadow plane sizes, column size, muted opacity, sigil spin, line widths and dash, owner line opacity and dimming | `TOKEN_LAYOUT`, `TARGET_LINE`, `OWNER_LINE`, `MARKS_SCALE` in `unitTokenArt.ts` |
| Halo colours | `HALO_COLORS` |
| Effect durations, heal/overheal/crit/ranged/interrupt colours, school colours, heal number format | `replayEffects.ts` |
| Health bar colours and rules | `healthBarColor`, `MAX_HEALTH_BARS`, `RECENT_HEALTH_MS`, `mapPalette.ts` |
| Cast icon outline and interrupted colours | `mapPalette.ts` |
| Settings options and their wording | `CAST_MODES`, `ABOVE_DISC_MODES` |
| Controls table | `MAP_CONTROL_KEYBINDS` |
| Live-session colours | `participantColor` |

Rules that keep this working:

- **Never draw token art in `MapScene3D.ts` or `unitTokens.ts`.** Add or change
  a `draw*` function in `unitTokenArt.ts`, wrap it in `unitTokens.ts`, and use
  the same function in `legendArt.tsx`.
- **Never inline a visual constant** (colour, size, duration) in `MapScene3D.ts`
  when the legend shows it. Put it in `unitTokenArt.ts`, `mapPalette.ts` or
  `replayEffects.ts` and import it from both sides. None of these may import
  three.js (the legend page must not pull three into its chunk).
- **Captions are hand-written.** When behaviour changes (who gets a halo, what a
  line means, when an effect plays), rewrite the matching caption on the page.

## What the legend imitates by hand

These are drawn by three.js on the map and approximated on the page. Update
them when the map's version changes:

- **The coin edge and tilt**: stacked divs in `Token` (shading matches
  `drawEdge`: 65% at the face to 35% at the floor).
- **The boss model**: a placeholder shape in `BossToken`.
- **Combat effects** in `legendEffects.tsx`: bolt and streak (head/tail
  travel), lunge, slash, impact, hit shake, AoE ring, heal bolt and
  rising pulse, interrupt flash. Their shapes and motion follow
  `MapScene3D.updateEffects`; their timings come from `replayEffects`. They play
  at `1 / DEMO_SLOWDOWN` speed, and the page says so.
- **Cast icon phases** (casting sweep, instant pop and flash, interrupted wiggle,
  grey and label): `CastIconDemo`, following `MapScene3D.updateCastIcons`.
- **Combat text**: `CombatTextDemo`, following `deriveCombatText`.
- **Health bars**: `HealthBar` in the page, following `MapScene3D.updateBars`.

## Loading (keep the 3D view alive)

- `Map.tsx` holds the last ready scene while the panel reprocesses (`props.loading` / `processing`)
  and passes `frozen` to `MapView3D`, so an encounter switch never unmounts the WebGL view.
  Don't add early returns that unmount `MapView3D` while data reloads.
- The dungeon mesh's bytes are prefetched (`dungeonMeshBytes`) as soon as `useMapScene` knows the
  mesh (its loading `meshHint`), and the parsed mesh + BVH are cached across scenes (`parsedDungeonMesh`).
  Scenes clone the cached template and must not dispose it.

## Settings tabs

`MapSettingsOverlay` builds its tabs from a list of `{ id, label, icon, content }`.
A new settings surface is one more entry; a tab whose `content` is `null` is
hidden (e.g. Effects without combat events). The last tab is remembered in
local storage.

## Walk-mode characters (WoW creatures)

In walk mode you walk as a WoW creature picked in Map settings → Character, or
the classic gold capsule (`CAPSULE_AVATAR`, also the fallback while a model
loads or if it fails). The creatures are real client models converted to
animated `.glb` files and served from the icon CDN at
`https://icons.chronicleclassic.com/game/models/<file>.glb` (`WALK_AVATAR_BASE_URL`).
They never enter Git.

- **Roster:** `GROUPS` in `walkAvatars.ts` (Critters, Beasts, Monsters, Bosses,
  Flyers). An entry is the file name, or `[file, label]` when the name reads
  badly (`["prariedog", "Prairie Dog"]`).
- **Size:** a creature keeps its own height in yards, clamped to
  `WALK_AVATAR_MIN_YARDS`..`WALK_AVATAR_MAX_YARDS` in `MapScene3D.ts`.
- **Animation:** `WALK_AVATAR_CLIPS` maps idle / walk (backwards) / run / air
  to the extractor's clip names (Stand, WalkBackwards, Walk, Run, Fall, Jump).
  Vanilla creatures have no fly animation; some (Ragnaros, Snowman) only Stand.

### Adding a creature

```bash
# Every creature model in the client that has a display (and so a skin):
go run ./scripts/dbcdata extract-models --dbc ~/Games/OctoWoW --list

# Convert (repeat --model; output is the model name, lower case: cow.glb).
# Append ="Creature\X\Skin.blp" to override the main skin.
go run ./scripts/dbcdata extract-models --dbc ~/Games/OctoWoW \
  --out /tmp/models --model 'Creature\Cow\Cow.m2'
```

1. Check the converter's line for the model: it prints bones, vertices and the
   animations it exported. Skip models with only `Stand` unless that is the
   joke, and mounts (they are static).
2. Upload the `.glb` to `game/models/` on the icon CDN.
3. Add the file name to its group in `GROUPS`.
4. Look at it in Storybook: **Instance/Map/MapView3D → KreshRealWalkAvatar**,
   pick it, hover the map and press G. It should face away from the camera and
   animate when you move.

The converter handles vanilla (M2 version 256, `MD20`) models only, read from
an MPQ client (OctoWoW). WoW Forever's client has the same art in the modern
split format (`.m2` + `.skin` + `.anim` in CASC), which it does not read.
Creature skins come from `CreatureDisplayInfo` (the model's first display);
player races are not supported (they need geosets and composited skins).

## Checklist for a map change

1. Make the change in the map (scene, art, effects, settings or controls).
2. If it is a new visual or constant, put it in a three-free module and import it from both sides.
3. Update the legend (`MapLegend.tsx`): the section's demo, caption, and any new settings or keys.
   If the panel's purpose or main interactions change, update the summary and tips in `Map.explainer.tsx`.
   A new effect kind in `ActiveEffectType` needs a new demo card.
4. Run `npx tsc -b`, `npx eslint` on `src/pages/Instance/EventsPanels/Map src/pages/MapLegend`,
   and `npx vitest run src/pages/Instance/EventsPanels/Map`.
5. Look at both in a browser: the map (on a real encounter) and `/map-legend`.

## Verifying in a browser

- Start Vite on port 5199 only: `pnpm dev --port 5199 --strictPort` from `frontend/chronicle`.
  Other ports may be the user's own dev servers. Stop it by PID afterwards.
- Drive it with Playwright scripts in your scratchpad, with
  `NODE_PATH=<repo>/frontend/chronicle/node_modules`. The 3D map needs
  `--use-gl=swiftshader --enable-unsafe-swiftshader`; the legend does not.
- The map needs a backend on :4000 and an instance id. For dungeon meshes,
  route `https://icons.chronicleclassic.com/octowow/maps/**` to `/turtle/maps/`.
- Screenshot `/map-legend` per section (`#overview`, `#tokens`, `#bosses`,
  `#halos`, `#lines`, `#above`, `#effects`, `#casts`, `#text`, `#bars`, …) and
  compare it with the map.
