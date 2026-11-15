# MapScene3D scene tests

Characterisation tests for `MapScene3D` (chronicle-1967). They build a real
scene in the vitest `unit` project (Node, no WebGL, no jsdom) and pin what it
does **today**, rough edges included. When a refactor changes one of these
expectations, either it broke something or the change is intended. If it is
intended, say so in the PR and update the expectation.

```bash
cd frontend/chronicle
pnpm vitest run --project unit src/pages/Instance/EventsPanels/Map/sceneTests
```

## Files

| File | What it is |
| --- | --- |
| `createTestScene.ts` | The harness: `createTestScene()` and the probes into the scene's private state |
| `fakeDom.ts` | The bits of the browser the scene touches: window, document, canvas, `ResizeObserver`, `requestAnimationFrame` on a manual clock, pointer lock, event classes |
| `syntheticDungeon.ts` | A small dungeon built in code as GLB bytes: ground, a balcony (second floor) and a wall |
| `*.test.ts` | One file per behaviour group: camera ownership, WoW input, frame order, floors, camera collision, render on demand, dispose |
| `sceneGraphFingerprint.test.ts` | The whole scene graph (models, trails, lines, effect pools, HUD, relative object ids) at several clock times, compared with `__snapshots__/sceneGraphFingerprint.txt`. A refactor leaves it unchanged; a deliberate change updates it with `-u` and says what changed in its PR |

## Writing a test

```ts
import { expect, it } from "vitest";
import { createTestScene, testUnit } from "./createTestScene";

it("a wheel tick takes the camera from the Director", async () => {
  const h = await createTestScene({ units: [testUnit("boss", 0, 0, { boss: true })], director: new Set(["boss"]) });
  h.input.wheel(-100);
  expect(h.probe.owner()).toBe("user");
});
```

- **`createTestScene(options)`** installs the fake browser and builds the scene
  with a stub renderer and the manual clock. Unless `mesh: false`, it also
  loads the synthetic dungeon through the scene's normal fetch, GLTF and BVH
  path. Then it settles the camera. Everything is torn down when the test
  finishes; you don't need to dispose anything yourself.
- **Time only moves when you move it.** `h.frame(ms?)` advances the clock one
  frame (16.7 ms by default) and runs the queued animation frame.
  `h.frames(n)`, `h.settle()` (until the camera holds still) and
  `h.runUntilIdle()` (until no frame is queued) build on it. `setTimeout` is
  faked: use `h.runTimers()` or `vi.advanceTimersByTime(ms)` for the click
  delay, the sliced floor-track build and the presence throttle.
- **Input, as the browser sends it:** `h.input.drag(button, dx, dy)`, `click`,
  `doubleClick`, `wheel`, `keyDown`/`keyUp`/`hold(code, ms)`, `hover`/`leave`,
  `touchDown`/`touchMove`/`touchUp`, `pointerCancel`, `blurWindow`. The
  mobile layout's pad and stick go through the scene's own
  `setMobileInput`. Map keys only act while
  the pointer is over the map, so call `h.input.hover()` first in free cam.
  `h.screenOf(x, y, z)` gives the pixel to click for a scene point.
- **What the scene shows:** read it through `h.probe`, and prefer what is on
  the scene graph:
  - the camera: `pose()`/`poseLine()`, `angles()` (yaw, pitch and distance
    about walk mode's head or the free cam's pivot), `distance()`, `target()`;
  - walk mode's character as drawn: `avatar()` (feet, facing, visible);
  - units: `unit(guid)` (a snapshot: base, floor, cast arc), `barQuads()`;
  - `floorTracks()` and `mesh()`.

  `owner()` is the one probe for who moves the camera. `h.events` records
  what the scene reported to its host: follow (the followed unit), walk,
  viewport and mesh-state callbacks. `h.renders.count` counts draws,
  `h.awake` tells you whether a frame is queued, and `h.traceFrame()` lists
  the steps of the next frame in order (waking the loop for it if it
  sleeps). `h.countFreeCamPlacements(run)` counts how often the free cam
  placed its camera while `run` ran.
- **Probes are the only place tests reach into private state.** They all go
  through `SceneInternals` in `createTestScene.ts`. When a refactor moves a
  field, update that interface and the probe, not the tests. Don't add
  probes for input or camera-rig state (held keys, drag buttons, walk yaw,
  wanted distance): later cars replace that state. Assert what it does to the
  camera and the character instead.
- **The synthetic dungeon** uses one scene unit per yard, centred on the
  origin. `testUnit(guid, x, z)` and `mapPointAt(x, z)` take scene
  coordinates. The ground spans x/z -40..40 at y 0. The balcony spans
  x -40..-10 at y 10. The wall stands at x 15..17, z -15..15, and is 25 high.
  Anything beyond ±40 is off the mesh.
- Prefer exact values derived from the scene's constants (the expected
  numbers in `wowInput.test.ts` are an example) over inline snapshots. Use
  inline snapshots for poses with no simple derivation.
- No network, no CDN: `fetch` is stubbed and serves only the synthetic GLB.
  Boss minis, icons and walk-mode avatars do not load.

## Frame order

`frameOrder.test.ts` checks the order two ways:

- **What a drawn frame shows.** No drawn camera is past where the wall
  allows, or outside the pan radius. A cast and a death show in the frame the
  clock reaches them. These checks survive steps moving between modules.
  Note that today a camera writer that calls `controls.update()` also
  constrains the camera, through OrbitControls' `change` event (oddity 4).
  So these checks still hold if the explicit constraint pass moves before
  the writers.
- **The traced order.** `h.traceFrame()` wraps the methods named in
  `FRAME_STEPS` (in `createTestScene.ts`), plus `controls.update` and the
  draw. It throws when a named step is no longer a method on the scene. That
  list and `traceFrame`'s wrapping are the one place an extraction updates
  when it moves a frame step: point them at the step's new home, and keep
  the order tests as they are.

## The seams

`MapScene3DOptions` takes two seams; production passes neither, so the
defaults are unchanged:

- `createRenderer`: the renderer factory (a `THREE.WebGLRenderer` by default).
- `now`: the clock the scene stamps tweens, cuts, throttles and the effect
  clock with (`performance.now` by default). It also sets the slice budget of
  the follow-track and floor-track builds. On the manual clock that budget
  never runs out, so a build finishes in its first `setTimeout` slice.

## What Node cannot pin

- Pixels. The stub renderer draws nothing; tests read the camera, the scene
  graph and the call order instead.
- GPU-side disposal. Dispose tests check that `renderer.dispose()` is called
  and that shared geometry, materials and BVHs are left alone. They cannot
  check what WebGL frees.
- Real pointer lock and context loss. Pointer lock is granted only when a
  test sets `document.grantPointerLock`, and a test drops it by clearing
  `document.pointerLockElement`.
- Builds that run out of their time budget mid-way. On the manual clock every
  build finishes in one slice.

## Oddities

Behaviour these tests pin that looks like a bug. A car may fix one
deliberately and update its test; the fixed ones are struck through.

1. ~~**An interactive scene's loop never went idle.**~~ Fixed in
   chronicle-1982: the idle mobile input's `jump: false` counted as input.
   Now an idle scene's loop stops, the free-cam mover leaves the Director's
   camera alone, the mobile pad and stick take the camera like any input,
   and a key press moves on its first frame (`renderOnDemand`,
   `cameraOwnership`, `wowInput`).
2. **A new focus does not hand the camera back to the Director**, unlike a
   viewport request, a cut or a follow (`cameraOwnership`).
3. **A plain click reports a user viewport.** OrbitControls ends a gesture
   that never started (`cameraOwnership`).
4. **`applyCameraPose` constrains the camera twice**, and `{ constrain: false }`
   does not stop it. `controls.update()` fires OrbitControls' `change` event,
   whose handler runs `constrainCamera()` (`cameraCollision`).
5. **The floor clamp is undone by the collision pass.** The clamp lifts the
   camera, which lengthens the arm. The collision pass then wants the old
   distance and pulls the camera back in along the new line. It ends below
   the 0.3-yard clearance, and it can even end under the floor it was lifted
   onto (`cameraCollision`).
6. **A unit logged in the air just under a floor stands on top of it.** The
   logged-height probe starts 2.5 yards above the feet, so under the
   1-yard-thick balcony (top at 10) a unit logged at z 8 is placed at 10. If
   the probe starts inside the slab, it passes through the underside to the
   ground (`floors`).
7. **Dropping the follow source drops the floor tracks but not their result.**
   Units stay on their tracked floor (and `floorTracked` stays true) until
   they are placed again (`floors`).
8. **The drag that crosses the 5 px click slop is not looked with.** Of a
   40 px drag, 30 px turn the view (`cameraOwnership`, `wowInput`).
9. **A glide across a wall puts the camera inside it.** The free cam's pivot
   rides the highest surface under it. A double-click move that glides the
   pivot across the wall therefore lifts it onto the wall's top (y 25). Once
   past, the collision pass pulls the camera in to OrbitControls' 1-yard
   minimum, which is inside the wall for a frame (`cameraCollision`).
10. **Losing the pointer lock mid-drag does not end the drag.** Nothing
    listens for `pointerlockchange`. The drag goes on, reading clientX/Y
    deltas instead of movementX/Y, until the button is released. The release
    still ends it, so nothing stays stuck (`wowInput`).
11. **A click or double-click picks a unit through the mesh.**
    `pickScenePoint` raycasts unit tokens before the mesh, so a unit behind a
    wall is picked if its token is under the cursor (`frameOrder`).
