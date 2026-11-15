/**
 * The free rig (chronicle-1987): the user's free cam, walk mode with a hidden
 * character (chronicle-1514). Mouse look, the free-cam mover (keys, both
 * buttons, the mobile pad and stick, from the InputFrame) and its placement
 * about the pivot, plus OrbitControls, kept inside as the adapter for touch
 * gestures, the middle-drag pan and the shared pivot (`controls.target`).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraRig } from "./cameraRig";
import {
  FREE_CAM_MAX_PITCH_RADIANS,
  FREE_CAM_MIN_DISTANCE_SCENE_UNITS,
  FREE_CAM_TRAVEL_DISTANCES_PER_S,
  MOBILE_ORBIT_DAMPING,
  ORBIT_PAN_SPEED,
  ORBIT_ROTATE_SPEED,
  ORBIT_ZOOM_SPEED,
  TILES_MAX_DISTANCE_SCENE_UNITS,
  TILES_MAX_POLAR_RADIANS,
} from "./controlProfile";
import type { InputFrame } from "./inputFrame";
import { cameraAngles, cameraOffset, clockStepSeconds, freeCamTravelSpeed, lookDrag, planarStep, stickPitch, turnYaw } from "./mapControls";

export interface FreeRigHost {
  camera: THREE.PerspectiveCamera;
  /** Where OrbitControls listens (the canvas). */
  element: HTMLElement;
  /** Not interactive (a capture scene): OrbitControls stays off. */
  capture: boolean;
  /** Scratch the placement and readback write (shared with the Director's maths, as before). */
  scratch: THREE.Vector3;
  /** The floor below the pivot at (x, z), before its lift. */
  pivotFloor(x: number, z: number): number;
  /** The distance the user chose, while a wall holds the camera closer (the collision pass's); null when none. */
  wantDistance(): number | null;
  requestRender(): void;
}

export class FreeRig implements CameraRig {
  readonly owner = "free";
  readonly controls: OrbitControls;
  // The pivot (controls.target) rides this far (scene units) above the floor
  // below it: Space/Z fly it up and down.
  pivotLift = 0;
  private keyMoveLastMs = 0;
  private readonly host: FreeRigHost;

  constructor(host: FreeRigHost) {
    this.host = host;
    this.controls = new OrbitControls(host.camera, host.element);
    this.controls.maxPolarAngle = TILES_MAX_POLAR_RADIANS;
    this.controls.minDistance = FREE_CAM_MIN_DISTANCE_SCENE_UNITS;
    this.controls.maxDistance = TILES_MAX_DISTANCE_SCENE_UNITS;
    // The free cam's left/right drags, keys and wheel are our own, walk
    // mode's (chronicle-1514); OrbitControls keeps touch and the middle-drag
    // pan. No inertia, except on the mobile layout (setMobileInput).
    this.controls.enableDamping = false;
    this.controls.dampingFactor = MOBILE_ORBIT_DAMPING;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
    this.controls.rotateSpeed = ORBIT_ROTATE_SPEED;
    this.controls.zoomSpeed = ORBIT_ZOOM_SPEED;
    this.controls.panSpeed = ORBIT_PAN_SPEED;
    if (host.capture) {
      this.controls.enabled = false;
      this.controls.enableDamping = false;
    }
  }

  /** Whether the free-cam mover moved the camera on its last frame. */
  active(): boolean {
    return this.keyMoveLastMs !== 0;
  }

  /** The next active frame starts the mover's clock again (a first-frame step). */
  restartClock() {
    this.keyMoveLastMs = 0;
  }

  // The free cam's yaw and pitch around its pivot, as walk mode's
  // camYaw/camPitch around the head; the distance stays.
  freeCamAngles(): { yaw: number; pitch: number; distance: number } {
    return cameraAngles(this.host.scratch.copy(this.host.camera.position).sub(this.controls.target));
  }

  // Places the free cam at yaw/pitch/distance from its pivot, walk mode's way,
  // within the mode's tilt limit.
  placeFreeCam(yaw: number, pitch: number, distance: number) {
    const clamped = Math.max(this.freeCamMinPitch(), Math.min(FREE_CAM_MAX_PITCH_RADIANS, pitch));
    const offset = cameraOffset(yaw, clamped, distance);
    this.host.camera.position.copy(this.controls.target).add(this.host.scratch.set(offset.x, offset.y, offset.z));
    this.controls.update();
  }

  // The lowest the free cam may look from: OrbitControls' polar limit (on the
  // flat artwork the camera stays above the horizon so token faces show).
  freeCamMinPitch(): number {
    return Math.PI / 2 - this.controls.maxPolarAngle;
  }

  // A mouse-look drag of (dx, dy) pixels on the free cam.
  lookFreeCam(dx: number, dy: number) {
    if (!dx && !dy) return;
    const { yaw, pitch, distance } = this.freeCamAngles();
    const look = lookDrag(yaw, pitch, dx, dy, this.freeCamMinPitch(), FREE_CAM_MAX_PITCH_RADIANS);
    this.placeFreeCam(look.yaw, look.pitch, distance);
    this.host.requestRender();
  }

  // Moves the free cam for held keys, both mouse buttons or the mobile
  // controls, walk mode's way with a hidden character: W/S travel along the
  // camera's facing, A/D turn (strafe while right-dragging), Space/Z fly the
  // pivot up and down, with no gravity. True while any of them is active.
  // Walking, the character has the camera and the mover rests.
  update(now: number, input: InputFrame, walking: boolean): boolean {
    if (walking || !input.active) {
      this.keyMoveLastMs = 0;
      return false;
    }
    // The first active frame has no previous one to measure from: it steps one nominal frame.
    const dt = clockStepSeconds(now, this.keyMoveLastMs);
    this.keyMoveLastMs = now;
    if (dt <= 0) return true;
    const target = this.controls.target;
    const angles = this.freeCamAngles();
    const distance = angles.distance;
    let { yaw, pitch } = angles;

    if (input.turn) yaw = turnYaw(yaw, input.turn, dt);
    // Stick up raises the camera, as walk mode's camPitch does.
    if (input.pitch) pitch = stickPitch(pitch, input.pitch, dt);

    // Travel scales with the zoom the user chose (not a wall's pull-in).
    const speed = freeCamTravelSpeed(this.host.wantDistance() ?? distance, FREE_CAM_TRAVEL_DISTANCES_PER_S, input.fast);
    const step = planarStep(yaw, input.forward, input.strafe, speed * dt);
    target.x += step.x;
    target.z += step.z;
    if (input.vertical) this.pivotLift = Math.max(0, this.pivotLift + input.vertical * speed * dt);
    // The pivot rides the floor below it, like walk mode's feet, plus the lift.
    target.y = this.host.pivotFloor(target.x, target.z) + this.pivotLift;

    this.placeFreeCam(yaw, pitch, distance);
    return true;
  }
}
