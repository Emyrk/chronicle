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
  `touchDown`/`touchMove`/`touchUp`, `blurWindow`. Map keys only act while
  the pointer is over the map, so call `h.input.hover()` first in free cam.
  `h.screenOf(x, y, z)` gives the pixel to click for a scene point.
- **What the scene shows:** read it through `h.probe`: `owner()` (who moves
  the camera), `director()`, `pose()`/`poseLine()`, `angles()`, `distance()`,
  `walk()`, `unit(guid)`, `floorTracks()`, `mesh()`. `h.events` records what
  the scene reported to its host (follow, walk, viewport and mesh-state
  callbacks). `h.renders.count` counts draws, `h.awake` tells you whether a
  frame is queued, and `h.traceFrame()` lists the steps of the next frame in
  order.
- **Probes are the only place tests reach into private state.** They all go
  through `SceneInternals` in `createTestScene.ts`. When a refactor moves a
  field, update that interface and the probe, not the tests.
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

## The seams

`MapScene3DOptions` takes two seams; production passes neither, so the
defaults are unchanged:

- `createRenderer`: the renderer factory (a `THREE.WebGLRenderer` by default).
- `now`: the clock the scene stamps tweens, cuts, throttles and the effect
  clock with (`performance.now` by default).

## What Node cannot pin

- Pixels. The stub renderer draws nothing; tests read the camera, the scene
  graph and the call order instead.
- GPU-side disposal. Dispose tests check that `renderer.dispose()` is called
  and that shared geometry, materials and BVHs are left alone. They cannot
  check what WebGL frees.
- Real pointer lock and context loss. Pointer lock is granted only when a
  test sets `document.grantPointerLock`.
- Slice timing of the floor-track build: `startFloorTrackBuild` is called
  without the scene's `now`, so its budget reads real `performance.now`. The
  result does not depend on it.

## Oddities

Behaviour these tests pin that looks like a bug. Nothing here is fixed; a
later car may fix one deliberately and update its test.

1. **An interactive scene's loop never goes idle.** `IDLE_MOBILE_MAP_INPUT.jump`
   is `false`, and `updateKeyboardCamera` (and `setMobileInput`) treat any
   value `!== 0` as active input. So the free-cam mover reports motion every
   frame and the scene renders at full frame rate forever (`renderOnDemand`).
   Side effects:
   - The mover rewrites the camera every frame, even while the Director has it.
   - `setMobileInput` never sees the stick go from idle to active, so the
     stick never calls `handleControlsStart`/`End`.
   - Both mouse buttons travel on every frame from the press, while a key
     press restarts the travel clock and loses its first frame (59 of 60
     frames move).

   `h.neutraliseIdleMobileInput()` works around it so the rest of
   render-on-demand can be pinned.
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
