import { describe, expect, it } from "vitest";
import type { CameraOwner } from "./cameraArbiter";
import { followControls, INITIAL_CAMERA_HANDOFF, isBackToActionKey, releasedFraming, reportCameraOwner, type CameraHandoff } from "./followHandoff";
import { INITIAL_MAP_FRAMING, reconcileMapFraming, type MapViewport } from "./mapModel";
import { cameraModeFor } from "./replayPlayerModel";

/** The handoff after the scene's reports, each an owner and whether it is taken. */
function after(reports: [CameraOwner | null, boolean][]): CameraHandoff {
  return reports.reduce<CameraHandoff>((handoff, [owner, taken]) => reportCameraOwner(handoff, owner, taken), INITIAL_CAMERA_HANDOFF);
}

describe("the Follow button and the way back", () => {
  it("on first load: Follow lit once the follow camera has the camera; no way back", () => {
    // Before the scene reports (and on the 2D map) the framing decides, as before.
    expect(followControls(true, true, INITIAL_CAMERA_HANDOFF)).toEqual({ following: true, wayBack: false });
    // The scene starts on its free cam until the host turns the follow camera on: not a take.
    expect(followControls(true, true, after([["free", false]]))).toEqual({ following: false, wayBack: false });
    expect(followControls(true, true, after([["free", false], ["director", false]]))).toEqual({ following: true, wayBack: false });
  });

  it("Follow is lit if and only if the scene reports the follow camera as owner", () => {
    for (const owner of ["director", "free", "walk", "tween", "scripted"] as const) {
      expect(followControls(true, true, after([["director", false], [owner, owner !== "director"]])).following).toBe(owner === "director");
    }
    // Only where Follow is offered, and while the framing asks for the follow camera.
    expect(followControls(false, true, after([["director", false]])).following).toBe(false);
    expect(followControls(true, false, after([["director", false]])).following).toBe(false);
  });

  it("the way back shows if and only if the viewer owns the camera and a follow camera exists to return to", () => {
    for (const owner of ["free", "walk", "tween"] as const) {
      const taken = after([["director", false], [owner, true]]);
      expect(followControls(true, true, taken)).toEqual({ following: false, wayBack: true });
      // It stays once the framing is released (the follow camera asked for no more) and walk mode ends on the free cam.
      expect(followControls(true, false, reportCameraOwner(taken, "free", true))).toEqual({ following: false, wayBack: true });
      // Handing back hides it.
      expect(followControls(true, true, reportCameraOwner(taken, "director", false))).toEqual({ following: true, wayBack: false });
    }
    // No follow camera to go back to: Follow is not offered here (one encounter on the tiles).
    expect(followControls(false, false, after([["director", false], ["free", true]])).wayBack).toBe(false);
    // Not taken: a pinned Fit or Reset, or the host's own pose.
    expect(followControls(true, false, after([["director", false], ["free", false]])).wayBack).toBe(false);
    expect(followControls(true, true, after([["director", false], ["scripted", false]])).wayBack).toBe(false);
  });

  it("the scene going away forgets its report", () => {
    expect(after([["director", false], ["free", true], [null, false]])).toBe(INITIAL_CAMERA_HANDOFF);
  });

  it("an unchanged report keeps the same object (no re-render)", () => {
    const taken = after([["free", true]]);
    expect(reportCameraOwner(taken, "free", true)).toBe(taken);
    expect(reportCameraOwner(taken, "free", false)).not.toBe(taken);
  });
});

describe("a whole run, the viewer owning the camera", () => {
  const step = (centerX: number): MapViewport => ({ centerX, centerY: 0.5, zoom: 3 });

  it("follow-grid steps no longer bump the view the scene acts on, nor ask for the follow camera; Follow does", () => {
    const camera = { mode: "director" as const };
    let framing = reconcileMapFraming(INITIAL_MAP_FRAMING, "run", step(0.3));
    // Following: each grid step bumps the view (a viewport request hands the camera to the follow camera).
    const following = reconcileMapFraming(framing, "run", step(0.35));
    expect(following.revision).toBe(framing.revision + 1);
    framing = following;
    // The viewer takes the camera: the framing is released (the view stays as it is).
    framing = releasedFraming(framing);
    const revision = framing.revision;
    expect(cameraModeFor(camera, framing).cinematic).toBe(false);
    for (const centerX of [0.4, 0.45, 0.5, 0.55]) {
      framing = reconcileMapFraming(framing, "run", step(centerX));
      expect(framing.revision).toBe(revision);
      expect(cameraModeFor(camera, framing).cinematic).toBe(false);
    }
    // Releasing again changes nothing.
    expect(releasedFraming(framing)).toBe(framing);
    // Follow (the way back does the same): the default framing again, a new view, the follow camera.
    const back = { ...framing, viewport: null, manual: false, revision: framing.revision + 1 };
    expect(cameraModeFor(camera, back).cinematic).toBe(true);
    expect(reconcileMapFraming(back, "run", step(0.6)).revision).toBe(back.revision + 1);
  });
});

describe("the way back's shortcut", () => {
  const key = (patch: Partial<Parameters<typeof isBackToActionKey>[0]> = {}) => isBackToActionKey({
    code: "KeyR", repeat: false, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, ...patch,
  });

  it("is R alone", () => {
    expect(key()).toBe(true);
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"] as const) expect(key({ [modifier]: true })).toBe(false);
    expect(key({ repeat: true })).toBe(false);
    expect(key({ defaultPrevented: true })).toBe(false);
  });

  it("collides with none of the map's, the page's or plan mode's keys", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space", "KeyZ", "KeyX", "KeyG", "KeyF", "KeyY", "Escape", "Delete", "ShiftLeft"]) {
      expect(key({ code })).toBe(false);
    }
  });

  it("is ignored while typing", () => {
    expect(key({ target: { tagName: "INPUT" } as unknown as EventTarget })).toBe(false);
    expect(key({ target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget })).toBe(false);
    expect(key({ target: { tagName: "CANVAS" } as unknown as EventTarget })).toBe(true);
  });
});
