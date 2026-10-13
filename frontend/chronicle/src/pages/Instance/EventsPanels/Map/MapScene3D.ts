import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mapAssetUrl, type WowMapLayer, type WowMapTile } from "@/pages/Technical/mapGallery";
import { FULL_MAP_VIEWPORT, healthBarColor, mapPointToScene, MAX_HEALTH_BARS, type MapPoint, type MapViewport } from "./mapModel";
import {
  DEFAULT_EFFECT_OPTIONS,
  deriveActiveEffects,
  deriveCombatText,
  isDeadAt,
  type ActiveEffect,
  type CombatText,
  type DeriveEffectsOptions,
  type EncounterEffects,
  type ReplayEffectKind,
} from "./replayEffects";
import type { MapMarkerKind, MapSceneGround, MapUnitHealth } from "./useMapScene";

/** Ground plane width in scene units; depth follows the artwork's aspect. */
export const GROUND_WIDTH = 100;
const MUTED_OPACITY = 0.28;
const LABEL_HEIGHT = 5;
/** Primitive pool size for each effect kind; also the derivation cap's ceiling. */
export const MAX_EFFECT_PRIMITIVES = 64;
// Never run the effect clock further ahead of the last replay tick (real time).
const MAX_EXTRAPOLATE_MS = 250;
const BEAM_HEIGHT = 1.5;
const BOLT_WIDTH = 0.18;
// How far a melee attacker steps toward its target, at most.
const LUNGE_DISTANCE = 1.2;
const SLASH_HEIGHT = 1.2;
const SLASH_RADIUS = 1.8;
// Health bars sit between the body and the hover label.
const BAR_HEIGHT = 3.9;
const BAR_WIDTH = 2.6;
const BAR_THICKNESS = 0.36;
const BAR_PADDING = 0.14;
const BAR_BACKGROUND = 0x0c0a09;
const BAR_DEAD = 0x57534e;
const BAR_ABSORB = 0xe7e5e4;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const MAX_COMBAT_TEXT = 8;
const COMBAT_TEXT_HEIGHT = 1.8;
// Rendered label textures kept for reuse (spell name + colour).
const MAX_LABEL_TEXTURES = 128;
const DEAD_COLOR = 0x57534e;
// Default camera directions from the target.
const ANGLED_OFFSET = new THREE.Vector3(0, 0.85, 0.75);
// A tiny +z offset keeps OrbitControls' up vector stable while leaving
// artwork-up at the top of the screen, as in the 2D view.
const TOP_DOWN_OFFSET = new THREE.Vector3(0, 1, 0.0001);

export interface MapScene3DUnit {
  guid: string;
  point: MapPoint;
  facing: number;
  color: string;
  kind: MapMarkerKind;
  muted: boolean;
  name: string;
  /** Health bar to draw, or null for none. */
  health: MapUnitHealth | null;
}

interface UnitObject {
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMaterial: THREE.MeshLambertMaterial;
  coneMaterial: THREE.MeshLambertMaterial;
  cone: THREE.Mesh;
  kind: MapMarkerKind;
  name: string;
  color: string;
  dead: boolean;
  /** Replayed position; lunges offset `group.position` from it. */
  base: THREE.Vector3;
  health: MapUnitHealth | null;
}

export interface MapScene3DEffects {
  fx: EncounterEffects | null;
  /** `visibleGuids` is ignored: the scene limits effects to its own units. */
  options: DeriveEffectsOptions;
  /** Resolves effect colours, which may be CSS custom properties. */
  resolveColor: (color: string) => string;
  /** Casters whose recent hits float their spell name; null for none. */
  combatTextGuids: ReadonlySet<string> | null;
}

/** The spell effect under the pointer, for an HTML tooltip. */
export interface MapScene3DEffectHover {
  eventKind: ReplayEffectKind;
  spellId: number | null;
  spellName: string;
  amount: number;
  /** Container-relative pixels of the effect's target. */
  x: number;
  y: number;
}

function createUnitGeometries(): Record<MapMarkerKind | "cone", THREE.BufferGeometry> {
  // Bodies stand on the ground plane; the cone sits in front of the body and
  // points along -z, which a rotation of `facing` about y turns to the unit's
  // heading (WoW facing is counter-clockwise from world north = artwork up).
  const player = new THREE.CapsuleGeometry(0.9, 1.2, 4, 12).translate(0, 1.5, 0);
  const hostile = new THREE.BoxGeometry(1.8, 1.8, 1.8).translate(0, 0.9, 0);
  const pet = new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12).translate(0, 0.6, 0);
  const cone = new THREE.ConeGeometry(0.55, 1.3, 10).rotateX(-Math.PI / 2).translate(0, 0.6, -1.9);
  return { player, hostile, pet, cone };
}

/**
 * Imperative three.js scene for the Map panel's 3D view: the artwork as a
 * textured ground plane and units as primitives. Owned by MapView3D through a
 * ref; React never reconciles three objects. Renders on demand.
 */
export class MapScene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly geometries = createUnitGeometries();
  private readonly groundGroup = new THREE.Group();
  private readonly unitsGroup = new THREE.Group();
  private readonly units = new Map<string, UnitObject>();
  private readonly textureLoader = new THREE.TextureLoader();
  private label: THREE.Sprite | null = null;
  private hoveredGuid: string | null = null;
  private groundKey = "";
  private aspect = 1;
  private viewport: MapViewport = FULL_MAP_VIEWPORT;
  private unitScale = 1;
  private frame = 0;
  private disposed = false;

  // Effects layer: pooled primitives, re-derived from the effect clock on
  // every rendered frame. Nothing here is allocated per frame.
  private effects: MapScene3DEffects | null = null;
  private clock = { ms: 0, at: 0, playing: false, speed: 1 };
  private readonly activeEffects: ActiveEffect[] = [];
  private readonly effectOptions: DeriveEffectsOptions = { ...DEFAULT_EFFECT_OPTIONS };
  private readonly visibleUnits = { has: (guid: string) => this.units.has(guid) };
  private readonly effectColors = new Map<string, THREE.Color>();
  private readonly wobbling: UnitObject[] = [];
  private readonly lunging: UnitObject[] = [];
  private readonly beamPositions = new Float32Array(MAX_EFFECT_PRIMITIVES * 6);
  private readonly beamColors = new Float32Array(MAX_EFFECT_PRIMITIVES * 6);
  private readonly beams: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly rings: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly bolts: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly slashes: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  // Background, fill and absorb quads per bar.
  private readonly bars: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly vector = new THREE.Vector3();
  private readonly vectorB = new THREE.Vector3();
  private readonly scaleVector = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  // Index into activeEffects of each pooled primitive, for hover picking.
  private readonly beamEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  private readonly boltEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  private readonly slashEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  private readonly ringEffects = new Int16Array(MAX_EFFECT_PRIMITIVES);
  private pointerInside = false;
  private hoveredEffectKey = "";
  private readonly onEffectHover: (hover: MapScene3DEffectHover | null) => void;
  private readonly combatText: CombatText[] = [];
  private readonly combatSprites: THREE.Sprite[] = [];
  private readonly labelTextures = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

  private readonly container: HTMLElement;
  private readonly onContextLost: () => void;

  constructor(container: HTMLElement, onContextLost: () => void, onEffectHover: (hover: MapScene3DEffectHover | null) => void = () => {}) {
    this.container = container;
    this.onContextLost = onContextLost;
    this.onEffectHover = onEffectHover;
    // Throws when WebGL is unavailable; the caller falls back to 2D.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x11100d);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    container.appendChild(this.renderer.domElement);

    this.textureLoader.setCrossOrigin("anonymous");
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-30, 80, 40);
    this.scene.add(sun);
    this.scene.add(this.groundGroup, this.unitsGroup);

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
    const glow = () => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.rings = this.createPool(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), glow(), MAX_EFFECT_PRIMITIVES);
    // Spell bolts: unit boxes stretched along the source -> target segment.
    this.bolts = this.createPool(new THREE.BoxGeometry(1, 1, 1), glow(), MAX_EFFECT_PRIMITIVES);
    // Melee slashes: a third of a ring, centred on +x before rotation.
    this.slashes = this.createPool(
      new THREE.RingGeometry(0.75, 1, 16, 1, -Math.PI / 3, (Math.PI * 2) / 3).rotateX(-Math.PI / 2),
      glow(),
      MAX_EFFECT_PRIMITIVES,
    );
    // Health bars: camera-facing quads drawn over everything, in instance order.
    this.bars = this.createPool(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }),
      MAX_HEALTH_BARS * 3,
    );
    this.bars.renderOrder = 9;
    this.scene.add(this.beams, this.rings, this.bolts, this.slashes, this.bars);
    for (let index = 0; index < MAX_COMBAT_TEXT; index++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 10;
      sprite.visible = false;
      this.combatSprites.push(sprite);
      this.scene.add(sprite);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 400;
    this.controls.addEventListener("change", this.handleControlsChange);

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.resize();
    this.resetCamera(false);
  }

  setGround(ground: MapSceneGround) {
    const { canvas, overlays, iconBaseUrl } = ground;
    const key = `${iconBaseUrl}|${canvas.width}x${canvas.height}|${canvas.tiles.map((tile) => tile.fileDataID).join(",")}|${overlays?.map((overlay) => overlay.id).join(",") ?? ""}`;
    if (key === this.groundKey) return;
    const aspectChanged = this.groundKey === "" || canvas.height / canvas.width !== this.aspect;
    this.groundKey = key;
    this.aspect = canvas.height / canvas.width;
    this.clearGround();

    const depth = GROUND_WIDTH * this.aspect;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_WIDTH, depth).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x11100d }),
    );
    backdrop.position.y = -0.02;
    this.groundGroup.add(backdrop);

    // Same fractions as tilePlacement / overlayTilePlacement in mapGallery.
    const addTile = (tile: WowMapTile, left: number, top: number, width: number, height: number, y: number) => {
      // The 2D view clips tiles that overhang the canvas; crop them the same way.
      const croppedWidth = Math.min(width, 1 - left);
      const croppedHeight = Math.min(height, 1 - top);
      if (croppedWidth <= 0 || croppedHeight <= 0) return;
      const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(croppedWidth * GROUND_WIDTH, croppedHeight * depth).rotateX(-Math.PI / 2),
        material,
      );
      mesh.position.set(
        (left + croppedWidth / 2 - 0.5) * GROUND_WIDTH,
        y,
        (top + croppedHeight / 2 - 0.5) * depth,
      );
      // Hidden until textured so pending or failed tiles show the backdrop.
      mesh.visible = false;
      this.groundGroup.add(mesh);
      this.textureLoader.load(corsTextureUrl(mapAssetUrl(iconBaseUrl, tile.path)), (texture) => {
        if (this.disposed || mesh.parent !== this.groundGroup) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.repeat.set(croppedWidth / width, croppedHeight / height);
        texture.offset.set(0, 1 - croppedHeight / height);
        material.map = texture;
        material.needsUpdate = true;
        mesh.visible = true;
        this.requestRender();
      });
    };

    for (const tile of canvas.tiles) {
      addTile(
        tile,
        tile.column * canvas.tileWidth / canvas.width,
        tile.row * canvas.tileHeight / canvas.height,
        canvas.tileWidth / canvas.width,
        canvas.tileHeight / canvas.height,
        0,
      );
    }
    const layer = canvas as WowMapLayer;
    for (const overlay of overlays ?? []) {
      for (const tile of overlay.tiles) {
        addTile(
          tile,
          (overlay.offsetX + tile.column * 256) / layer.width,
          (overlay.offsetY + tile.row * 256) / layer.height,
          256 / layer.width,
          256 / layer.height,
          0.01,
        );
      }
    }
    if (aspectChanged) this.setViewport(this.viewport);
    this.requestRender();
  }

  setUnits(units: MapScene3DUnit[]) {
    const seen = new Set<string>();
    for (const unit of units) {
      seen.add(unit.guid);
      let object = this.units.get(unit.guid);
      if (object && object.kind !== unit.kind) {
        this.removeUnit(unit.guid);
        object = undefined;
      }
      if (!object) object = this.addUnit(unit);
      object.name = unit.name;
      object.color = unit.color;
      object.health = unit.health;
      const { x, z } = mapPointToScene(unit.point, this.aspect, GROUND_WIDTH);
      object.base.set(x, 0, z);
      object.group.position.copy(object.base);
      object.group.rotation.y = unit.facing;
      object.group.scale.setScalar(this.unitScale);
      const opacity = unit.muted ? MUTED_OPACITY : 1;
      for (const material of [object.bodyMaterial, object.coneMaterial]) {
        material.opacity = opacity;
        material.depthWrite = !unit.muted;
      }
      object.bodyMaterial.color.set(object.dead ? DEAD_COLOR : unit.color);
    }
    for (const guid of [...this.units.keys()]) {
      if (!seen.has(guid)) this.removeUnit(guid);
    }
    this.updateLabel();
    this.requestRender();
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
    this.clock.at = performance.now();
    this.clock.playing = playing;
    this.clock.speed = speed;
    this.requestRender();
  }

  /** Frames `viewport` (artwork fractions) from the current viewing angle. */
  setViewport(viewport: MapViewport) {
    this.viewport = viewport;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.applyViewport(offset.lengthSq() > 0 ? offset.normalize() : ANGLED_OFFSET.clone().normalize());
  }

  /** Re-frames the current viewport straight down (`topDown`) or angled. */
  resetCamera(topDown: boolean) {
    this.applyViewport((topDown ? TOP_DOWN_OFFSET : ANGLED_OFFSET).clone().normalize());
  }

  // The full map at zoom 1 sits at the default angled distance; zoom moves
  // the camera proportionally closer along `direction`.
  private applyViewport(direction: THREE.Vector3) {
    const { x, z } = mapPointToScene(
      { leftPercent: this.viewport.centerX * 100, topPercent: this.viewport.centerY * 100 },
      this.aspect,
      GROUND_WIDTH,
    );
    this.controls.target.set(x, 0, z);
    this.camera.position.copy(direction.multiplyScalar(this.baseDistance() / this.viewport.zoom)).add(this.controls.target);
    this.controls.update();
    this.updateUnitScale();
    this.requestRender();
  }

  private baseDistance(): number {
    return Math.max(GROUND_WIDTH, GROUND_WIDTH * this.aspect) * ANGLED_OFFSET.length();
  }

  // Units are world meshes, so scale them with camera distance to hold a
  // constant on-screen size: zooming in spreads them apart instead of
  // enlarging them. Scale 1 at the default full-map distance.
  private updateUnitScale() {
    const scale = this.camera.position.distanceTo(this.controls.target) / this.baseDistance();
    if (scale === this.unitScale) return;
    this.unitScale = scale;
    for (const object of this.units.values()) object.group.scale.setScalar(scale);
    this.updateLabel();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.handleControlsChange);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    for (const guid of [...this.units.keys()]) this.removeUnit(guid);
    this.clearLabel();
    this.clearGround();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.beams.geometry.dispose();
    this.beams.material.dispose();
    for (const pool of [this.rings, this.bolts, this.slashes, this.bars]) {
      pool.geometry.dispose();
      pool.material.dispose();
      pool.dispose();
    }
    for (const sprite of this.combatSprites) sprite.material.dispose();
    for (const { texture } of this.labelTextures.values()) texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  private addUnit(unit: MapScene3DUnit): UnitObject {
    const bodyMaterial = new THREE.MeshLambertMaterial({ transparent: true });
    const coneMaterial = new THREE.MeshLambertMaterial({ color: 0xf5f5f4, transparent: true });
    const body = new THREE.Mesh(this.geometries[unit.kind], bodyMaterial);
    const cone = new THREE.Mesh(this.geometries.cone, coneMaterial);
    const group = new THREE.Group();
    group.userData.guid = unit.guid;
    body.userData.guid = unit.guid;
    group.add(body, cone);
    group.scale.setScalar(this.unitScale);
    this.unitsGroup.add(group);
    const object = {
      group,
      body,
      bodyMaterial,
      coneMaterial,
      cone,
      kind: unit.kind,
      name: unit.name,
      color: unit.color,
      dead: false,
      base: new THREE.Vector3(),
      health: unit.health,
    };
    this.units.set(unit.guid, object);
    return object;
  }

  private removeUnit(guid: string) {
    const object = this.units.get(guid);
    if (!object) return;
    this.unitsGroup.remove(object.group);
    object.bodyMaterial.dispose();
    object.coneMaterial.dispose();
    this.units.delete(guid);
    const wobbling = this.wobbling.indexOf(object);
    if (wobbling >= 0) this.wobbling.splice(wobbling, 1);
    const lunging = this.lunging.indexOf(object);
    if (lunging >= 0) this.lunging.splice(lunging, 1);
    if (this.hoveredGuid === guid) this.hoveredGuid = null;
  }

  // Applies the effects at the effect clock's current time. Returns whether
  // another frame is needed to keep them animating.
  private updateEffects(now: number): boolean {
    for (const object of this.wobbling) {
      object.body.rotation.z = 0;
      object.bodyMaterial.emissive.setRGB(0, 0, 0);
    }
    this.wobbling.length = 0;
    for (const object of this.lunging) object.group.position.copy(object.base);
    this.lunging.length = 0;
    const fx = this.effects?.fx ?? null;
    const { clock } = this;
    const cursorMs = clock.playing ? clock.ms + Math.min(now - clock.at, MAX_EXTRAPOLATE_MS) * clock.speed : clock.ms;

    for (const object of this.units.values()) {
      const guid = object.group.userData.guid as string;
      this.setDead(object, fx !== null && isDeadAt(fx, guid, cursorMs));
    }

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
        const y = BEAM_HEIGHT * this.unitScale;
        const brightness = Math.min(1.5, fade * (0.6 + 0.4 * effect.intensity));
        const tailPoint = this.vector.set(from.x + (to.x - from.x) * tail, y, from.z + (to.z - from.z) * tail);
        const headPoint = this.vectorB.set(from.x + (to.x - from.x) * head, y, from.z + (to.z - from.z) * head);
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
        this.beamPositions[offset + 1] = y;
        this.beamPositions[offset + 2] = tailPoint.z;
        this.beamPositions[offset + 3] = headPoint.x;
        this.beamPositions[offset + 4] = y;
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
        const toward = this.vector.subVectors(target.base, source.base);
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
          .setPosition(target.base.x, SLASH_HEIGHT * this.unitScale, target.base.z);
        this.slashes.setMatrixAt(slashCount, this.matrix);
        this.slashes.setColorAt(slashCount, this.color.copy(color).multiplyScalar(fade * Math.min(2, 0.7 + 0.5 * effect.intensity)));
        this.slashEffects[slashCount] = index;
        slashCount++;
      } else if (effect.type === "hit") {
        if (target.dead) continue;
        // Damped shake about the unit's facing axis plus an emissive flash.
        target.body.rotation.z = Math.sin(effect.progress * Math.PI * 6) * 0.3 * fade * Math.min(2, effect.intensity);
        target.bodyMaterial.emissive.copy(color).multiplyScalar(fade * 0.6 * Math.min(2, effect.intensity));
        if (!this.wobbling.includes(target)) this.wobbling.push(target);
      } else if (ringCount < MAX_EFFECT_PRIMITIVES) {
        // "ring": an AoE pulse expanding from the caster; "cast": a ring that
        // closes in on the caster as the cast completes; "impact": a small
        // quick burst under a melee ability's target.
        const radius = (effect.type === "ring"
          ? 1.5 + 6 * effect.progress
          : effect.type === "impact" ? 0.6 + 1.8 * effect.progress : 4 - 2.5 * effect.progress) * this.unitScale;
        const brightness = effect.type === "cast" ? 0.35 + 0.5 * effect.progress : fade * (effect.type === "impact" ? 1.2 : 1);
        const position = target.base;
        this.matrix.makeScale(radius, 1, radius).setPosition(position.x, 0.05, position.z);
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
    this.commitPool(this.rings, ringCount);
    this.commitPool(this.bolts, boltCount);
    this.commitPool(this.slashes, slashCount);
    this.updateCombatText(fx, cursorMs);
    return fx !== null && clock.playing;
  }

  private updateCombatText(fx: EncounterEffects | null, cursorMs: number) {
    const sources = this.effects?.combatTextGuids;
    const texts = fx && sources && sources.size > 0
      ? deriveCombatText(fx, cursorMs, sources, this.effectOptions, MAX_COMBAT_TEXT, this.combatText)
      : this.combatText;
    if (!fx || !sources || sources.size === 0) texts.length = 0;
    let shown = 0;
    for (const text of texts) {
      const target = this.units.get(text.target);
      if (!target) continue;
      const sprite = this.combatSprites[shown];
      const label = this.labelTexture(text.spellName, this.effects!.resolveColor(text.color), text.crit);
      if (sprite.material.map !== label.texture) {
        sprite.material.map = label.texture;
        sprite.material.needsUpdate = true;
      }
      sprite.material.opacity = 1 - text.progress * text.progress;
      const height = COMBAT_TEXT_HEIGHT * (text.crit ? 1.25 : 1) * this.unitScale;
      sprite.scale.set(height * label.aspect, height, 1);
      // Float up from above the bar; stagger labels on the same target.
      const lift = (LABEL_HEIGHT + 0.5 + 2 * text.progress + (shown % 3) * 1.2) * this.unitScale;
      sprite.position.set(target.base.x, lift, target.base.z);
      sprite.visible = true;
      shown++;
    }
    for (let index = shown; index < MAX_COMBAT_TEXT; index++) this.combatSprites[index].visible = false;
  }

  private labelTexture(text: string, color: string, crit: boolean) {
    const key = `${text}|${color}|${crit}`;
    let label = this.labelTextures.get(key);
    if (label) {
      // Re-insert to keep the cache in least-recently-used order.
      this.labelTextures.delete(key);
      this.labelTextures.set(key, label);
      return label;
    }
    label = createTextTexture(crit ? `${text}!` : text, color);
    this.labelTextures.set(key, label);
    if (this.labelTextures.size > MAX_LABEL_TEXTURES) {
      const [oldestKey, oldest] = this.labelTextures.entries().next().value!;
      // Still drawn this frame by another sprite? Keep it one more round.
      if (!this.combatSprites.some((sprite) => sprite.material.map === oldest.texture)) {
        oldest.texture.dispose();
        this.labelTextures.delete(oldestKey);
      }
    }
    return label;
  }

  // Reports the spell effect under the pointer when it changes.
  private updateEffectHover() {
    let hit: { effect: ActiveEffect; key: string } | null = null;
    if (this.pointerInside && this.effects) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
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
    const target = hit ? this.units.get(hit.effect.target) : undefined;
    if (!hit || !target) {
      this.onEffectHover(null);
      return;
    }
    const projected = this.vector.copy(target.base).setY(BEAM_HEIGHT * this.unitScale).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.onEffectHover({
      eventKind: hit.effect.eventKind,
      spellId: hit.effect.spellId,
      spellName: hit.effect.spellName,
      amount: hit.effect.amount,
      x: (projected.x + 1) / 2 * rect.width,
      y: (1 - projected.y) / 2 * rect.height,
    });
  }

  private createPool(geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial, size: number) {
    const pool = new THREE.InstancedMesh(geometry, material, size);
    pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Allocate the colour buffer once, up front.
    for (let index = 0; index < size; index++) pool.setColorAt(index, this.color.setRGB(0, 0, 0));
    pool.count = 0;
    pool.frustumCulled = false;
    return pool;
  }

  private commitPool(pool: THREE.InstancedMesh, count: number) {
    pool.count = count;
    pool.boundingSphere = null;
    if (count === 0) return;
    pool.instanceMatrix.needsUpdate = true;
    pool.instanceColor!.needsUpdate = true;
  }

  // Health bars above the units, facing the camera at a constant screen size.
  private updateBars() {
    const width = BAR_WIDTH * this.unitScale;
    const thickness = BAR_THICKNESS * this.unitScale;
    const padding = BAR_PADDING * this.unitScale;
    const right = this.vectorB.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    let count = 0;
    const quad = (base: THREE.Vector3, from: number, to: number, quadWidth: number, quadHeight: number, color: THREE.Color | number) => {
      const center = this.vector.copy(base).setY(BAR_HEIGHT * this.unitScale).addScaledVector(right, ((from + to) / 2 - 0.5) * width);
      this.matrix.compose(center, this.camera.quaternion, this.scaleVector.set(quadWidth, quadHeight, 1));
      this.bars.setMatrixAt(count, this.matrix);
      this.bars.setColorAt(count, typeof color === "number" ? this.color.setHex(color) : color);
      count++;
    };
    for (const object of this.units.values()) {
      const { health } = object;
      if (!health || count + 3 > MAX_HEALTH_BARS * 3) continue;
      const dead = health.dead || object.dead;
      const fraction = health.max > 0 ? Math.min(1, Math.max(0, health.current / health.max)) : 0;
      const absorb = health.max > 0 ? Math.min(1 - fraction, Math.max(0, health.absorb / health.max)) : 0;
      quad(object.base, 0, 1, width + padding, thickness + padding, dead ? BAR_DEAD : BAR_BACKGROUND);
      if (dead) continue;
      if (fraction > 0) quad(object.base, 0, fraction, width * fraction, thickness, this.color.setStyle(healthBarColor(fraction)));
      if (absorb > 0) quad(object.base, fraction, fraction + absorb, width * absorb, thickness, BAR_ABSORB);
    }
    this.commitPool(this.bars, count);
  }

  // Slain units lie down, grey, until resurrected.
  private setDead(object: UnitObject, dead: boolean) {
    if (object.dead === dead) return;
    object.dead = dead;
    object.body.rotation.x = dead ? -Math.PI / 2 : 0;
    object.body.position.y = dead ? 0.9 : 0;
    object.cone.visible = !dead;
    object.bodyMaterial.color.set(dead ? DEAD_COLOR : object.color);
  }

  private effectColor(css: string): THREE.Color {
    let color = this.effectColors.get(css);
    if (!color) {
      color = new THREE.Color(this.effects?.resolveColor(css) ?? css);
      this.effectColors.set(css, color);
    }
    return color;
  }

  private clearGround() {
    for (const child of [...this.groundGroup.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
      this.groundGroup.remove(mesh);
    }
  }

  private updateLabel() {
    const object = this.hoveredGuid ? this.units.get(this.hoveredGuid) : undefined;
    if (!object) {
      this.clearLabel();
      return;
    }
    if (this.label?.userData.text !== object.name) {
      this.clearLabel();
      this.label = createLabelSprite(object.name);
      this.label.userData.baseScale = this.label.scale.clone();
      this.scene.add(this.label);
    }
    this.label!.scale.copy(this.label!.userData.baseScale as THREE.Vector3).multiplyScalar(this.unitScale);
    this.label!.position.set(object.group.position.x, LABEL_HEIGHT * this.unitScale, object.group.position.z);
  }

  private clearLabel() {
    if (!this.label) return;
    this.scene.remove(this.label);
    this.label.material.map?.dispose();
    this.label.material.dispose();
    this.label = null;
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.units.values()].map((unit) => unit.body), false)[0];
    const guid = (hit?.object.userData.guid as string | undefined) ?? null;
    this.pointerInside = true;
    // The next frame re-picks the effect under the pointer.
    if (this.effects) this.requestRender();
    if (guid === this.hoveredGuid) return;
    this.hoveredGuid = guid;
    this.renderer.domElement.style.cursor = guid ? "pointer" : "";
    this.updateLabel();
    this.requestRender();
  };

  private readonly handlePointerLeave = () => {
    this.pointerInside = false;
    this.requestRender();
    if (!this.hoveredGuid) return;
    this.hoveredGuid = null;
    this.updateLabel();
    this.requestRender();
  };

  private readonly handleControlsChange = () => {
    this.updateUnitScale();
    this.requestRender();
  };

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.onContextLost();
  };

  private readonly resize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  };

  private readonly requestRender = () => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame((now) => {
      this.frame = 0;
      if (this.disposed) return;
      // Only keeps a frame loop running while effects animate (playback);
      // otherwise rendering stays on demand.
      const animating = this.updateEffects(now);
      this.updateBars();
      this.updateEffectHover();
      this.renderer.render(this.scene, this.camera);
      if (animating) this.requestRender();
    });
  };
}

// The 2D view loads the same tiles as plain <img>s, and the CDN's response to
// a request without Origin has no CORS headers and no `Vary: Origin`. The
// browser then reuses that cached response for the texture's CORS request,
// which fails. A distinct query string gives textures their own cache entry.
function corsTextureUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}cors`;
}

function createLabelSprite(text: string): THREE.Sprite {
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
function createTextTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
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
