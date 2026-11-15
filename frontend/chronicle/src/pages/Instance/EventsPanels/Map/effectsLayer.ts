/**
 * The effects layer of MapScene3D (chronicle-1977): the effect clock, the
 * pooled effect primitives (beams, rings, radial areas, bolts, slashes, the
 * deep-breath path) re-derived from it on every rendered frame, and the
 * effect under the pointer. Moved verbatim out of MapScene3D.ts.
 *
 * What the effects pass writes onto units goes through EffectUnits: dead
 * state and corpse visibility, an enemy's facing toward whoever it last hit,
 * the game-model animation step, and the wobble (body tilt and flash) and
 * lunge (group offset) it applies to the unit objects and undoes on the next
 * pass. What later steps read from it: `unitCasts` (tokens, target lines,
 * plates), `effectCursorMs` (the bars' heal chunk), `effects` and
 * `effectOptions` (combat text, cast icons, bars) and `castColor`. Cast icons
 * and combat text are HUD steps the pass drives (EffectsHud).
 */
import * as THREE from "three";
import { deepBreathPathForPrimarySpell, ONYXIA_DEEP_BREATH_RADIUS_YARDS } from "./deepBreathLanes";
import { projectMapDebugPoints } from "./mapDebugOverlays";
import {
  DEFAULT_EFFECT_OPTIONS,
  DEEP_BREATH_POINT_LINGER_MS,
  deriveActiveRadialEffects,
  deriveActiveDeepBreaths,
  deriveActiveEffects,
  deriveLastHitTargets,
  deriveUnitCasts,
  deathStartedAt,
  MAX_EFFECT_PRIMITIVES,
  schoolColor,
  type ActiveRadialEffect,
  type ActiveDeepBreath,
  type ActiveEffect,
  type CastIcon,
  type DeriveEffectsOptions,
  type EncounterEffects,
  type UnitCast,
} from "./replayEffects";
import { setMaterialEmissive } from "./mapMaterials";
import { DEEP_BREATH_GROUND_LIFT, GROUND_WIDTH } from "./sceneConstants";
import { DungeonWorld, type DungeonMesh } from "./dungeonWorld";
import type { MapScene3DEffectHover, MapScene3DEffects } from "./MapScene3D";
import type { UnitObject } from "./unitLayer";
import { commitPool, createPool } from "./sceneFactories";
import { MAX_CAST_ICONS } from "./sceneConstants";

// Never run the effect clock further ahead of the last replay tick (real time).
const MAX_EXTRAPOLATE_MS = 250;
const BEAM_HEIGHT = 1.5;
const BOLT_WIDTH = 0.18;
const MAX_DEEP_BREATH_POINTS = 20;
const MAX_RADIAL_EFFECTS = 8;
const RADIAL_GROUND_LIFT = 0.1;
const DEEP_BREATH_AREA_OPACITY = 0.12;
const DEEP_BREATH_POINT_SIZE_PX = 7;
// How far a melee attacker steps toward its target, at most.
const LUNGE_DISTANCE = 1.2;
const SLASH_HEIGHT = 1.2;
const SLASH_RADIUS = 1.8;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** What the effects pass writes onto units (see the file comment). */
export interface EffectUnits {
  readonly units: ReadonlyMap<string, UnitObject>;
  setDead(object: UnitObject, dead: boolean): void;
  updateDeadUnitVisibility(object: UnitObject, deadSinceMs: number | null, cursorMs: number): void;
  applyFacing(object: UnitObject, facing: number | undefined): void;
  updateGameModelAnimations(fx: EncounterEffects | null, cursorMs: number): boolean;
}

/** The HUD steps the effects pass drives, and the cast icons the effect hover picks. */
export interface EffectsHud {
  updateCombatText(fx: EncounterEffects | null, cursorMs: number): void;
  updateCastIcons(fx: EncounterEffects | null, cursorMs: number): void;
  readonly castIcons: readonly CastIcon[];
  readonly castSprites: readonly THREE.Sprite[];
  readonly castSpriteIcons: Int16Array;
  readonly castIconCast: { caster: string; spellId: number; spellName: string; phase: CastIcon["phase"] };
}

/** What the effects layer needs from the scene. */
export interface EffectsLayerHost {
  scene: THREE.Scene;
  world: DungeonWorld;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** The scene's raycaster and pointer (shared with the unit picking). */
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  /** The scene's shared scratch (the same instances the units and the HUD use). */
  scratch: { color: THREE.Color; matrix: THREE.Matrix4; quaternion: THREE.Quaternion; scaleVector: THREE.Vector3; vector: THREE.Vector3; vectorB: THREE.Vector3 };
  /** Read when used: the unit layer is built while this layer is (see the constructor). */
  units: () => EffectUnits;
  hud: () => EffectsHud;
  now: () => number;
  requestRender: () => void;
  onEffectHover: (hover: MapScene3DEffectHover | null) => void;
  aspect: () => number;
  dungeonMesh: () => DungeonMesh | null;
  unitScale: () => number;
  pointerInside: () => boolean;
}

export class EffectsLayer {
  // From the host, under the names the moved code uses.
  private readonly host: EffectsLayerHost;
  private readonly scene: THREE.Scene;
  private readonly world: DungeonWorld;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster: THREE.Raycaster;
  private readonly pointer: THREE.Vector2;
  private readonly color: THREE.Color;
  private readonly matrix: THREE.Matrix4;
  private readonly quaternion: THREE.Quaternion;
  private readonly scaleVector: THREE.Vector3;
  private readonly vector: THREE.Vector3;
  private readonly vectorB: THREE.Vector3;
  private readonly now: () => number;
  private readonly requestRender: () => void;
  private readonly onEffectHover: (hover: MapScene3DEffectHover | null) => void;
  // Effects layer: pooled primitives, re-derived from the effect clock on
  // every rendered frame. Nothing here is allocated per frame.
  effects: MapScene3DEffects | null = null;
  readonly clock = { ms: 0, at: 0, playing: false, speed: 1 };
  // The effect clock's time at the last updateEffects, for the bars' heal chunk.
  effectCursorMs = 0;
  private readonly activeEffects: ActiveEffect[] = [];
  private readonly activeRadialEffects: ActiveRadialEffect[] = [];
  private readonly activeDeepBreaths: ActiveDeepBreath[] = [];
  // The server path being drawn, fixed when it starts: Onyxia keeps flying and
  // turning afterwards, but the ground-target sequence stays in room space.
  private deepBreathPathLock: { primarySpellId: number; startMs: number } | null = null;
  private readonly deepBreathAreaPositions: THREE.Vector3[] = [];
  private readonly deepBreathAreas: THREE.InstancedMesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly deepBreathLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly deepBreathPoints: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  readonly effectOptions: DeriveEffectsOptions = { ...DEFAULT_EFFECT_OPTIONS };
  private readonly visibleUnits = { has: (guid: string) => this.units.has(guid) };
  private readonly effectColors = new Map<string, THREE.Color>();
  readonly wobbling: UnitObject[] = [];
  readonly lunging: UnitObject[] = [];
  private readonly beamPositions = new Float32Array(MAX_EFFECT_PRIMITIVES * 6);
  private readonly beamColors = new Float32Array(MAX_EFFECT_PRIMITIVES * 6);
  private readonly beams: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly rings: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly radialSpheres: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly radialRings: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly bolts: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly slashes: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  // Index into activeEffects of each pooled primitive, for hover picking.
  private readonly beamEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  private readonly boltEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  private readonly slashEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  private readonly ringEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  readonly unitCasts = new Map<string, UnitCast>();
  private readonly lastHitTargets = new Map<string, string>();
  // Enemies on the map without a logged facing.
  private readonly hitFacingSources = {
    has: (guid: string) => {
      const object = this.units.get(guid);
      return object !== undefined && object.kind === "hostile" && !object.loggedFacing;
    },
  };
  private hoveredEffectKey = "";

  /**
   * Builds the pools in the order the scene always created them: the beams,
   * then whatever `betweenPools` builds (the unit layer's owner and trail
   * lines), then the rest. Object ids break draw-order ties between the
   * transparent pools at the origin, so that order is kept.
   */
  constructor(host: EffectsLayerHost, betweenPools: (effects: EffectsLayer) => void) {
    this.host = host;
    this.scene = host.scene;
    this.world = host.world;
    this.camera = host.camera;
    this.renderer = host.renderer;
    this.raycaster = host.raycaster;
    this.pointer = host.pointer;
    this.color = host.scratch.color;
    this.matrix = host.scratch.matrix;
    this.quaternion = host.scratch.quaternion;
    this.scaleVector = host.scratch.scaleVector;
    this.vector = host.scratch.vector;
    this.vectorB = host.scratch.vectorB;
    this.now = host.now;
    this.requestRender = host.requestRender;
    this.onEffectHover = host.onEffectHover;
    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute("position", new THREE.BufferAttribute(this.beamPositions, 3).setUsage(THREE.DynamicDrawUsage));
    beamGeometry.setAttribute("color", new THREE.BufferAttribute(this.beamColors, 3).setUsage(THREE.DynamicDrawUsage));
    beamGeometry.setDrawRange(0, 0);
    this.beams = new THREE.LineSegments(beamGeometry, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.beams.frustumCulled = false;
    betweenPools(this);
    const glow = () => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.rings = createPool(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), glow(), MAX_EFFECT_PRIMITIVES, this.color);
    this.radialSpheres = createPool(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      MAX_RADIAL_EFFECTS,
      this.color,
    );
    this.radialSpheres.renderOrder = 2;
    this.radialRings = createPool(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), glow(), MAX_RADIAL_EFFECTS, this.color);
    this.radialRings.frustumCulled = false;
    this.radialRings.renderOrder = 2;
    // Spell bolts: unit boxes stretched along the source -> target segment.
    this.bolts = createPool(new THREE.BoxGeometry(1, 1, 1), glow(), MAX_EFFECT_PRIMITIVES, this.color);
    // Melee slashes: a third of a ring, centred on +x before rotation.
    this.slashes = createPool(
      new THREE.RingGeometry(0.75, 1, 16, 1, -Math.PI / 3, (Math.PI * 2) / 3).rotateX(-Math.PI / 2),
      glow(),
      MAX_EFFECT_PRIMITIVES,
      this.color,
    );
    this.deepBreathAreas = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xff6a00,
        transparent: true,
        opacity: DEEP_BREATH_AREA_OPACITY,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      MAX_DEEP_BREATH_POINTS,
    );
    this.deepBreathAreas.count = 0;
    this.deepBreathAreas.visible = false;
    this.deepBreathAreas.frustumCulled = false;
    this.deepBreathAreas.renderOrder = 1;
    this.deepBreathAreas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.deepBreathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xff6a00,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.deepBreathLine.visible = false;
    this.deepBreathLine.frustumCulled = false;
    this.deepBreathLine.renderOrder = 2;
    this.deepBreathPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xffa040,
        size: DEEP_BREATH_POINT_SIZE_PX,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.deepBreathPoints.visible = false;
    this.deepBreathPoints.frustumCulled = false;
    this.deepBreathPoints.renderOrder = 3;
    this.scene.add(
      this.beams,
      this.rings,
      this.radialSpheres,
      this.radialRings,
      this.bolts,
      this.slashes,
      this.deepBreathAreas,
      this.deepBreathLine,
      this.deepBreathPoints,
    );
  }

  private get aspect(): number {
    return this.host.aspect();
  }
  private get dungeonMesh(): DungeonMesh | null {
    return this.host.dungeonMesh();
  }
  private get unitScale(): number {
    return this.host.unitScale();
  }
  private get pointerInside(): boolean {
    return this.host.pointerInside();
  }
  private get units(): ReadonlyMap<string, UnitObject> {
    return this.host.units().units;
  }
  private setDead(object: UnitObject, dead: boolean) {
    this.host.units().setDead(object, dead);
  }
  private updateDeadUnitVisibility(object: UnitObject, deadSinceMs: number | null, cursorMs: number) {
    this.host.units().updateDeadUnitVisibility(object, deadSinceMs, cursorMs);
  }
  private applyFacing(object: UnitObject, facing: number | undefined) {
    this.host.units().applyFacing(object, facing);
  }
  private updateGameModelAnimations(fx: EncounterEffects | null, cursorMs: number): boolean {
    return this.host.units().updateGameModelAnimations(fx, cursorMs);
  }
  private updateCombatText(fx: EncounterEffects | null, cursorMs: number) {
    this.host.hud().updateCombatText(fx, cursorMs);
  }
  private updateCastIcons(fx: EncounterEffects | null, cursorMs: number) {
    this.host.hud().updateCastIcons(fx, cursorMs);
  }
  private get castIcons(): readonly CastIcon[] {
    return this.host.hud().castIcons;
  }
  private get castSprites(): readonly THREE.Sprite[] {
    return this.host.hud().castSprites;
  }
  private get castSpriteIcons(): Int16Array {
    return this.host.hud().castSpriteIcons;
  }
  private get castIconCast(): EffectsHud["castIconCast"] {
    return this.host.hud().castIconCast;
  }

  /** Sets the combat events to draw, or turns effects off with `null`. */
  setEffects(effects: MapScene3DEffects | null) {
    this.effects = effects?.fx ? effects : null;
    if (this.effects) Object.assign(this.effectOptions, this.effects.options, { visibleGuids: this.visibleUnits });
    this.effectColors.clear();
    this.requestRender();
  }

  /**
   * Anchors the effect clock on a replay tick. While playing, frames run
   * ahead of the last tick at `speed` (up to MAX_EXTRAPOLATE_MS) so short
   * effects animate smoothly between the coarse ticks.
   */
  setEffectClock(cursorMs: number, playing: boolean, speed: number) {
    this.clock.ms = cursorMs;
    this.clock.at = this.now();
    this.clock.playing = playing;
    this.clock.speed = speed;
    this.requestRender();
  }

  // The replay time the effects show at `now` (the effect clock, run ahead while playing).
  replayNow(now: number): number {
    const { clock } = this;
    return clock.playing ? clock.ms + Math.min(now - clock.at, MAX_EXTRAPOLATE_MS) * clock.speed : clock.ms;
  }

  // Enemies with no logged facing turn toward whoever they last hit (kept
  // after the hit, so they do not snap back to north).
  private updateHitFacings() {
    const fx = this.effects?.fx;
    if (!fx) return;
    deriveLastHitTargets(fx, this.effectCursorMs, this.hitFacingSources, this.lastHitTargets);
    for (const [guid, targetGuid] of this.lastHitTargets) {
      const object = this.units.get(guid);
      const target = this.units.get(targetGuid);
      if (!object || !target || object.loggedFacing || object.dead) continue;
      const dx = target.base.x - object.base.x;
      const dz = target.base.z - object.base.z;
      if (dx * dx + dz * dz < 1e-8) continue;
      // Rotating -z (the notch) by θ about y gives (-sin θ, 0, -cos θ).
      object.hitFacing = Math.atan2(-dx, -dz);
      this.applyFacing(object, object.hitFacing);
    }
  }

  private updateRadialEffects(fx: EncounterEffects | null, cursorMs: number) {
    const radials = fx
      ? deriveActiveRadialEffects(fx, cursorMs, this.activeRadialEffects)
      : this.activeRadialEffects;
    if (!fx) radials.length = 0;
    const yardScale = this.world.yardScale(this.aspect);
    if (yardScale === null) {
      commitPool(this.radialRings, 0);
      commitPool(this.radialSpheres, 0);
      return;
    }

    let ringCount = 0;
    let sphereCount = 0;
    const filterGuids = this.effectOptions.filterGuids;
    for (const radial of radials) {
      const source = this.units.get(radial.source);
      if ((filterGuids && !filterGuids.has(radial.source)) || !source || !source.group.visible) continue;
      const radius = radial.radiusYards * yardScale * radial.progress;
      if (radius <= 0) continue;
      if (radial.shape === "sphere") {
        if (sphereCount >= MAX_RADIAL_EFFECTS) continue;
        this.matrix.makeScale(radius, radius, radius).setPosition(
          source.base.x,
          source.base.y + BEAM_HEIGHT * this.unitScale,
          source.base.z,
        );
        this.radialSpheres.setMatrixAt(sphereCount, this.matrix);
        this.radialSpheres.setColorAt(sphereCount, this.color.set(radial.color).multiplyScalar(1 - radial.progress));
        sphereCount++;
        continue;
      }
      if (ringCount >= MAX_RADIAL_EFFECTS) continue;
      this.matrix.makeScale(radius, 1, radius).setPosition(
        source.base.x,
        source.base.y + RADIAL_GROUND_LIFT * this.unitScale,
        source.base.z,
      );
      this.radialRings.setMatrixAt(ringCount, this.matrix);
      this.radialRings.setColorAt(ringCount, this.color.set(radial.color).multiplyScalar(1 - radial.progress));
      ringCount++;
    }
    commitPool(this.radialRings, ringCount);
    commitPool(this.radialSpheres, sphereCount);
  }

  private hideDeepBreath() {
    this.deepBreathAreas.count = 0;
    this.deepBreathAreas.visible = false;
    this.deepBreathLine.visible = false;
    this.deepBreathPoints.visible = false;
    this.deepBreathPathLock = null;
  }

  // Projects the authoritative ordered server targets into room space. Onyxia's
  // current position and facing never alter this fixed geometry.
  private setDeepBreathPath(primarySpellId: number, startMs: number): boolean {
    const mesh = this.dungeonMesh;
    const path = deepBreathPathForPrimarySpell(primarySpellId);
    if (!mesh || !path) return false;
    const projected = projectMapDebugPoints(path.points, path.mapId, mesh.bounds, this.aspect, GROUND_WIDTH);
    if (projected.length !== path.points.length || projected.length > MAX_DEEP_BREATH_POINTS) return false;

    const positions = new Float32Array(projected.length * 3);
    this.deepBreathAreaPositions.length = 0;
    for (let index = 0; index < projected.length; index++) {
      const point = projected[index];
      const floor = this.world.floorHeights.heightAt(`deep-breath-${path.key}-${index}`, point.x, point.z);
      const floorY = floor + DEEP_BREATH_GROUND_LIFT * mesh.scale;
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = floorY;
      positions[index * 3 + 2] = point.z;
      this.deepBreathAreaPositions.push(new THREE.Vector3(point.x, floorY, point.z));
    }
    this.deepBreathLine.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.deepBreathPoints.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.deepBreathPathLock = { primarySpellId, startMs };
    return true;
  }

  /**
   * Keeps the complete server centerline visible while the chain advances, but
   * only shows the 30-yard damage circle for the ground spell resolving now.
   */
  private updateDeepBreath(fx: EncounterEffects | null, cursorMs: number) {
    if (this.effects?.mapId !== 249) {
      this.hideDeepBreath();
      return;
    }
    const breaths = fx
      ? deriveActiveDeepBreaths(fx, cursorMs, this.activeDeepBreaths, this.effects?.mapId)
      : this.activeDeepBreaths;
    if (!fx) breaths.length = 0;
    const breath = breaths[0];
    const yardScale = this.world.yardScale(this.aspect);
    if (!breath || yardScale === null) {
      this.hideDeepBreath();
      return;
    }

    const lock = this.deepBreathPathLock;
    if (!lock || lock.primarySpellId !== breath.routeSpellId || lock.startMs !== breath.startMs) {
      if (!this.setDeepBreathPath(breath.routeSpellId, breath.startMs)) {
        this.hideDeepBreath();
        return;
      }
    }
    const point = this.deepBreathAreaPositions[breath.pointIndex];
    if (!point) {
      this.hideDeepBreath();
      return;
    }
    const radius = ONYXIA_DEEP_BREATH_RADIUS_YARDS * yardScale;
    this.matrix.makeScale(radius, radius, radius);
    this.matrix.setPosition(point);
    this.deepBreathAreas.setMatrixAt(0, this.matrix);
    this.deepBreathAreas.count = 1;
    this.deepBreathAreas.instanceMatrix.needsUpdate = true;
    this.deepBreathAreas.material.opacity = DEEP_BREATH_AREA_OPACITY
      * Math.max(0, 1 - (cursorMs - breath.pointStartedMs) / DEEP_BREATH_POINT_LINGER_MS);
    this.deepBreathAreas.visible = true;
    this.deepBreathLine.visible = true;
    this.deepBreathPoints.visible = true;
  }

  // Applies the effects at the effect clock's current time. Returns whether
  // another frame is needed to keep them animating.
  updateEffects(now: number): boolean {
    for (const object of this.wobbling) {
      object.body.rotation.z = 0;
      for (const material of object.bodyMaterials) setMaterialEmissive(material, null);
    }
    this.wobbling.length = 0;
    for (const object of this.lunging) object.group.position.copy(object.base);
    this.lunging.length = 0;
    const fx = this.effects?.fx ?? null;
    const { clock } = this;
    const cursorMs = clock.playing ? clock.ms + Math.min(now - clock.at, MAX_EXTRAPOLATE_MS) * clock.speed : clock.ms;
    this.effectCursorMs = cursorMs;

    for (const object of this.units.values()) {
      const guid = object.group.userData.guid as string;
      const deadSinceMs = fx ? deathStartedAt(fx, guid, cursorMs) : null;
      this.setDead(object, deadSinceMs !== null);
      this.updateDeadUnitVisibility(object, deadSinceMs, cursorMs);
    }
    if (fx) deriveUnitCasts(fx, cursorMs, this.unitCasts);
    else this.unitCasts.clear();
    this.updateHitFacings();
    this.updateRadialEffects(fx, cursorMs);
    this.updateDeepBreath(fx, cursorMs);

    let beamCount = 0;
    let ringCount = 0;
    let boltCount = 0;
    let slashCount = 0;
    const active = fx ? deriveActiveEffects(fx, cursorMs, this.effectOptions, this.activeEffects) : this.activeEffects;
    if (!fx) active.length = 0;
    for (let index = 0; index < active.length; index++) {
      const effect = active[index];
      const target = this.units.get(effect.target);
      if (!target) continue;
      const color = this.effectColor(effect.color);
      const fade = 1 - effect.progress;
      if (effect.type === "beam" || effect.type === "streak") {
        const source = effect.source ? this.units.get(effect.source) : undefined;
        if (!source) continue;
        // A short streak travelling from the source to the target: spells as
        // a thick bolt (thicker on crits), ranged autos as a thin line.
        const head = Math.min(1, effect.progress * 1.5);
        const tail = Math.max(0, head - 0.4);
        const from = source.base;
        const to = target.base;
        const lift = BEAM_HEIGHT * this.unitScale;
        const brightness = Math.min(1.5, fade * (0.6 + 0.4 * effect.intensity));
        const tailPoint = this.vector.set(from.x + (to.x - from.x) * tail, from.y + (to.y - from.y) * tail + lift, from.z + (to.z - from.z) * tail);
        const headPoint = this.vectorB.set(from.x + (to.x - from.x) * head, from.y + (to.y - from.y) * head + lift, from.z + (to.z - from.z) * head);
        if (effect.type === "beam") {
          const length = tailPoint.distanceTo(headPoint);
          if (boltCount >= MAX_EFFECT_PRIMITIVES || length <= 0) continue;
          const width = BOLT_WIDTH * (1 + 0.8 * (effect.intensity - 1)) * this.unitScale;
          this.quaternion.setFromUnitVectors(Z_AXIS, headPoint.sub(tailPoint).divideScalar(length));
          tailPoint.addScaledVector(headPoint, length / 2);
          this.matrix.compose(tailPoint, this.quaternion, this.scaleVector.set(width, width, length));
          this.bolts.setMatrixAt(boltCount, this.matrix);
          this.bolts.setColorAt(boltCount, this.color.copy(color).multiplyScalar(brightness));
          this.boltEffects[boltCount] = index;
          boltCount++;
          continue;
        }
        if (beamCount >= MAX_EFFECT_PRIMITIVES) continue;
        const offset = beamCount * 6;
        this.beamPositions[offset] = tailPoint.x;
        this.beamPositions[offset + 1] = tailPoint.y;
        this.beamPositions[offset + 2] = tailPoint.z;
        this.beamPositions[offset + 3] = headPoint.x;
        this.beamPositions[offset + 4] = headPoint.y;
        this.beamPositions[offset + 5] = headPoint.z;
        this.beamColors[offset] = color.r * brightness * 0.3;
        this.beamColors[offset + 1] = color.g * brightness * 0.3;
        this.beamColors[offset + 2] = color.b * brightness * 0.3;
        this.beamColors[offset + 3] = color.r * brightness;
        this.beamColors[offset + 4] = color.g * brightness;
        this.beamColors[offset + 5] = color.b * brightness;
        this.beamEffects[beamCount] = index;
        beamCount++;
      } else if (effect.type === "lunge") {
        // The attacker steps toward its target and back.
        const source = effect.source ? this.units.get(effect.source) : undefined;
        if (!source || source.dead || this.lunging.includes(source)) continue;
        const toward = this.vector.subVectors(target.base, source.base).setY(0);
        const distance = toward.length();
        if (distance <= 0) continue;
        const step = Math.sin(effect.progress * Math.PI) * Math.min(LUNGE_DISTANCE * this.unitScale, distance * 0.4);
        source.group.position.copy(source.base).addScaledVector(toward, step / distance);
        this.lunging.push(source);
      } else if (effect.type === "slash") {
        // An arc on the attacker's side of the target, sweeping across it.
        const source = effect.source ? this.units.get(effect.source) : undefined;
        if (!source || slashCount >= MAX_EFFECT_PRIMITIVES) continue;
        const angle = Math.atan2(-(source.base.z - target.base.z), source.base.x - target.base.x) + (effect.progress - 0.5) * 1.4;
        const radius = SLASH_RADIUS * (0.8 + 0.3 * effect.progress) * this.unitScale;
        this.matrix.makeRotationY(angle).scale(this.scaleVector.set(radius, 1, radius))
          .setPosition(target.base.x, target.base.y + SLASH_HEIGHT * this.unitScale, target.base.z);
        this.slashes.setMatrixAt(slashCount, this.matrix);
        this.slashes.setColorAt(slashCount, this.color.copy(color).multiplyScalar(fade * Math.min(2, 0.7 + 0.5 * effect.intensity)));
        this.slashEffects[slashCount] = index;
        slashCount++;
      } else if (effect.type === "hit") {
        if (target.dead) continue;
        // Damped shake about the unit's facing axis plus an emissive flash.
        target.body.rotation.z = Math.sin(effect.progress * Math.PI * 6) * 0.3 * fade * Math.min(2, effect.intensity);
        for (const material of target.bodyMaterials) {
          setMaterialEmissive(material, color, fade * 0.6 * Math.min(2, effect.intensity));
        }
        if (!this.wobbling.includes(target)) this.wobbling.push(target);
      } else if (ringCount < MAX_EFFECT_PRIMITIVES) {
        // "impact": a small quick burst under a melee ability's target;
        // "heal": a ring rising up the healed target, sized by the healing
        // (bigger and gold on crits).
        const radius = (effect.type === "heal"
          ? (0.9 + 0.4 * effect.progress) * (0.5 + 0.5 * effect.intensity)
          : 0.6 + 1.8 * effect.progress) * this.unitScale;
        const brightness = fade * (effect.type === "impact" ? 1.2 : 1);
        const position = target.base;
        const y = position.y + (effect.type === "heal" ? (0.2 + 2.4 * effect.progress) * this.unitScale : 0.05);
        this.matrix.makeScale(radius, 1, radius).setPosition(position.x, y, position.z);
        this.rings.setMatrixAt(ringCount, this.matrix);
        this.rings.setColorAt(ringCount, this.color.copy(color).multiplyScalar(brightness));
        this.ringEffects[ringCount] = index;
        ringCount++;
      }
    }

    this.beams.geometry.setDrawRange(0, beamCount * 2);
    this.beams.geometry.attributes.position.needsUpdate = beamCount > 0;
    this.beams.geometry.attributes.color.needsUpdate = beamCount > 0;
    // Raycasts compute bounds lazily; they change every frame.
    this.beams.geometry.boundingSphere = null;
    commitPool(this.rings, ringCount);
    commitPool(this.bolts, boltCount);
    commitPool(this.slashes, slashCount);
    // Icons first: combat text on a unit with icons floats above them.
    this.updateCastIcons(fx, cursorMs);
    this.updateCombatText(fx, cursorMs);
    const modelsAnimating = this.updateGameModelAnimations(fx, cursorMs);
    return (fx !== null && clock.playing) || modelsAnimating;
  }

  // Reports the spell effect under the pointer when it changes.
  updateEffectHover() {
    let hit: { effect: ActiveEffect | null; key: string } | null = null;
    let iconSprite: THREE.Sprite | null = null;
    if (this.pointerInside && this.effects) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      // Cast icons draw over everything, so they are picked first.
      for (let index = 0; index < MAX_CAST_ICONS; index++) {
        const sprite = this.castSprites[index];
        if (!sprite.visible || this.raycaster.intersectObject(sprite, false).length === 0) continue;
        const icon = this.castIcons[this.castSpriteIcons[index]];
        if (!icon) continue;
        Object.assign(this.castIconCast, { caster: icon.caster, spellId: icon.spellId, spellName: icon.spellName, phase: icon.phase });
        hit = { effect: null, key: `icon|${icon.caster}|${icon.spellId}` };
        iconSprite = sprite;
        break;
      }
    }
    if (!hit && this.pointerInside && this.effects) {
      this.raycaster.params.Line.threshold = 0.4 * this.unitScale;
      const pools: [THREE.Object3D, Int16Array][] = [
        [this.bolts, this.boltEffects],
        [this.beams, this.beamEffects],
        [this.slashes, this.slashEffects],
        [this.rings, this.ringEffects],
      ];
      for (const [object, effects] of pools) {
        const intersection = this.raycaster.intersectObject(object, false)[0];
        if (!intersection) continue;
        const primitive = intersection.instanceId ?? Math.floor((intersection.index ?? 0) / 2);
        const effect = this.activeEffects[effects[primitive]];
        if (!effect || (effect.spellId == null && !effect.spellName)) continue;
        hit = { effect, key: `${effect.type}|${effect.source}|${effect.target}|${effect.eventMs}` };
        break;
      }
    }
    if ((hit?.key ?? "") === this.hoveredEffectKey) return;
    this.hoveredEffectKey = hit?.key ?? "";
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (hit && !hit.effect && iconSprite) {
      const projected = this.vector.copy(iconSprite.position).project(this.camera);
      const cast = this.castIconCast;
      this.onEffectHover({
        eventKind: cast.phase === "casting" ? "cast_start" : cast.phase === "interrupted" ? "interrupt" : "cast_go",
        spellId: cast.spellId,
        spellName: cast.spellName,
        amount: 0,
        x: (projected.x + 1) / 2 * rect.width,
        y: (1 - projected.y) / 2 * rect.height,
      });
      return;
    }
    const target = hit?.effect ? this.units.get(hit.effect.target) : undefined;
    if (!hit?.effect || !target) {
      this.onEffectHover(null);
      return;
    }
    const projected = this.vector.copy(target.base).setY(target.base.y + BEAM_HEIGHT * this.unitScale).project(this.camera);
    this.onEffectHover({
      eventKind: hit.effect.eventKind,
      spellId: hit.effect.spellId,
      spellName: hit.effect.spellName,
      amount: hit.effect.amount,
      x: (projected.x + 1) / 2 * rect.width,
      y: (1 - projected.y) / 2 * rect.height,
    });
  }

  private effectColor(css: string): THREE.Color {
    let color = this.effectColors.get(css);
    if (!color) {
      color = new THREE.Color(this.effects?.resolveColor(css) ?? css);
      this.effectColors.set(css, color);
    }
    return color;
  }

  // A cast's colour: its event's school, else its spell's (cast starts carry none).
  castColor(cast: UnitCast): THREE.Color {
    const css = cast.school ? schoolColor(cast.school) : (cast.spellId ? this.effects?.castSchoolColor?.(cast.spellId) : null) ?? schoolColor(0);
    return this.effectColor(css);
  }

  dispose() {
    this.beams.geometry.dispose();
    this.beams.material.dispose();
    this.deepBreathAreas.geometry.dispose();
    this.deepBreathAreas.material.dispose();
    this.deepBreathAreas.dispose();
    this.deepBreathLine.geometry.dispose();
    this.deepBreathLine.material.dispose();
    this.deepBreathPoints.geometry.dispose();
    this.deepBreathPoints.material.dispose();
    for (const pool of [this.rings, this.bolts, this.slashes]) {
      pool.geometry.dispose();
      pool.material.dispose();
      pool.dispose();
    }
  }
}
