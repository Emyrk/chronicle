---
name: replay-map
description: >
  The instance page's replay Map panel (3D view, unit tokens, combat effects,
  target frames, walk mode, live-session presence) and its public legend page
  at /map-legend. Use when: changing anything the map draws or how it looks
  (tokens, halos, target lines, effects, cast icons, combat text, health bars,
  colours, timings), its controls or settings, or the unit frames, so the
  legend page stays in parity with the code.
advertise: true
---

# Replay map

The Map panel draws a fight in 3D with three.js. `/map-legend` (Tools & FAQ →
"Replay map legend") explains every visual on it. **Any change to what the map
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
├── MapSettingsOverlay.tsx# The settings overlay
└── TargetFrames.tsx      # Selected / Target / Target's target frames

frontend/chronicle/src/pages/MapLegend/
├── MapLegendPage.tsx     # The legend: sections, captions, controls table
├── legendArt.tsx         # Token, BossToken, Ground: draws with unitTokenArt
└── legendEffects.tsx     # Effect demos (SVG/CSS) timed from replayEffects
```

## How parity is kept

The legend imports the map's own sources wherever it can, so most changes flow
through on their own:

| Legend shows | Comes from |
|---|---|
| Token discs, notch, halos, pins, cast arc, sigil, ticks, boss pin, dashes | `unitTokenArt.ts` draw functions (same pixels as the map) |
| Token sizes, halo/arc/shadow plane sizes, column size, muted opacity, sigil spin, line widths and dash | `TOKEN_LAYOUT`, `TARGET_LINE`, `MARKS_SCALE` in `unitTokenArt.ts` |
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
  travel), lunge, slash, impact, hit shake, AoE ring, cast ring, heal bolt and
  rising pulse, interrupt flash. Their shapes and motion follow
  `MapScene3D.updateEffects`; their timings come from `replayEffects`. They play
  at `1 / DEMO_SLOWDOWN` speed, and the page says so.
- **Cast icon phases** (casting sweep, instant pop and flash, interrupted wiggle,
  grey and label): `CastIconDemo`, following `MapScene3D.updateCastIcons`.
- **Combat text**: `CombatTextDemo`, following `deriveCombatText`.
- **Health bars**: `HealthBar` in the page, following `MapScene3D.updateBars`.

## Checklist for a map change

1. Make the change in the map (scene, art, effects, settings or controls).
2. If it is a new visual or constant, put it in a three-free module and import it from both sides.
3. Update `/map-legend`: the section's demo, caption, and any new settings or keys.
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
