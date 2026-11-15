/**
 * Module-level factories for MapScene3D (chronicle-1970): unit geometries,
 * the walk avatar and its animated model, label and combat-text sprites, the
 * cast-arc and icon materials, and small easing and number helpers. Moved
 * verbatim out of MapScene3D.ts.
 */
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { MapUnitCallout } from "./MapScene3D";
import { CUT_ARC_COLOR, CUT_TICK_COLOR, WALK_AVATAR_COLOR, WALK_AVATAR_EMISSIVE } from "./mapPalette";
import { raidTargetMarkerImage } from "./plan/planArt";
import type { WalkAvatarTemplate } from "./sceneLoaders";
import type { MapMarkerKind } from "./useMapScene";
import { WALK_AVATAR_CLIPS, type WalkAvatarState } from "./walkAvatars";

export const CAST_ARC_SIZE = 1.25;

// You, in walk mode: a gold player capsule (no facing cone; the camera shows the way).
export function createAvatar(geometries: Record<MapMarkerKind | "cone", THREE.BufferGeometry>): THREE.Group {
  const material = new THREE.MeshStandardMaterial({ color: WALK_AVATAR_COLOR, emissive: WALK_AVATAR_EMISSIVE, roughness: 0.5 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometries.player, material));
  return group;
}

/** Seconds to cross-fade between a monster's idle, walk, run and in-air clips. */
const WALK_AVATAR_FADE_S = 0.2;

// A chosen monster in walk mode: its clone of the loaded model, and its clips.
export interface WalkAvatarModel {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<WalkAvatarState, THREE.AnimationAction | null>;
  state: WalkAvatarState | null;
}

export function createWalkAvatarModel(template: WalkAvatarTemplate): WalkAvatarModel {
  const root = cloneSkinned(template.scene);
  // Geometry and materials are the template's: disposeAvatar leaves them be.
  root.traverse((child) => { child.userData.sharedAsset = true; });
  const mixer = new THREE.AnimationMixer(root);
  const clipFor = (names: readonly string[]) => names.map((name) => template.clips.find((clip) => clip.name === name)).find((clip) => clip) ?? null;
  const actions = {} as Record<WalkAvatarState, THREE.AnimationAction | null>;
  for (const state of Object.keys(WALK_AVATAR_CLIPS) as WalkAvatarState[]) {
    const clip = clipFor(WALK_AVATAR_CLIPS[state]);
    actions[state] = clip ? mixer.clipAction(clip) : null;
  }
  return { root, mixer, actions, state: null };
}

export function playWalkAvatarState(model: WalkAvatarModel, state: WalkAvatarState) {
  if (model.state === state) return;
  const previous = model.state ? model.actions[model.state] : null;
  const next = model.actions[state];
  model.state = state;
  // States can share a clip (a blob runs with its walk).
  if (!next || next === previous) return;
  next.reset().setEffectiveWeight(1).fadeIn(WALK_AVATAR_FADE_S).play();
  previous?.fadeOut(WALK_AVATAR_FADE_S);
}

export function createUnitGeometries(): Record<MapMarkerKind | "cone", THREE.BufferGeometry> {
  // Bodies stand on the ground plane; the cone sits in front of the body and
  // points along -z, which a rotation of `facing` about y turns to the unit's
  // heading (WoW facing is counter-clockwise from world north = artwork up).
  const player = new THREE.CapsuleGeometry(0.9, 1.2, 4, 12).translate(0, 1.5, 0);
  const hostile = new THREE.BoxGeometry(1.8, 1.8, 1.8).translate(0, 0.9, 0);
  const pet = new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12).translate(0, 0.6, 0);
  const cone = new THREE.ConeGeometry(0.55, 1.3, 10).rotateX(-Math.PI / 2).translate(0, 0.6, -1.9);
  return { player, hostile, pet, cone };
}

// 16800 -> "16.8k", 1250000 -> "1.25M", 950 -> "950".
export function shortNumber(value: number): string {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${+(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function createUnitCalloutMarker(callout: MapUnitCallout, onLoad: () => void): THREE.Sprite {
  const texture = new THREE.TextureLoader().load(raidTargetMarkerImage(callout.marker), onLoad);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.center.set(0.5, 0);
  sprite.visible = false;
  sprite.renderOrder = 6;
  return sprite;
}

export function createLabelSprite(text: string): THREE.Sprite {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const font = `500 ${11 * scale}px ui-sans-serif, system-ui, sans-serif`;
  context.font = font;
  const paddingX = 6 * scale;
  canvas.width = Math.ceil(context.measureText(text).width + paddingX * 2);
  canvas.height = 18 * scale;
  context.font = font;
  context.fillStyle = "rgba(0, 0, 0, 0.85)";
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
  context.fill();
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(text, paddingX, canvas.height / 2 + scale);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  const worldHeight = 2.4;
  sprite.scale.set(worldHeight * canvas.width / canvas.height, worldHeight, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  sprite.userData.text = text;
  return sprite;
}

// Combat text: coloured, outlined, no background.
export function createTextTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const font = `600 ${11 * scale}px ui-sans-serif, system-ui, sans-serif`;
  context.font = font;
  const padding = 3 * scale;
  canvas.width = Math.ceil(context.measureText(text).width + padding * 2);
  canvas.height = 16 * scale;
  context.font = font;
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 3 * scale;
  context.strokeStyle = "rgba(0, 0, 0, 0.9)";
  context.strokeText(text, padding, canvas.height / 2 + scale);
  context.fillStyle = color;
  context.fillText(text, padding, canvas.height / 2 + scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// Overshoots past 1 by an amount set by `overshoot`, then settles at 1.
export function easeOutBack(t: number, overshoot: number): number {
  const x = t - 1;
  return 1 + (overshoot + 1) * x ** 3 + overshoot * x ** 2;
}

// A white outline round a square icon, traced `fraction` of the way round
// clockwise from 12 o'clock. Drawn on a canvas CAST_ARC_SIZE times the icon,
// about 2 px wide at the icon's on-screen size. A `cut` outline is grey with
// a red tick across its end.
export function createArcTexture(fraction: number, cut: boolean): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const inset = (size * (1 - 1 / CAST_ARC_SIZE)) / 2 - 6;
  const far = size - inset;
  const middle = size / 2;
  const points: [number, number][] = [[middle, inset], [far, inset], [far, far], [inset, far], [inset, inset], [middle, inset]];
  let remaining = fraction * 4 * (far - inset);
  let endX = points[0][0];
  let endY = points[0][1];
  let alongX = 1;
  let alongY = 0;
  context.strokeStyle = cut ? CUT_ARC_COLOR : "#ffffff";
  context.lineWidth = 8;
  context.lineCap = "butt";
  context.lineJoin = "miter";
  context.beginPath();
  context.moveTo(...points[0]);
  for (let index = 1; index < points.length && remaining > 0; index++) {
    const [fromX, fromY] = points[index - 1];
    const [toX, toY] = points[index];
    const length = Math.hypot(toX - fromX, toY - fromY);
    const part = Math.min(1, remaining / length);
    endX = fromX + (toX - fromX) * part;
    endY = fromY + (toY - fromY) * part;
    alongX = (toX - fromX) / length;
    alongY = (toY - fromY) / length;
    context.lineTo(endX, endY);
    remaining -= length;
  }
  context.stroke();
  if (cut) {
    // Across the outline, sticking out a little on both sides.
    context.strokeStyle = CUT_TICK_COLOR;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(endX - alongY * 12, endY + alongX * 12);
    context.lineTo(endX + alongY * 12, endY - alongX * 12);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A sprite material whose `userData.saturation.value` (1 = colour, 0 = grey)
// mixes the texel towards its luminance. Every icon sprite has its own
// material and uniform; the shared cache key compiles one program for all.
export function createIconMaterial(): THREE.SpriteMaterial {
  const material = new THREE.SpriteMaterial({ depthTest: false, transparent: true });
  const saturation = { value: 1 };
  material.userData.saturation = saturation;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSaturation = saturation;
    shader.fragmentShader = `uniform float uSaturation;\n${shader.fragmentShader}`.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\ndiffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, uSaturation);",
    );
  };
  material.customProgramCacheKey = () => "cast-icon-saturation";
  return material;
}
