# ReplayPlayer

One 3D replay, wired once. A host chooses a clock, a camera and the chrome it
wants; the player does the rest. A fix to the wiring reaches every place the
map is shown.

```
host (clock + camera + capabilities + slots)
  └─ useReplayPlayer(options) → player state      useReplayPlayer.ts
       └─ <ReplayPlayer player={…} …slots />       ReplayPlayer.tsx
            └─ MapView3D (or the 2D map without WebGL)
```

The player is a hook plus a view component, not one component, because a host
reads the scene in its own render: its chrome needs scene fields (floors,
cursor, auto-fit), and the Map panel restarts its preview when a new
encounter's scene first shows. A child component could only hand those up one
frame late.

## What the player owns

- **The scene**: `useMapScene` over the host's `source` (a panel result and its
  context) and the injected `clock`. The player never reads `SyncModeContext`.
- **The held scene**: while the panel reprocesses, the last ready scene stays
  on screen, frozen (`shouldHoldScene`, `shownScene`). `holdValue` lets a host
  hold one value with it (the Map panel: whether Replay was on).
- **The mesh**: whether it is wanted (`meshWanted`), the prefetch, the request
  handed to the view, and its load state.
- **Framing and camera**: the framing state (the default view, Fit and Reset
  pins, user pans), focus, who drives the camera (`cameraModeFor`), Follow
  (group and unit), and the camera handle.
- **WebGL fallback**: the 2D map (or a mesh-only message) when WebGL fails.
- **Every scene field** passed to `MapView3D` (`worldMapId`, `unitModelUrls`,
  `followSource`, `debuffSpellIds`, …), so no host can forget one.

Decisions are pure functions in `replayPlayerModel.ts`, tested in
`replayPlayerModel.test.ts`.

## Contract

`useReplayPlayer(options)`:

| Option | |
|---|---|
| `source` | `PanelRenderProps<MapResult>`: what `useMapScene` takes. A host with its own loader builds these props (the landing already does). |
| `clock` | A `ReplayClock` (`replayClock.ts`): the SyncMode adapter, a local loop, or a stepped clock. |
| `encounterAtMs` | Which selected encounter to show (default: the clock's time). |
| `wholeRun`, `mapSource`, `showHiddenUnits` | Scene options. |
| `meshOn` | The host wants the 3D map. |
| `renderedCanvas` | Which 2D canvas the scene prefers: `"without-mesh"` (default), `"always"`, `"never"`. |
| `camera` | `{ mode: "director" \| "user", path?, pose? }`. `director`: the cinematic camera until the user takes it, and Follow gives it back. `user`: never the Director. A `path` (authored poses on the replay clock) or a `pose` (wins over a path) takes over while set. |
| `holdValue` | A value held with the scene while it reloads. |
| `unitModelUrls` | Miniature URLs to use instead of the shared manifest's. |

The returned state has the scene (`scene`, `live`, `held`, `ready`,
`reloading`), the mesh (`meshWanted`, `meshState`, `dungeonMesh`, `onMesh`),
framing (`view`, `applyFraming`, `followGroup`, `followUnit`, `canFollow`,
`following`, `cinematic`, `cameraMode`), `cameraHandle` (`cut()`, `topDown()`,
`capturePose()`, `scene()`: the live `MapScene3D`, for capture).

`<ReplayPlayer>`:

| Prop | |
|---|---|
| `player` | The hook's state. |
| `view` | Host features passed through to the view: walk, plan, touch input, presence, targeting (`onUnitClick`, `unitRoles`), settings, capture input, a fixed `followGuid`. Scene fields cannot be passed here. |
| `header` | Above the stage. |
| `overlay` | Over the stage, after the view, in order. |
| `transport` | Below the stage. |
| `fallback` | Instead of the view (an inert preview). |
| `framed` | The stage's thin window frame. |
| `bare` | No stage box: the view and overlay go into the host's own box. |

It renders nothing until the scene is ready; show `ReplayPlayerMessage` then.

## Capabilities

`mapHostModel.ts` says what each Map panel host shows:
`mapHostCapabilities(kind, immersive)` with `kind` one of `mini`, `full` or
`mobile`. Immersive (filling the window or fullscreen) is the full map, so the
mini map expanded gets the full map's chrome without remounting. Shared code
checks a capability (`caps.frames`, `caps.walk`, `caps.scrubber`, …), never
the host kind. The preview rules are `mapPreviewOn` and `mapPreviewMaxSpeed`.

## The hosts

| Host | File | Clock | Kind |
|---|---|---|---|
| Summary mini map | `MapPanelHost.tsx` | the map's preview (local loop) until Replay is on, then SyncMode | `mini` |
| Full Map panel | `MapPanelHost.tsx` | SyncMode; the preview for a whole run or while immersive | `full` |
| Fill window / fullscreen | `MapPanelHost.tsx` (its immersive state) | the preview until Replay is on | `full` (immersive) |
| Whole run | `MapPanelHost.tsx` with `wholeRun` | the preview until Replay is on | `mini` or `full` |
| Mobile | `MobileMapHost.tsx` | the preview (4x cap on whole runs) until Replay is on | `mobile` |
| Stories (real logs) | `MapView3D.stories.tsx` (`FixturePlayer`) | the story's SyncMode | n/a (bare) |

`useMapHost.ts` is what the Map panel hosts share: the clock choice, the
player, saved settings, walk and plan availability, targeting and presence.

## Adding a host

1. Pick a clock: `useSyncModeClock()` for the page's Replay, `useLocalLoopClock`
   for a map that plays on its own, `useSteppedClock` for frame-by-frame work.
2. Call `useReplayPlayer` with the source, the clock and a camera.
3. Until `player.ready`, render `ReplayPlayerMessage` (or your own message).
4. Render `<ReplayPlayer>` with the view features you turn on and your chrome
   in the slots. For a Map panel host, add a `kind` to `mapHostCapabilities`
   and let the chrome read capabilities.
5. Never copy scene fields into `MapView3D` yourself. If the view needs
   something new from the scene, add it to `ReplayPlayer`, so every host
   gets it.
