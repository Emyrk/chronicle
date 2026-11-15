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
 * - director: the follow camera has the camera: it was handed back (never
 *   taken since), and the host has the follow camera on (setDirector). On the
 *   mesh that is the Director, for the group or a followed unit; on the tiles
 *   (no mesh yet, a failed load, between floors) it is the host's follow
 *   framing, its viewport requests. A viewport tween that runs meanwhile is
 *   part of following (on the mesh the Director writes after it, chronicle-2020);
 * - tween: a double-click move, or a viewport tween with no follow camera;
 * - free: the user's free cam: the viewer took the camera, or there is no
 *   follow camera.
 *
 * Only one of scripted/free/director is ever held (the base owner); walk and
 * tween claim the camera while their rig is active and fall back to the base
 * when they end. With the follow camera on, any owner but "director" (and
 * "scripted", the host's own pose) is the viewer's camera.
 */

export type CameraOwner = "scripted" | "walk" | "tween" | "free" | "director";

/** Highest first: the owner is the first of these that claims the camera. */
export const CAMERA_OWNER_PRIORITY: readonly CameraOwner[] = ["scripted", "walk", "director", "tween", "free"];

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
  /** Whether the host has the follow camera on (setDirector): the Director on the mesh, its follow framing on the tiles. */
  followCamera(): boolean;
}

export class CameraArbiter {
  private base: "scripted" | "free" | "director" = "director";
  private reported: CameraOwner | null = null;
  private readonly clients: CameraArbiterClients;
  private onChange: (owner: CameraOwner) => void = () => {};
  // Reporting now; a sync from inside the callback is run after it returns.
  private reporting = false;
  private resync = false;

  constructor(clients: CameraArbiterClients) {
    this.clients = clients;
  }

  /** The current owner (see the file comment). */
  owner(): CameraOwner {
    if (this.base === "scripted" && !this.clients.walking() && !this.clients.tweening()) return "scripted";
    if (this.clients.walking()) return "walk";
    if (this.base === "director" && this.clients.followCamera()) return "director";
    if (this.clients.tweening()) return "tween";
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

  /** Called with the owner now (null: nothing), and again whenever it changes (see sync). */
  setOnChange(callback: ((owner: CameraOwner) => void) | null) {
    this.onChange = callback ?? (() => {});
    this.reported = null;
    this.sync();
  }

  /**
   * Reports the owner if it changed since the last report. The scene calls
   * this once a change has settled (after a take and what follows it, a
   * hand-back, a rig starting or ending) and at the end of every frame, so a
   * take that starts a move reports the move, not a passing "free".
   */
  //
  // The callback may act on the scene (a host re-rendering and handing the
  // camera back): a sync from inside it does not recurse, it re-checks once
  // the callback returns, so reports stay in order. A host that kept flipping
  // the owner from its callback stops after a few rounds rather than looping.
  sync() {
    if (this.reporting) {
      this.resync = true;
      return;
    }
    this.reporting = true;
    try {
      for (let round = 0; round < 4; round++) {
        this.resync = false;
        const owner = this.owner();
        if (owner !== this.reported) {
          this.reported = owner;
          this.onChange(owner);
        }
        if (!this.resync) break;
      }
    } finally {
      this.reporting = false;
    }
  }
}
