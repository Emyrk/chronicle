import { describe, expect, it } from "vitest";
import type { CameraOwner } from "./cameraArbiter";
import { followActions, followControls, followFraming, INITIAL_CAMERA_HANDOFF, INITIAL_FOLLOW_STATE, isBackToActionKey, onCameraReport, releasedFraming, reportCameraOwner, withFraming, type CameraHandoff, type FollowState } from "./followHandoff";
import { INITIAL_MAP_FRAMING, reconcileMapFraming, type MapFraming, type MapViewport } from "./mapModel";
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
  const camera = { mode: "director" as const };
  /** The host's state after a render: the framing reconciled with the follow grid at `centerX`, as useReplayPlayer does. */
  const render = (state: FollowState, centerX: number, selection = "run"): FollowState =>
    withFraming(state, (framing) => reconcileMapFraming(framing, selection, step(centerX)));

  it("the scene's report of a take releases the framing: follow-grid steps then neither bump the view nor ask for the follow camera", () => {
    let state = render(INITIAL_FOLLOW_STATE, 0.3);
    state = onCameraReport(state, "director", false);
    // Following: each grid step bumps the view (a viewport request hands the camera to the follow camera).
    const following = render(state, 0.35);
    expect(following.framing.revision).toBe(state.framing.revision + 1);
    state = following;
    // The viewer turns with A/D (no viewport report): the scene reports the take.
    state = onCameraReport(state, "free", true);
    expect(state.framing.manual).toBe(true);
    expect(cameraModeFor(camera, state.framing).cinematic).toBe(false);
    const revision = state.framing.revision;
    for (const centerX of [0.4, 0.45, 0.5, 0.55]) {
      state = render(state, centerX);
      expect(state.framing.revision).toBe(revision);
      expect(cameraModeFor(camera, state.framing).cinematic).toBe(false);
    }
    // Later reports of the same take (walk mode ending on the free cam) change nothing.
    expect(onCameraReport(state, "free", true)).toBe(state);
  });

  it("reports that are not a take leave the framing as it is", () => {
    const state = render(INITIAL_FOLLOW_STATE, 0.3);
    for (const owner of ["director", "free", "scripted", "tween"] as const) {
      expect(onCameraReport(state, owner, false).framing).toBe(state.framing);
    }
    expect(onCameraReport(state, null, false).framing).toBe(state.framing);
  });

  it("picking another encounter after a take re-frames and asks for the follow camera again", () => {
    let state = onCameraReport(render(INITIAL_FOLLOW_STATE, 0.3), "free", true);
    const revision = state.framing.revision;
    state = render(state, 0.6, "another encounter");
    expect(state.framing.revision).toBe(revision + 1);
    expect(cameraModeFor(camera, state.framing).cinematic).toBe(true);
  });

  it("Follow: the default framing again, as a new view that asks for the follow camera", () => {
    const released = releasedFraming(reconcileMapFraming(INITIAL_MAP_FRAMING, "run", step(0.3)));
    const back = followFraming(released);
    expect(back.revision).toBe(released.revision + 1);
    expect(cameraModeFor(camera, back).cinematic).toBe(true);
    expect(releasedFraming(released)).toBe(released);
  });
});

describe("the explicit ways back to the fight", () => {
  /** followActions with recording deps: the calls in order, and the framing they leave. */
  function setup(state: { canFollow?: boolean; following?: boolean } = {}) {
    const calls: string[] = [];
    let framing: MapFraming = releasedFraming(reconcileMapFraming(INITIAL_MAP_FRAMING, "run", { centerX: 0.3, centerY: 0.5, zoom: 3 }));
    const actions = followActions({
      canFollow: state.canFollow ?? true,
      following: state.following ?? false,
      leaveWalk: () => calls.push("leaveWalk"),
      setFraming: (update) => {
        framing = update(framing);
        calls.push(`follow r${framing.revision}`);
      },
      cut: () => calls.push("cut"),
    });
    return { actions, calls, revision: framing.revision };
  }

  it("Follow and Back to the action leave walk mode first, then ask for the follow camera (a view request while walking would move the character)", () => {
    const { actions, calls, revision } = setup({ following: true });
    actions.follow();
    expect(calls).toEqual(["leaveWalk", `follow r${revision + 1}`]);
  });

  it("a jump chip after a take hands the camera back, then cuts (MapView3D: Director, view, then cut)", () => {
    const { actions, calls, revision } = setup();
    actions.jump();
    expect(calls).toEqual(["leaveWalk", `follow r${revision + 1}`, "cut"]);
  });

  it("a jump chip while following only cuts (a followed unit stays followed)", () => {
    const { actions, calls } = setup({ following: true });
    actions.jump();
    expect(calls).toEqual(["cut"]);
  });

  it("Replay from here after a take hands the camera back; while following, or where Follow is not offered, it leaves the camera alone", () => {
    const taken = setup();
    taken.actions.resume();
    expect(taken.calls).toEqual(["leaveWalk", `follow r${taken.revision + 1}`]);
    for (const state of [{ following: true }, { canFollow: false }]) {
      const { actions, calls } = setup(state);
      actions.resume();
      expect(calls).toEqual([]);
    }
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
