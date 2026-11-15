/**
 * The tween rig (chronicle-1987): a viewport re-framing (setViewport with a
 * duration) and the double-click move, each easing the camera over its own
 * duration. It claims the camera while either runs.
 */
import * as THREE from "three";
import type { CameraRig } from "./cameraRig";
import { DOUBLE_CLICK_MS } from "./controlProfile";
import { interpolateViewport, type MapViewport } from "./mapModel";

/** A re-framing easing the camera from `from` to the scene's viewport, along `direction`. */
export interface ViewTween {
  from: MapViewport;
  direction: THREE.Vector3;
  start: number;
  duration: number;
}

/** A double-click easing the camera's pivot to the point (and distance) clicked. */
export interface MoveTween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromDistance: number;
  toDistance: number;
  direction: THREE.Vector3;
  start: number;
}

export interface TweenRigHost {
  camera: THREE.PerspectiveCamera;
  /** OrbitControls (created after the rigs): its target is the shared pivot. */
  controls(): { readonly target: THREE.Vector3; update(): boolean };
  /** The viewport a re-framing eases to. */
  viewport(): MapViewport;
  /** Puts the camera on `viewport` along `direction` (MapScene3D.placeCamera). */
  placeCamera(viewport: MapViewport, direction: THREE.Vector3): void;
  constrainCamera(): void;
  updateUnitScale(): void;
}

export class TweenRig implements CameraRig {
  readonly owner = "tween";
  view: ViewTween | null = null;
  move: MoveTween | null = null;
  private readonly host: TweenRigHost;

  constructor(host: TweenRigHost) {
    this.host = host;
  }

  active(): boolean {
    return this.view !== null || this.move !== null;
  }

  // Steps a running re-framing; returns whether it needs another frame.
  updateView(now: number): boolean {
    const animation = this.view;
    if (!animation) return false;
    const t = Math.min(1, Math.max(0, (now - animation.start) / animation.duration));
    this.host.placeCamera(interpolateViewport(animation.from, this.host.viewport(), 1 - (1 - t) ** 3), animation.direction.clone());
    if (t < 1) return true;
    this.view = null;
    return false;
  }

  // Steps a double-click move; returns whether it needs another frame.
  updateMove(now: number): boolean {
    const move = this.move;
    if (!move) return false;
    const t = Math.min(1, Math.max(0, (now - move.start) / DOUBLE_CLICK_MS));
    // easeInOutCubic.
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    const controls = this.host.controls();
    const target = controls.target.copy(move.from).lerp(move.to, eased);
    const distance = move.fromDistance + (move.toDistance - move.fromDistance) * eased;
    this.host.camera.position.copy(move.direction).multiplyScalar(distance).add(target);
    controls.update();
    this.host.constrainCamera();
    this.host.updateUnitScale();
    if (t < 1) return true;
    this.move = null;
    return false;
  }
}
