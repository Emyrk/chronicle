/**
 * The scripted rig (chronicle-1987): authored camera poses, camera marks
 * and video capture frames (MapScene3D.applyCameraPose). A pose is applied
 * at once; the arbiter records that it holds the camera until something else
 * takes it, so the rig itself never animates.
 */
import type * as THREE from "three";
import type { MapCameraPose } from "./cameraPath";
import type { CameraRig } from "./cameraRig";

export class ScriptedRig implements CameraRig {
  readonly owner = "scripted";

  active(): boolean {
    return false;
  }

  /** Puts `camera` and its pivot (`target`) on `pose`, with the pose's lens when it has one. */
  apply(pose: MapCameraPose, camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
    camera.position.fromArray(pose.position);
    target.fromArray(pose.target);
    if (pose.fov !== undefined) camera.fov = pose.fov;
    if (pose.near !== undefined) camera.near = pose.near;
    if (pose.far !== undefined) camera.far = pose.far;
    camera.updateProjectionMatrix();
  }
}
