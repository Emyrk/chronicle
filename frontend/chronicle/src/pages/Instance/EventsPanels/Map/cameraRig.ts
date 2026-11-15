/**
 * The camera rigs (chronicle-1987): walk, free, director, tween and
 * scripted, each in its own file, each claiming the camera through the
 * arbiter (cameraArbiter.ts). A rig writes the camera itself in its frame
 * step: today's placements (a direction times a distance, the walk camera's
 * lookAt in first person, the Director's offset) stay exactly as they were,
 * where a pose handed to a central writer would round differently.
 */
import type * as THREE from "three";
import type { CameraOwner } from "./cameraArbiter";

/** Where the camera is, as a rig takes it over: its pivot, and yaw, pitch and distance about it. */
export interface RigPose {
  pivot: THREE.Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface CameraRig {
  /** The owner this rig is (cameraArbiter.ts). */
  readonly owner: CameraOwner;
  /** Whether the rig is driving the camera now. */
  active(): boolean;
}
