/**
 * The camera's one collision and floor-clamp pass (chronicle-1987): every rig's
 * camera is kept out of the cave here, each by its own policy, exactly as
 * before the rigs were split out:
 * - walk: WalkRig.place casts from the head (`cast`): a wall pulls the camera
 *   in at once, down to first person, and it eases back out at the return
 *   rate. The orbit pass is off while walking.
 * - director: the orbit pass only measures. It writes what the ray allows
 *   into the Director rig, which eases its camera in from it on the next
 *   frame (the deliberate one-frame lag), so a cave wall is not a one-frame
 *   pull-in.
 * - free, and whatever else the Director does not drive (scripted poses,
 *   tweens): the orbit pass pulls the camera in at once and eases it back out
 *   at the return rate to the distance last chosen.
 * MapScene3D.constrainCamera runs the orbit pass after the pan and pivot-floor
 * limits (and twice for an applied pose, as before); the floor clamp may still
 * be undone by the collision pull-in that follows it.
 */
import * as THREE from "three";
import { COLLISION_RETURN_RATE_PER_S, FREE_CAM_COLLISION_PADDING_SCENE_UNITS } from "./controlProfile";
import type { DungeonWorld } from "./dungeonWorld";
import { directorPullIn } from "./followCamera";
import { cameraCollisionDistance, frameStepSeconds } from "./mapControls";
import { MESH_PLAYER_HEIGHT_YARDS } from "./sceneConstants";

// The camera stays at least this far (scene units) above the floor beneath it.
const MESH_CAMERA_CLEARANCE = 0.3;

/** The Director's side of the orbit pass: the distance it wants, and what the ray allows (DirectorRig). */
export interface DirectorCollision {
  readonly want: number | null;
  allowed: number | null;
}

export interface CameraCollisionHost {
  camera: THREE.PerspectiveCamera;
  controls(): { readonly target: THREE.Vector3; readonly minDistance: number };
  world: Pick<DungeonWorld, "dungeonMesh" | "meshHitDistance" | "castFloor">;
}

export class CameraCollision {
  /** Scratch for a cast's direction (the walk rig fills it too). */
  readonly direction = new THREE.Vector3();
  /** The orbit distance the user wants (the camera may sit closer while a wall is in the way). */
  wantDistance: number | null = null;
  // The orbit distance the last pass left.
  private shownDistance: number | null = null;
  private lastMs = 0;
  private readonly eye = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly host: CameraCollisionHost;

  constructor(host: CameraCollisionHost) {
    this.host = host;
  }

  /** Off the mesh or walking: the orbit pass forgets its distances. */
  reset() {
    this.wantDistance = this.shownDistance = null;
  }

  /** The step (s) since the last frame the orbit pass eased in, and marks this one. */
  step(now: number): number {
    const dt = frameStepSeconds(now, this.lastMs);
    this.lastMs = now;
    return dt;
  }

  /** Nothing is easing out or coasting: the next step is a first-frame step. */
  rest() {
    this.lastMs = 0;
  }

  /**
   * Only the floor below the camera lifts it: the highest surface over its
   * spot may be a wall top, a ledge or a roof, and lifting the camera onto
   * that tips the view straight down. Walls between the camera and the
   * target are the orbit pass's job. Returns whether it moved the camera.
   */
  clampAboveFloor(position: THREE.Vector3): boolean {
    const below = this.host.world.castFloor(position.x, position.z, position.y + MESH_CAMERA_CLEARANCE);
    if (below !== null && position.y < below + MESH_CAMERA_CLEARANCE) {
      position.y = below + MESH_CAMERA_CLEARANCE;
      return true;
    }
    return false;
  }

  /** The pass has run: the distance it left the camera at. */
  shown(distance: number) {
    this.shownDistance = distance;
  }

  // Keeps the cave from standing between the orbit target and the camera: a
  // wall pulls the camera in along its line of sight, and once clear it eases
  // back out to the distance the user (or the Director) chose. `arrived` is
  // the distance before this constrain pass: when it differs from the one the
  // last pass left, something else moved the camera (a zoom, a new shot) and
  // that becomes the new choice. `director` is the Director while it drives
  // the camera. True while it is still easing out.
  orbit(dt: number, arrived: number, director: DirectorCollision | null): boolean {
    const { target, minDistance } = this.host.controls();
    const { position } = this.host.camera;
    const shown = position.distanceTo(target);
    const mesh = this.host.world.dungeonMesh;
    if (!mesh || shown <= 1e-6) return false;
    // From the fight's height, as clearShot does: the target sits on the
    // floor, which a ray from it would graze at once.
    const from = this.from.copy(target);
    from.y += MESH_PLAYER_HEIGHT_YARDS * mesh.scale;
    const direction = this.direction.copy(position).sub(target).divideScalar(shown);
    // The Director eases its own camera in from a wall (DirectorRig.update reads
    // what this ray allows), so a cave wall is not a one-frame pull-in.
    if (director && director.want !== null) {
      const want = director.want;
      const hit = want > 0 ? this.host.world.meshHitDistance(from, this.eye.copy(direction).multiplyScalar(want).add(from)) : null;
      director.allowed = directorPullIn(want, hit, FREE_CAM_COLLISION_PADDING_SCENE_UNITS, minDistance);
      this.wantDistance = shown;
      return false;
    }
    const last = this.shownDistance;
    if (last === null || this.wantDistance === null || Math.abs(arrived - last) > 1e-4 * Math.max(1, arrived)) this.wantDistance = arrived;
    const want = this.wantDistance;
    const { distance: next, easing } = this.cast(from, direction, shown, want, FREE_CAM_COLLISION_PADDING_SCENE_UNITS, Math.min(want, minDistance), dt);
    if (next !== shown) position.sub(target).multiplyScalar(next / shown).add(target);
    return easing;
  }

  // Camera collision for both modes (chronicle-1513): how far out from
  // `from` along `direction` (a unit vector) the camera may sit this frame,
  // having been `shown` away and wanting to be `want` away (scene units).
  // `easing` is true while it is still easing back out from a wall that is gone.
  cast(from: THREE.Vector3, direction: THREE.Vector3, shown: number, want: number, padding: number, min: number, dt: number): { distance: number; easing: boolean } {
    const hit = want > 0 ? this.host.world.meshHitDistance(from, this.eye.copy(direction).multiplyScalar(want).add(from)) : null;
    const distance = cameraCollisionDistance(shown, want, hit, padding, min, COLLISION_RETURN_RATE_PER_S, dt);
    return { distance, easing: distance < want && (hit === null || hit - padding > distance) };
  }
}
