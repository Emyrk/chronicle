/**
 * The Follow button and its way back, read from the 3D scene's camera owner
 * report (chronicle-2020). The scene says who has the camera
 * (MapScene3D.setOnCameraOwnerChange); this says what the host shows:
 * - Follow is lit only while the follow camera has the camera ("director":
 *   the group or a followed unit), never just because the framing is the
 *   default one;
 * - "Back to the action" shows once the viewer has taken the camera from the
 *   follow camera (a drag, the wheel, a key, the pad or stick, Top-down, a
 *   double-click, walk mode) and until it is handed back;
 * - a take stops the host's own re-framing (the whole run's follow grid), as
 *   a pan or zoom always has, so nothing hands the camera back on its own
 *   (releasedFraming).
 * Without a 3D scene (the 2D map) there is no report: the framing decides,
 * as before.
 */
import type { CameraOwner } from "./cameraArbiter";
import type { MapFraming } from "./mapModel";

/** The scene's last camera report (MapScene3D.setOnCameraOwnerChange); owner null: no 3D scene. */
export interface CameraHandoff {
  owner: CameraOwner | null;
  /** The viewer took the camera from the follow camera and has not handed it back. */
  taken: boolean;
}

export const INITIAL_CAMERA_HANDOFF: CameraHandoff = { owner: null, taken: false };

/** The handoff after a report (the same object when nothing changed, so React keeps the render). */
export function reportCameraOwner(handoff: CameraHandoff, owner: CameraOwner | null, taken: boolean): CameraHandoff {
  if (owner === null) return INITIAL_CAMERA_HANDOFF;
  return handoff.owner === owner && handoff.taken === taken ? handoff : { owner, taken };
}

/**
 * The Follow button and the way back. `canFollow`: the host offers Follow
 * (a whole run, or the loaded mesh); `cinematic`: the framing asks for the
 * follow camera.
 */
export function followControls(canFollow: boolean, cinematic: boolean, handoff: CameraHandoff): { following: boolean; wayBack: boolean } {
  if (handoff.owner === null) return { following: canFollow && cinematic, wayBack: false };
  return {
    following: canFollow && cinematic && handoff.owner === "director",
    wayBack: canFollow && handoff.taken && handoff.owner !== "director",
  };
}

/**
 * The framing once the viewer has taken the camera: manual, as after a pan or
 * zoom, so the default framing moving on (the whole run's follow grid) no
 * longer bumps the view and hands the camera back. The revision and viewport
 * stay, so nothing re-frames (the views apply a view only on a new key).
 */
export function releasedFraming(framing: MapFraming): MapFraming {
  return framing.manual ? framing : { ...framing, manual: true };
}

/** The way back's shortcut (KeyboardEvent.code), pointer over the map like the other map keys. */
export const BACK_TO_ACTION_KEY = "KeyR";

/** Whether `event` asks for the way back: R alone, not repeated, not typed into a field, not already handled. */
export function isBackToActionKey(event: Pick<KeyboardEvent, "code" | "repeat" | "defaultPrevented" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "target">): boolean {
  if (event.code !== BACK_TO_ACTION_KEY || event.repeat || event.defaultPrevented) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const target = event.target as { isContentEditable?: boolean; tagName?: string } | null;
  return !(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? "")));
}
