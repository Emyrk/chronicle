/**
 * Who owns the 3D replay's camera (chronicle-1987). Walk mode, the free cam,
 * the Director, the tweens (viewport framing, the double-click move) and
 * scripted poses (authored paths, capture) all write one camera; the arbiter
 * decides which of them has it, and every "the user took the camera" goes
 * through its one `take`.
 *
 * The owner is the first claimant in CAMERA_OWNER_PRIORITY:
 * - scripted: an applied camera pose holds the camera, until anything else
 *   takes it, starts a tween or hands it back;
 * - walk: walk mode is on;
 * - tween: a viewport tween or a double-click move is running;
 * - free: the user's free cam, whenever the Director does not hold the camera
 *   (or cannot: no Director, or the tiles show);
 * - director: the camera was handed to the Director, and it can run.
 *
 * Only one of scripted/free/director is ever held (the base owner); walk and
 * tween claim the camera while their rig is active and fall back to the base
 * when they end.
 */

export type CameraOwner = "scripted" | "walk" | "tween" | "free" | "director";

/** Highest first: the owner is the first of these that claims the camera. */
export const CAMERA_OWNER_PRIORITY: readonly CameraOwner[] = ["scripted", "walk", "tween", "free", "director"];

/** Why the camera is being taken; each takes away a different part of what was running. */
export type TakeReason = "gesture" | "walk" | "pose" | "top-down" | "double-click";

export interface TakeEffects {
  /** Stops a viewport tween in flight. */
  cancelViewTween: boolean;
  /** Stops a double-click move in flight. */
  cancelMove: boolean;
  /** Drops a followed unit (the Director's subject). */
  dropFollow: boolean;
}

/**
 * What each reason stops, as the five hand-written copies did before
 * chronicle-1987. Every take also releases the Director (it stops following
 * until a hand-back re-seeds it).
 * - gesture: a drag, a wheel step, a movement key, the mobile pad or stick,
 *   an OrbitControls touch or pan (handleControlsStart);
 * - walk: entering walk mode;
 * - pose: an applied camera pose (keeps a followed unit);
 * - top-down: the top-down reset (keeps a followed unit);
 * - double-click: a double-click on the floor, which then starts its own
 *   move (keeps a followed unit).
 */
export const TAKE_EFFECTS: Readonly<Record<TakeReason, TakeEffects>> = {
  gesture: { cancelViewTween: true, cancelMove: true, dropFollow: true },
  walk: { cancelViewTween: true, cancelMove: true, dropFollow: true },
  pose: { cancelViewTween: true, cancelMove: true, dropFollow: false },
  "top-down": { cancelViewTween: true, cancelMove: true, dropFollow: false },
  "double-click": { cancelViewTween: true, cancelMove: false, dropFollow: false },
};

/** What the arbiter needs from the rigs (MapScene3D wires these). */
export interface CameraArbiterClients {
  cancelViewTween(): void;
  cancelMove(): void;
  /** The Director stops following; the next hand-back re-seeds its springs. */
  stopDirector(): void;
  dropFollow(): void;
  walking(): boolean;
  tweening(): boolean;
  /** Whether the Director could run now (it is on, and the dungeon mesh shows). */
  directorAvailable(): boolean;
}

export class CameraArbiter {
  private base: "scripted" | "free" | "director" = "director";
  private reported: CameraOwner | null = null;
  private readonly clients: CameraArbiterClients;
  private onChange: (owner: CameraOwner) => void = () => {};

  constructor(clients: CameraArbiterClients) {
    this.clients = clients;
  }

  /** The current owner (see the file comment). */
  owner(): CameraOwner {
    if (this.base === "scripted" && !this.clients.walking() && !this.clients.tweening()) return "scripted";
    if (this.clients.walking()) return "walk";
    if (this.clients.tweening()) return "tween";
    if (this.base === "director" && this.clients.directorAvailable()) return "director";
    return "free";
  }

  /** Whether the camera is handed to the Director (it runs whenever it can and no move or walk has the camera). */
  get directorHeld(): boolean {
    return this.base === "director";
  }

  /**
   * Takes the camera from the Director (and from a tween in flight), for
   * `owner`: "scripted" holds the pose that was just applied; anything else
   * leaves the user's free cam (with walk mode or a double-click move on top
   * while they run).
   */
  take(owner: Exclude<CameraOwner, "director">, reason: TakeReason) {
    const effects = TAKE_EFFECTS[reason];
    if (effects.cancelViewTween) this.clients.cancelViewTween();
    if (effects.cancelMove) this.clients.cancelMove();
    this.base = owner === "scripted" ? "scripted" : "free";
    this.clients.stopDirector();
    if (effects.dropFollow) this.clients.dropFollow();
  }

  /**
   * Hands the camera back to the Director: Follow, a cut, a viewport request,
   * a replay jump, a double-click on a unit, the mesh arriving. Stops a
   * double-click move (a viewport tween in flight is left to finish).
   */
  handBack() {
    this.base = "director";
    this.clients.cancelMove();
  }

  /** A tween started: an applied pose no longer holds the camera once it ends. */
  tweenStarted() {
    if (this.base === "scripted") this.base = "free";
  }

  /** Called with the new owner whenever it changes (see sync). */
  setOnChange(callback: ((owner: CameraOwner) => void) | null) {
    this.onChange = callback ?? (() => {});
    this.reported = this.owner();
  }

  /**
   * Reports the owner if it changed since the last report. The scene calls
   * this once a change has settled (after a take and what follows it, a
   * hand-back, a rig starting or ending) and at the end of every frame, so a
   * take that starts a move reports the move, not a passing "free".
   */
  sync() {
    const owner = this.owner();
    if (owner === this.reported) return;
    this.reported = owner;
    this.onChange(owner);
  }
}
