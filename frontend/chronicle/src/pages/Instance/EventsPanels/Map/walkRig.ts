/**
 * The walk rig (chronicle-1987): walk mode's camera, the WoW baseline
 * (chronicle-1179). It trails behind the character as it moves and settles
 * behind it after a turn, looks with the mouse and pitches with the stick,
 * zooms with the wheel down to first person, and sits behind the head with
 * walls pulling it in. The character itself (movement, jumping, the floor,
 * the avatar) stays with MapScene3D's updateWalk, which calls these at the
 * same points of its frame as before.
 */
import type * as THREE from "three";
import type { CameraRig } from "./cameraRig";
import {
  WALK_CAMERA_FOLLOW_RATE_PER_S,
  WALK_CAMERA_TURN_FOLLOW_RATE_PER_S,
  WALK_COLLISION_PADDING_YARDS,
  WALK_EYE_YARDS,
  WALK_FIRST_PERSON_EXIT_YARDS,
  WALK_FIRST_PERSON_YARDS,
  WALK_MAX_DISTANCE_YARDS,
  WALK_PITCH_LIMIT_RADIANS,
} from "./controlProfile";
import type { InputFrame } from "./inputFrame";
import { cameraOffset, easeAngleToward, lookDrag, shouldFollowWalkCamera, stickPitch, walkCameraSettling, wheelZoomDistance } from "./mapControls";

/** The walk state the camera reads and writes (MapScene3D's WalkState). */
export interface WalkCameraState {
  /** The character's facing (read: the camera trails it; written by a steering look). */
  yaw: number;
  camYaw: number;
  /** The camera is still easing behind the character after a turn (walkCameraSettling). */
  camSettling: boolean;
  /** Camera elevation above the head, radians. */
  camPitch: number;
  /** Camera distance from the head, yards; 0 is first person. */
  camDistance: number;
  /** The distance the camera actually sits at, yards: `camDistance`, or closer while a wall is in the way. */
  camShown: number;
}

export interface WalkRigHost {
  camera: THREE.PerspectiveCamera;
  controls(): { readonly target: THREE.Vector3 };
  /** Scratch for the head and the camera direction (owned by the scene, as before). */
  head: THREE.Vector3;
  direction: THREE.Vector3;
  /** The collision pass for a camera `want` away from `from` along `direction` (CameraCollision.cast). */
  collideCamera(from: THREE.Vector3, direction: THREE.Vector3, shown: number, want: number, padding: number, min: number, dt: number): { distance: number; easing: boolean };
  walking(): boolean;
}

export class WalkRig implements CameraRig {
  readonly owner = "walk";
  private readonly host: WalkRigHost;

  constructor(host: WalkRigHost) {
    this.host = host;
  }

  active(): boolean {
    return this.host.walking();
  }

  /**
   * The camera's yaw and pitch this frame. Any planar movement brings a
   * free-look camera back behind the character. Turning (keys or the look
   * stick) moves the target yaw first, so the camera trails the turn, and
   * keeps settling at the turn rate once the turn stops.
   */
  trail(walk: WalkCameraState, input: InputFrame, dt: number) {
    const { turn, strafe, forward } = input;
    walk.camSettling = walkCameraSettling(walk.camSettling, turn, input.dragging, walk.camYaw, walk.yaw);
    if (shouldFollowWalkCamera(forward, strafe, turn, input.dragging, walk.camSettling)) {
      const followRate = turn || walk.camSettling ? WALK_CAMERA_TURN_FOLLOW_RATE_PER_S : WALK_CAMERA_FOLLOW_RATE_PER_S;
      walk.camYaw = easeAngleToward(walk.camYaw, walk.yaw, followRate, dt);
    }
    if (input.pitch) {
      walk.camPitch = Math.max(-WALK_PITCH_LIMIT_RADIANS, Math.min(WALK_PITCH_LIMIT_RADIANS, stickPitch(walk.camPitch, input.pitch, dt)));
    }
  }

  /** A mouse-look drag of (dx, dy) pixels; a right-drag (`steering`) turns the character to face the view too. */
  look(walk: WalkCameraState, dx: number, dy: number, steering: boolean) {
    const look = lookDrag(walk.camYaw, walk.camPitch, dx, dy, -WALK_PITCH_LIMIT_RADIANS, WALK_PITCH_LIMIT_RADIANS);
    walk.camYaw = look.yaw;
    walk.camPitch = look.pitch;
    if (steering) walk.yaw = walk.camYaw;
  }

  /** One wheel step: in toward the head, snapping to first person; the first step out of it lands just behind. */
  zoom(walk: WalkCameraState, deltaY: number) {
    const zoomingIn = deltaY < 0;
    if (walk.camDistance === 0 && !zoomingIn) {
      walk.camDistance = WALK_FIRST_PERSON_EXIT_YARDS;
    } else {
      const next = wheelZoomDistance(walk.camDistance, deltaY, 0, WALK_MAX_DISTANCE_YARDS);
      walk.camDistance = zoomingIn && next <= WALK_FIRST_PERSON_YARDS ? 0 : next;
    }
  }

  /**
   * Puts the camera behind the head of a character standing at `feet`
   * (`scale` scene units per yard), walls pulling it in; returns whether it
   * is in first person (the body then hides).
   */
  place(walk: WalkCameraState, feet: THREE.Vector3, scale: number, dt: number): boolean {
    const { camera } = this.host;
    const head = this.host.head.set(feet.x, feet.y + WALK_EYE_YARDS * scale, feet.z);
    // The camera sits as the free cam's does around its pivot (cameraOffset).
    const direction = cameraOffset(walk.camYaw, walk.camPitch, 1);
    // A wall between the head and the camera pulls the camera in front of it,
    // down to first person, so the character stays in view (chronicle-1513).
    const collision = this.host.collideCamera(
      head,
      this.host.direction.set(direction.x, direction.y, direction.z),
      walk.camShown * scale,
      walk.camDistance * scale,
      WALK_COLLISION_PADDING_YARDS * scale,
      0,
      dt,
    );
    walk.camShown = collision.distance / scale;
    const firstPerson = walk.camShown <= WALK_FIRST_PERSON_YARDS;
    if (firstPerson) {
      camera.position.copy(head);
      camera.lookAt(head.x - direction.x, head.y - direction.y, head.z - direction.z);
    } else {
      const distance = walk.camShown * scale;
      camera.position.set(head.x + direction.x * distance, head.y + direction.y * distance, head.z + direction.z * distance);
      camera.lookAt(head);
    }
    this.host.controls().target.copy(head);
    return firstPerson;
  }
}
