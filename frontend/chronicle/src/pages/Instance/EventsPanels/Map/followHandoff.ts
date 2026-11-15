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
import { INITIAL_MAP_FRAMING, type MapFraming } from "./mapModel";

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

/** The framing and the scene's camera report, kept as one state so a report can release the framing in the same update. */
export interface FollowState {
  framing: MapFraming;
  handoff: CameraHandoff;
}

export const INITIAL_FOLLOW_STATE: FollowState = { framing: INITIAL_MAP_FRAMING, handoff: INITIAL_CAMERA_HANDOFF };

/** The state with its framing set (or updated), as setFraming does. */
export function withFraming(state: FollowState, update: MapFraming | ((framing: MapFraming) => MapFraming)): FollowState {
  const framing = typeof update === "function" ? update(state.framing) : update;
  return framing === state.framing ? state : { ...state, framing };
}

/**
 * A camera report from the scene: the handoff, and once the viewer has taken
 * the camera the framing released (releasedFraming), so the whole run's
 * follow grid stops handing it back on its own. A released framing also asks
 * for the follow camera no more, so a new encounter (or Follow) re-frames and
 * hands the camera back as a fresh choice.
 */
export function onCameraReport(state: FollowState, owner: CameraOwner | null, taken: boolean): FollowState {
  const handoff = reportCameraOwner(state.handoff, owner, taken);
  const framing = taken ? releasedFraming(state.framing) : state.framing;
  return handoff === state.handoff && framing === state.framing ? state : { framing, handoff };
}

/** Follow's framing: the default one again, as a new view (the view request hands the camera to the follow camera). */
export function followFraming(framing: MapFraming): MapFraming {
  return { ...framing, viewport: null, manual: false, revision: framing.revision + 1 };
}

/** What the host's camera actions need. */
export interface FollowActionDeps {
  /** Follow is offered here (a whole run, or the loaded mesh). */
  canFollow: boolean;
  /** The follow camera has the camera now. */
  following: boolean;
  /** Out of walk mode, if walking: a view request while walking moves the character instead of handing the camera back. */
  leaveWalk: () => void;
  setFraming: (update: (framing: MapFraming) => MapFraming) => void;
  /** Cut the follow camera straight to its next shot (a jump). */
  cut: () => void;
}

/**
 * The host's camera actions. Each explicit action the viewer takes to get
 * back to the fight hands the camera back:
 * - `follow`: the Follow button, and "Back to the action" (R): out of walk
 *   mode, then the default framing again;
 * - `jump`: a jump chip: back to the follow camera if the viewer has the
 *   camera, then the cut (MapView3D applies the Director, then the view, then
 *   the cut, so the cut lands on a live follow camera);
 * - `resume`: "Replay from here": back to the follow camera if the viewer has
 *   the camera. Where Follow is not offered, neither touches the camera.
 * Picking another encounter re-frames on its own (a new selection key).
 */
export function followActions(deps: FollowActionDeps) {
  const follow = () => {
    deps.leaveWalk();
    deps.setFraming(followFraming);
  };
  const resume = () => {
    if (deps.canFollow && !deps.following) follow();
  };
  return {
    follow,
    resume,
    jump: () => {
      resume();
      deps.cut();
    },
  };
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
