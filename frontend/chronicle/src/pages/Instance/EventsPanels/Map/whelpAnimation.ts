import * as THREE from "three";

// The extracted Stand clip lasts 33.334s because of sparse late keys on
// unrelated bones, but its wing-motion keys cover only the first 1.2s.
const WHELP_STAND_LOOP_FRAMES = 37; // Include the 1.2s closing pose at 30 fps.

const wingLoops = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();
export function loopingWhelpStand(stand: THREE.AnimationClip): THREE.AnimationClip {
  let loop = wingLoops.get(stand);
  if (!loop) {
    loop = THREE.AnimationUtils.subclip(stand, "WhelpStandLoop", 0, WHELP_STAND_LOOP_FRAMES);
    wingLoops.set(stand, loop);
  }
  return loop;
}

/** Only the original Rookery Whelp game model carries the wing-flapping Stand clip. */
export function shouldFlapWings(entry: number | undefined, modelKind: "game" | "miniature" | undefined): boolean {
  return entry === 10161 && modelKind === "game";
}
