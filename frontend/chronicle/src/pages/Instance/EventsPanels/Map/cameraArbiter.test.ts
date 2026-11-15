import { describe, expect, it, vi } from "vitest";
import { CAMERA_OWNER_PRIORITY, CameraArbiter, TAKE_EFFECTS, type CameraOwner, type TakeReason } from "./cameraArbiter";

function setup(state: { walking?: boolean; tweening?: boolean; available?: boolean } = {}) {
  const rig = { walking: false, tweening: false, available: true, ...state };
  const calls: string[] = [];
  const arbiter = new CameraArbiter({
    cancelViewTween: () => calls.push("cancelViewTween"),
    cancelMove: () => calls.push("cancelMove"),
    stopDirector: () => calls.push("stopDirector"),
    dropFollow: () => calls.push("dropFollow"),
    walking: () => rig.walking,
    tweening: () => rig.tweening,
    directorAvailable: () => rig.available,
  });
  return { arbiter, rig, calls };
}

describe("CameraArbiter: who owns the camera", () => {
  it("starts handed to the Director, which owns it only while it can run", () => {
    const { arbiter, rig } = setup({ available: false });
    expect(arbiter.directorHeld).toBe(true);
    expect(arbiter.owner()).toBe("free");
    rig.available = true;
    expect(arbiter.owner()).toBe("director");
  });

  it("resolves in priority order: scripted, walk, tween, free, director", () => {
    expect(CAMERA_OWNER_PRIORITY).toEqual(["scripted", "walk", "tween", "free", "director"]);
    const { arbiter, rig } = setup();
    rig.tweening = true;
    expect(arbiter.owner()).toBe("tween");
    rig.walking = true;
    expect(arbiter.owner()).toBe("walk");
    rig.walking = false;
    rig.tweening = false;
    arbiter.take("free", "gesture");
    expect(arbiter.owner()).toBe("free");
    arbiter.take("scripted", "pose");
    expect(arbiter.owner()).toBe("scripted");
  });

  it("walk and tween claim the camera while active and fall back to the base owner after", () => {
    const { arbiter, rig } = setup();
    arbiter.take("walk", "walk");
    rig.walking = true;
    expect(arbiter.owner()).toBe("walk");
    rig.walking = false;
    expect(arbiter.owner()).toBe("free");
    arbiter.handBack();
    rig.tweening = true;
    expect(arbiter.owner()).toBe("tween");
    rig.tweening = false;
    expect(arbiter.owner()).toBe("director");
  });

  it("a held scripted pose gives way to walk or a tween, and a tween drops it for good", () => {
    const { arbiter, rig } = setup();
    arbiter.take("scripted", "pose");
    rig.walking = true;
    expect(arbiter.owner()).toBe("walk");
    rig.walking = false;
    expect(arbiter.owner()).toBe("scripted");
    arbiter.tweenStarted();
    rig.tweening = true;
    expect(arbiter.owner()).toBe("tween");
    rig.tweening = false;
    expect(arbiter.owner()).toBe("free");
  });
});

describe("CameraArbiter: take", () => {
  it.each(Object.keys(TAKE_EFFECTS) as TakeReason[])("%s releases the Director and stops what its effects say", (reason) => {
    const { arbiter, calls } = setup();
    const owner: Exclude<CameraOwner, "director"> = reason === "pose" ? "scripted" : reason === "walk" ? "walk" : reason === "double-click" ? "tween" : "free";
    arbiter.take(owner, reason);
    const effects = TAKE_EFFECTS[reason];
    const expected = [
      ...(effects.cancelViewTween ? ["cancelViewTween"] : []),
      ...(effects.cancelMove ? ["cancelMove"] : []),
      "stopDirector",
      ...(effects.dropFollow ? ["dropFollow"] : []),
    ];
    expect(calls).toEqual(expected);
    expect(arbiter.directorHeld).toBe(false);
  });

  it("keeps the five old copies' differences: only gestures and walk mode drop a followed unit; a double-click starts its own move", () => {
    expect(TAKE_EFFECTS).toEqual({
      gesture: { cancelViewTween: true, cancelMove: true, dropFollow: true },
      walk: { cancelViewTween: true, cancelMove: true, dropFollow: true },
      pose: { cancelViewTween: true, cancelMove: true, dropFollow: false },
      "top-down": { cancelViewTween: true, cancelMove: true, dropFollow: false },
      "double-click": { cancelViewTween: true, cancelMove: false, dropFollow: false },
    });
  });
});

describe("CameraArbiter: handing back to the Director", () => {
  it("holds the camera for the Director again and stops a double-click move, leaving a viewport tween to finish", () => {
    const { arbiter, calls } = setup();
    arbiter.take("free", "gesture");
    calls.length = 0;
    arbiter.handBack();
    expect(arbiter.directorHeld).toBe(true);
    expect(arbiter.owner()).toBe("director");
    expect(calls).toEqual(["cancelMove"]);
  });
});

describe("CameraArbiter: reporting", () => {
  it("reports each settled change once, not every sync", () => {
    const { arbiter, rig } = setup();
    const onChange = vi.fn();
    arbiter.setOnChange(onChange);
    arbiter.sync();
    expect(onChange).not.toHaveBeenCalled();
    arbiter.take("free", "gesture");
    arbiter.sync();
    arbiter.sync();
    rig.tweening = true;
    arbiter.sync();
    rig.tweening = false;
    arbiter.handBack();
    arbiter.sync();
    expect(onChange.mock.calls.map(([owner]) => owner)).toEqual(["free", "tween", "director"]);
  });

  it("a take followed by a move reports the move only, when synced after both", () => {
    const { arbiter, rig } = setup();
    const onChange = vi.fn();
    arbiter.setOnChange(onChange);
    arbiter.take("tween", "double-click");
    rig.tweening = true;
    arbiter.sync();
    expect(onChange.mock.calls.map(([owner]) => owner)).toEqual(["tween"]);
  });
});
