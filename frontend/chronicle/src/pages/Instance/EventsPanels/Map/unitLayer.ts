/**
 * The unit layer of MapScene3D (chronicle-1977): every unit's token, model or
 * miniature (the boss-mini, guardian-mini, animated game-model and whelp
 * paths kept separate), its animation, scale and placement on the floor
 * (through DungeonWorld, with the no-Z floor tracks), death and visibility,
 * and the trails, owner lines and target lines that follow the replay.
 * Moved verbatim out of MapScene3D.ts; what it reads from the scene and the
 * effects comes through UnitLayerHost.
 */
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loopingWhelpStand } from "./whelpAnimation";
import { BOSS_SPIRE, bossSpireCastGlow, CAST_ARC_TEXTURE_STEPS, DEAD_RING, DEBUFF_PLANE, DISPEL_COLORS, DROP_LINE, ENEMY_RED, guardianWell, HALO_COLORS, MARKS_SCALE, OWNER_LINE, TARGET_LINE, TRAIL_LINE, TOKEN_LAYOUT, type HaloKind } from "./unitTokenArt";
import { UnitTokenTextures } from "./unitTokens";
import { DEAD_COLOR } from "./mapPalette";
import {
  AIRBORNE_YARDS,
  LOGGED_Z_CLEARANCE_YARDS,
} from "./dungeonMeshes";
import { FLOOR_SLICE_MS, FLOOR_TRACK_TOLERANCE_YARDS, floorTrackAt, startFloorTrackBuild, type FloorTrackBuild, type FloorTracks } from "./walkableFloors";
import { mapPointToScene } from "./mapModel";
import {
  deathStartedAt,
  type EncounterEffects,
  type UnitCast,
} from "./replayEffects";
import { deadUnitVisualState } from "./mapDeathVisibility";
import type { MapMarkerKind, MapUnitHealth } from "./useMapScene";
import { publishedModelGeometryScale, publishedModelGroupScale } from "./modelSizing";
import { modelAnimationState, modelAnimationTimeSeconds, selectModelAnimation, usesStaticDeathFallback, type ModelLocomotion } from "./modelAnimation";
import { type MapBodyMaterial } from "./mapMaterials";
import { createUnitCalloutMarker } from "./sceneFactories";
import { bakedGeometry, disposeModelMaterials, gltfLoader, loadAnimatedGameModel, loadFlappingWhelp, loadGameModelAnimationPack } from "./sceneLoaders";
import { GROUND_WIDTH } from "./sceneConstants";
import { frameStepSeconds } from "./mapControls";
import { DungeonWorld, type DungeonMesh } from "./dungeonWorld";
import type { MapSceneFollowSource, MapScene3DTrailPoint, MapScene3DUnit, MapUnitRoles } from "./MapScene3D";
import { BAR_HEIGHT, TOKEN_RADIUS } from "./sceneConstants";

const MUTED_OPACITY = TOKEN_LAYOUT.mutedOpacity;

const LABEL_HEIGHT = 5;

// Published tabletop models have a 1-unit footprint; modelSizing scales them
// a little wider than the 1.8-unit hostile box so they read at boss-fight zoom.
// The minis face +z (glTF front); the facing cone and WoW facing use -z.
const BOSS_MINI_YAW = Math.PI;

// Gap between the top of a boss mini and its health bar.
const BOSS_MINI_BAR_GAP = 0.6;

// Lift that keeps a dead (lying) primitive body above the ground.
const DEAD_LIFT = 0.9;

// Legacy fallback for published models without a client-derived world height.
// Guardians (pets, totems) keep a player's scale: they stand on their chip.
const MESH_BOSS_SCALE = 2.5;

// A guardian's model is grown to at least this tall (geometry units; a
// player capsule is 3), so a totem published at its true, tiny size reads.
const MIN_GUARDIAN_MODEL_HEIGHT = 1.2;

// --- Unit tokens: flat discs on the ground (geometry units, as PLAYER_GEOMETRY_HEIGHT) ---
// Sizes come from unitTokenArt, which the map legend page lays its art out with too.
// WoW raid target markers use the same authored art and token-relative scale as map-plan markers.
const RAID_TARGET_MARKER_SIZE = 3.2;

const RAID_TARGET_MARKER_LIFT = 0.25;

const BOSS_TOKEN_RADIUS = TOKEN_LAYOUT.bossRadius;

const MINI_TOKEN_RADIUS = TOKEN_LAYOUT.miniRadius;

// Heights: the shadow and the disc's underside sit just off the floor; the
// rest stack above the disc's face (its underside plus its thickness).
const TOKEN_GROUND = { shadow: 0.12, underside: 0.15 };

const TOKEN_LIFT = { marks: 0.02, debuff: 0.035, arc: 0.05, halo: 0.07 };

const TOKEN_THICKNESS = TOKEN_LAYOUT.thickness;

/** A boss sigil lies flat, at the height a player's disc face would be. */
const SIGIL_FACE = 0.45;

const TOKEN_PLANE = TOKEN_LAYOUT.plane;

const SIGIL_SPIN = TOKEN_LAYOUT.sigilSpin;

// Target lines: ribbon width (geometry units), lift above the floor, and dash period and speed.
const TARGET_LINE_WIDTH = TARGET_LINE.width;

const TARGETS_TARGET_LINE_WIDTH = TARGET_LINE.targetsTargetWidth;

const TARGET_LINE_LIFT = 0.25;

const MAX_OWNER_LINES = 256;

// Movement trail segments drawn at once (every unit's together).
const MAX_TRAIL_SEGMENTS = 8192;

const TARGET_LINE_DASH = TARGET_LINE.dash;

const TARGET_LINE_SPEED = TARGET_LINE.speed;

/** What the no-Z floor tracks were built for. */
interface FloorTrackInputs {
  key: string;
  aspect: number;
  url: string;
  endMs: number;
}

// The flat token parts around a unit's body (the disc itself, until a model replaces it).
export interface UnitToken {
  /** Disc radius in geometry units (PLAYER_GEOMETRY_HEIGHT is a player's height). */
  radius: number;
  /** Height of the disc's face (or the sigil) above the floor. */
  face: number;
  /** The disc's edge: its ring colour, darkening toward the ground. */
  edge: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  shadow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  pin: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  arc: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** A debuffed player's tint and glow, in the dispel type's colour. */
  debuff: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Bosses: the turning tick ring, the sigil under a model, and the crystal while there is none. */
  ticks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  sigil: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  /** A guardian with a model stands on this: its disc's face (paw, ring). */
  chip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  bossSpire: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | null;
}

export interface BossMini {
  geometry: THREE.BufferGeometry;
  /** The model's own materials when every primitive has a base-colour texture; cloned per unit. */
  materials: THREE.MeshStandardMaterial[] | null;
  /** Health bar height, above the model's bounding box. */
  barHeight: number;
  /** Hover label height, the same distance above the bar as for primitives. */
  labelHeight: number;
  /** Lift that keeps the model above the ground while it lies dead. */
  deadLift: number;
}

export interface AnimatedGameModel {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  animationUrl: string;
  packRequested: boolean;
  packLoaded: boolean;
  packFailed: boolean;
  stateKey: string | null;
  clipName: string | null;
}

export interface FlappingWhelp {
  mixer: THREE.AnimationMixer;
  root: THREE.Object3D;
  clipDuration: number;
  phaseSeconds: number;
}

export interface UnitObject {
  group: THREE.Group;
  body: THREE.Mesh;
  calloutMarker: THREE.Sprite | null;
  calloutKey: string;
  // Lambert with the unit's tint, or a textured model's cloned lit/unlit materials.
  bodyMaterial: MapBodyMaterial;
  bodyMaterials: MapBodyMaterial[];
  textured: boolean;
  /** The facing notch (diamonds too, for bosses), turning with the unit. */
  coneMaterial: THREE.MeshBasicMaterial;
  cone: THREE.Mesh;
  token: UnitToken;
  icon: string | null;
  boss: boolean;
  /** The body shows a loaded model rather than the flat disc. */
  mini: boolean;
  healthFraction: number | null;
  powerLevel: { fraction: number; color: string } | null;
  owner: string | undefined;
  /** The log records which way it faces; otherwise enemies face whoever they last hit. */
  loggedFacing: boolean;
  /** An enemy's facing toward the unit it last hit, while the log has none. */
  hitFacing: number | undefined;
  kind: MapMarkerKind;
  name: string;
  color: string;
  dead: boolean;
  /** Replayed position; lunges offset `group.position` from it. */
  base: THREE.Vector3;
  /** The floor under `base`; below it while the unit is in the air. */
  floorY: number;
  /** In the air: the line from the token down to its shadow on the floor (null until first airborne). */
  drop: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  /** Logged world position, retained for encounter-specific fixed geometry. */
  worldX: number;
  worldY: number;
  /** Logged world height (yards), or undefined when the log has none. */
  loggedZ: number | undefined;
  /** The replay time of the drawn sample (MapScene3DUnit.atMs). */
  sampleMs: number | undefined;
  /** `floorY` came from the unit's floor track (no logged height), not a probe. */
  floorTracked: boolean;
  health: MapUnitHealth | null;
  /** The declutter gives it a health bar (hidden while it has a nameplate). */
  bar: boolean;
  /** Published miniature or original-model URL; the primitive shows until it loads. */
  miniatureUrl: string | undefined;
  animationUrl: string | undefined;
  gameModel: boolean;
  locomotion: ModelLocomotion;
  animatedGameModel: AnimatedGameModel | null;
  flapWings: boolean;
  flappingWhelp: FlappingWhelp | null;
  mapScale: number;
  /** Client-derived standing height in world yards. */
  worldHeight: number | undefined;
  barHeight: number;
  labelHeight: number;
  deadLift: number;
  /** Height the model stands at: the floor, or a guardian's chip. */
  modelBase: number;
  /** Its movement trail (MapScene3DUnit.trail), or null for none. */
  trail: MapScene3DTrailPoint[] | null;
  muted: boolean;
}

// Untextured bodies take the unit's colour; textured minis keep their texture
// (white multiply). Both turn grey when dead.
function setBodyColor(object: UnitObject) {
  if (!object.mini) return;
  for (const material of object.bodyMaterials) {
    material.color.set(object.dead ? DEAD_COLOR : object.textured ? 0xffffff : object.color);
  }
}

/** The effect state the units read (and, removing a unit, prune). */
export interface UnitEffects {
  readonly clock: { readonly playing: boolean };
  readonly unitCasts: ReadonlyMap<string, UnitCast>;
  readonly wobbling: UnitObject[];
  readonly lunging: UnitObject[];
  castColor(cast: UnitCast): THREE.Color;
}

/** What the unit layer needs from the scene. */
export interface UnitLayerHost {
  scene: THREE.Scene;
  unitsGroup: THREE.Group;
  world: DungeonWorld;
  tokenTextures: UnitTokenTextures;
  camera: THREE.PerspectiveCamera;
  /** The scene's shared scratch (the same instances the effects and the HUD use). */
  scratch: { color: THREE.Color; matrix: THREE.Matrix4; vector: THREE.Vector3; vectorB: THREE.Vector3 };
  effects: UnitEffects;
  now: () => number;
  requestRender: () => void;
  updatePlates: () => void;
  updateCursor: () => void;
  aspect: () => number;
  disposed: () => boolean;
  dungeonMesh: () => DungeonMesh | null;
  followSource: () => MapSceneFollowSource | null;
  unitScale: () => number;
  worldUnitScale: () => number | null;
  hoveredGuid: () => string | null;
  setHoveredGuid: (guid: string | null) => void;
}

export class UnitLayer {
  // From the host, under the names the moved code uses.
  private readonly host: UnitLayerHost;
  private readonly scene: THREE.Scene;
  private readonly unitsGroup: THREE.Group;
  private readonly world: DungeonWorld;
  private readonly tokenTextures: UnitTokenTextures;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly color: THREE.Color;
  private readonly matrix: THREE.Matrix4;
  private readonly vector: THREE.Vector3;
  private readonly vectorB: THREE.Vector3;
  private readonly clock: { readonly playing: boolean };
  private readonly unitCasts: ReadonlyMap<string, UnitCast>;
  private readonly wobbling: UnitObject[];
  private readonly lunging: UnitObject[];
  private readonly castColor: (cast: UnitCast) => THREE.Color;
  private readonly now: () => number;
  private readonly requestRender: () => void;
  private readonly updatePlates: () => void;
  private readonly updateCursor: () => void;
  readonly units = new Map<string, UnitObject>();
  // Unit miniatures by candidate-URL key: null while loading or after all candidates fail.
  private readonly bossMinis = new Map<string, BossMini | null>();
  // Boss minis still loading, and whether the caller still has asset data in flight (spell icons).
  bossMinisLoading = 0;
  // Floors for the units the log gives no height (chronicle-1597), chosen up
  // front from the follow source's unit tracks, built off the frame loop like
  // the follow track; the last finished build, what it was for, and the build in flight.
  floorTracks: FloorTracks | null = null;
  private floorTracksFor: FloorTrackInputs | null = null;
  private floorBuild: { build: FloorTrackBuild; inputs: FloorTrackInputs; timer: ReturnType<typeof setTimeout> } | null = null;
  // A flat plane (radius 1) lying on the ground, shared by every token part.
  private readonly tokenPlane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  private readonly columnBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // An open cylinder (radius 1, height 1) hanging below y = 0: a disc's edge.
  private readonly tokenEdge = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, -0.5, 0);
  // A boss's crystal while it has no model (radius 1), its tip at y = 0.
  private readonly bossSpire = new THREE.LatheGeometry(BOSS_SPIRE.profile.map(([x, y]) => new THREE.Vector2(x, y)), BOSS_SPIRE.sides);
  roles: MapUnitRoles = { selected: null, target: null, targetsTarget: null, pinned: new Set() };
  private readonly targetLines: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  // Owner lines (guardian -> owner), one segment each, rewritten every frame.
  private readonly ownerLinePositions = new Float32Array(MAX_OWNER_LINES * 6);
  private readonly ownerLineColors = new Float32Array(MAX_OWNER_LINES * 6);
  private readonly ownerLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  // Movement trails, every unit's segments in one buffer; colours carry alpha for the fade.
  private readonly trailPositions = new Float32Array(MAX_TRAIL_SEGMENTS * 6);
  private readonly trailColors = new Float32Array(MAX_TRAIL_SEGMENTS * 8);
  private readonly trailLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private tokenAt = 0;

  constructor(host: UnitLayerHost) {
    this.host = host;
    this.scene = host.scene;
    this.unitsGroup = host.unitsGroup;
    this.world = host.world;
    this.tokenTextures = host.tokenTextures;
    this.camera = host.camera;
    this.color = host.scratch.color;
    this.matrix = host.scratch.matrix;
    this.vector = host.scratch.vector;
    this.vectorB = host.scratch.vectorB;
    this.clock = host.effects.clock;
    this.unitCasts = host.effects.unitCasts;
    this.wobbling = host.effects.wobbling;
    this.lunging = host.effects.lunging;
    this.castColor = (cast) => host.effects.castColor(cast);
    this.now = host.now;
    this.requestRender = host.requestRender;
    this.updatePlates = host.updatePlates;
    this.updateCursor = host.updateCursor;
    const ownerGeometry = new THREE.BufferGeometry();
    ownerGeometry.setAttribute("position", new THREE.BufferAttribute(this.ownerLinePositions, 3).setUsage(THREE.DynamicDrawUsage));
    ownerGeometry.setAttribute("color", new THREE.BufferAttribute(this.ownerLineColors, 3).setUsage(THREE.DynamicDrawUsage));
    ownerGeometry.setDrawRange(0, 0);
    this.ownerLines = new THREE.LineSegments(ownerGeometry, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: OWNER_LINE.opacity,
      depthWrite: false,
    }));
    this.ownerLines.frustumCulled = false;
    this.scene.add(this.ownerLines);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setAttribute("color", new THREE.BufferAttribute(this.trailColors, 4).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setDrawRange(0, 0);
    this.trailLines = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.trailLines.frustumCulled = false;
    this.scene.add(this.trailLines);
  }

  private get aspect(): number {
    return this.host.aspect();
  }
  private get disposed(): boolean {
    return this.host.disposed();
  }
  private get dungeonMesh(): DungeonMesh | null {
    return this.host.dungeonMesh();
  }
  private get followSource(): MapSceneFollowSource | null {
    return this.host.followSource();
  }
  private get unitScale(): number {
    return this.host.unitScale();
  }
  private get worldUnitScale(): number | null {
    return this.host.worldUnitScale();
  }
  private get hoveredGuid(): string | null {
    return this.host.hoveredGuid();
  }
  private set hoveredGuid(guid: string | null) {
    this.host.setHoveredGuid(guid);
  }

  setUnits(units: MapScene3DUnit[]) {
    this.ensureFloorTracks();
    const seen = new Set<string>();
    for (const unit of units) {
      seen.add(unit.guid);
      let object = this.units.get(unit.guid);
      const calloutKey = unit.callout ? `${unit.callout.title}|${unit.callout.subtitle}|${unit.callout.marker}` : "";
      if (object && (object.kind !== unit.kind || object.miniatureUrl !== unit.miniatureUrl || object.animationUrl !== unit.animationUrl || object.gameModel !== Boolean(unit.gameModel) || object.mapScale !== (unit.mapScale ?? 1) || object.worldHeight !== unit.worldHeight || object.calloutKey !== calloutKey || object.flapWings !== Boolean(unit.flapWings))) {
        this.removeUnit(unit.guid);
        object = undefined;
      }
      if (!object) object = this.addUnit(unit);
      object.name = unit.name;
      object.health = unit.health;
      object.bar = Boolean(unit.bar);
      object.worldX = unit.worldX;
      object.worldY = unit.worldY;
      object.loggedZ = unit.z;
      object.sampleMs = unit.atMs;
      object.locomotion = unit.locomotion ?? "Stand";
      object.healthFraction = unit.healthFraction ?? null;
      object.powerLevel = unit.power ?? null;
      object.owner = unit.owner;
      object.trail = unit.trail && unit.trail.length > 1 ? unit.trail : null;
      object.muted = unit.muted;
      if (object.color !== unit.color || object.icon !== (unit.icon ?? null)) {
        object.color = unit.color;
        object.icon = unit.icon ?? null;
        this.applyTokenFace(object);
      }
      const { x, z } = mapPointToScene(unit.point, this.aspect, GROUND_WIDTH);
      this.placeUnit(unit.guid, object, x, z);
      object.loggedFacing = unit.facing !== undefined;
      const dispel = object.dead ? null : unit.dispel ?? null;
      object.token.debuff.visible = dispel !== null;
      if (dispel) object.token.debuff.material.color.set(DISPEL_COLORS[dispel]);
      // Without a logged facing an enemy keeps facing whoever it last hit (updateTokens).
      this.applyFacing(object, unit.facing ?? (unit.kind === "hostile" ? object.hitFacing : undefined));
      object.group.scale.setScalar(this.scaleOf(object));
      this.layoutDrop(object);
      const opacity = unit.muted ? MUTED_OPACITY : 1;
      for (const material of object.bodyMaterials) {
        material.opacity = opacity;
        material.depthWrite = !unit.muted && object.mini;
      }
      object.coneMaterial.opacity = opacity;
      object.token.shadow.material.opacity = opacity;
      object.token.edge.material.opacity = opacity;
      if (object.token.chip) object.token.chip.material.opacity = opacity;
      setBodyColor(object);
    }
    for (const guid of [...this.units.keys()]) {
      if (!seen.has(guid)) this.removeUnit(guid);
    }
    this.updatePlates();
    this.requestRender();
  }

  // Client-sized models use true world yards on calibrated maps. On artwork
  // without yard calibration, keep the old readable baseline instead.
  scaleOf(object: UnitObject): number {
    if (object.worldHeight !== undefined) return publishedModelGroupScale(object.worldHeight, this.worldUnitScale, this.unitScale);
    return this.dungeonMesh && object.miniatureUrl && object.kind !== "pet" ? this.unitScale * MESH_BOSS_SCALE : this.unitScale;
  }

  // Puts the unit at (x, z) on the mesh floor while it shows, else at 0. A
  // logged height (`loggedZ`, yards) picks the floor nearest below it, and
  // lifts the unit off it when well above (a knock-up, a fall). Without one,
  // the unit's floor track picks a floor it can walk to (until the track is
  // built, or off it, the highest floor as before).
  placeUnit(guid: string, object: UnitObject, x: number, z: number) {
    const mesh = this.dungeonMesh;
    const loggedZ = object.loggedZ;
    const tracked = mesh && loggedZ === undefined ? this.trackedFloor(guid, object, x, z, mesh.scale) : null;
    const floor = !mesh ? 0 : tracked ?? this.world.unitFloorHeights.heightAt(guid, x, z, this.probeCeiling(loggedZ, mesh.scale));
    object.floorTracked = tracked !== null;
    const logged = mesh && loggedZ !== undefined ? loggedZ * mesh.scale : null;
    const y = mesh && logged !== null && logged - floor > AIRBORNE_YARDS * mesh.scale ? logged : floor;
    object.floorY = floor;
    object.base.set(x, y, z);
    object.group.position.copy(object.base);
    this.layoutDrop(object);
  }

  // In the air, the shadow stays on the floor and a thin line joins it to
  // the token; both sit in the token's group, so in its (scaled) units.
  layoutDrop(object: UnitObject) {
    const scale = object.group.scale.y || 1;
    const drop = (object.base.y - object.floorY) / scale;
    object.token.shadow.position.y = TOKEN_GROUND.shadow - drop;
    if (drop <= 0) {
      if (object.drop) object.drop.visible = false;
      return;
    }
    if (!object.drop) {
      object.drop = new THREE.Mesh(this.columnBox, new THREE.MeshBasicMaterial({
        color: DROP_LINE.color, transparent: true, opacity: DROP_LINE.opacity, depthWrite: false,
      }));
      object.group.add(object.drop);
    }
    object.drop.visible = true;
    object.drop.scale.set(DROP_LINE.width, drop + TOKEN_GROUND.underside - TOKEN_GROUND.shadow, DROP_LINE.width);
    object.drop.position.y = TOKEN_GROUND.shadow - drop;
  }

  // Where a probe for a logged height starts (scene units): just above the
  // unit's feet, so the roof or canopy over it is not hit.
  probeCeiling(loggedZ: number | undefined, scale: number): number | undefined {
    return loggedZ === undefined ? undefined : (loggedZ + LOGGED_Z_CLEARANCE_YARDS) * scale;
  }

  // The unit's floor from its track (no logged height), or null while there
  // is none for it here (not built yet, other data, no floor on its path).
  private trackedFloor(guid: string, object: UnitObject, x: number, z: number, scale: number): number | null {
    const track = this.floorTracks?.units.get(guid);
    if (!track || object.sampleMs === undefined) return null;
    return floorTrackAt(track, object.sampleMs, x, z, FLOOR_TRACK_TOLERANCE_YARDS * scale);
  }

  // Keeps the no-Z floor tracks current: a new source, aspect or mesh drops
  // the old tracks and builds new ones; more streamed data rebuilds once the
  // build in flight (if any) is done, the old tracks serving meanwhile.
  ensureFloorTracks() {
    const mesh = this.dungeonMesh;
    const source = this.followSource;
    if (!mesh || !source?.unitTracks) {
      if (this.floorBuild) clearTimeout(this.floorBuild.timer);
      this.floorBuild = null;
      this.floorTracks = null;
      this.floorTracksFor = null;
      return;
    }
    const inputs: FloorTrackInputs = { key: source.key, aspect: this.aspect, url: mesh.url, endMs: source.endMs };
    const same = (other: FloorTrackInputs | null | undefined) => other !== null && other !== undefined
      && other.key === inputs.key && other.aspect === inputs.aspect && other.url === inputs.url;
    const built = this.floorTracksFor;
    if (same(built) && built!.endMs >= inputs.endMs) return;
    if (!same(built)) {
      this.floorTracks = null;
      this.floorTracksFor = null;
    }
    if (same(this.floorBuild?.inputs)) return;
    this.startFloorBuild(source, inputs);
  }

  // Starts (or restarts) the sliced floor-track build for `inputs`; when it
  // is done, every unit is placed again on its tracked floor.
  private startFloorBuild(source: MapSceneFollowSource, inputs: FloorTrackInputs) {
    if (this.floorBuild) clearTimeout(this.floorBuild.timer);
    const mesh = this.dungeonMesh!;
    const { aspect } = inputs;
    const build = startFloorTrackBuild({
      // Projected per unit as the build reaches it, not all up front.
      units: (source.unitTracks?.() ?? []).map((unit) => ({
        guid: unit.guid,
        get samples() {
          return unit.samples.map(({ ms, point }) => ({ ms, ...mapPointToScene(point, aspect, GROUND_WIDTH) }));
        },
      })),
      scale: mesh.scale,
      candidatesAt: (x, z) => this.world.floorCandidates(x, z),
    }, this.now);
    const slice = () => {
      const current = this.floorBuild;
      if (this.disposed || !current || current.build !== build) return;
      if (this.dungeonMesh?.url !== inputs.url) {
        this.floorBuild = null;
        return;
      }
      if (!build.step(FLOOR_SLICE_MS)) {
        current.timer = setTimeout(slice, 0);
        return;
      }
      this.floorBuild = null;
      this.floorTracks = build.result;
      this.floorTracksFor = inputs;
      for (const [guid, object] of this.units) this.placeUnit(guid, object, object.base.x, object.base.z);
      this.requestRender();
      // Data that streamed in meanwhile gets its own build.
      this.ensureFloorTracks();
    };
    this.floorBuild = { build, inputs, timer: setTimeout(slice, 0) };
  }

  private addUnit(unit: MapScene3DUnit): UnitObject {
    const boss = unit.boss === true;
    const radius = boss ? BOSS_TOKEN_RADIUS : TOKEN_RADIUS[unit.kind];
    const overlay = (map: THREE.Texture | null, size: number, lift: number, opacity = 1) => {
      const mesh = new THREE.Mesh(this.tokenPlane, new THREE.MeshBasicMaterial({
        map, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      mesh.scale.setScalar(size);
      mesh.position.y = lift;
      return mesh;
    };
    // The body is the disc (a flat plane) until a model loads into it.
    const bodyMaterial = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const body = new THREE.Mesh(this.tokenPlane, bodyMaterial);
    body.scale.setScalar(boss ? radius * TOKEN_PLANE.sigil : radius);
    const face = boss ? SIGIL_FACE : TOKEN_GROUND.underside + radius * TOKEN_THICKNESS;
    body.position.y = face;
    const edge = new THREE.Mesh(this.tokenEdge, new THREE.MeshBasicMaterial({ map: this.tokenTextures.edge(), transparent: true }));
    edge.scale.set(radius, face - TOKEN_GROUND.underside, radius);
    edge.position.y = face;
    edge.visible = !boss;
    const cone = overlay(null, radius * MARKS_SCALE, face + TOKEN_LIFT.marks);
    const coneMaterial = cone.material;
    const shadow = overlay(this.tokenTextures.shadow(), radius * TOKEN_PLANE.shadow, TOKEN_GROUND.shadow);
    const halo = overlay(null, radius * TOKEN_PLANE.halo, face + TOKEN_LIFT.halo);
    const pin = overlay(this.tokenTextures.halo("pinned"), radius * TOKEN_PLANE.pin, face + TOKEN_LIFT.halo);
    pin.material.color.setHex(HALO_COLORS.pinned);
    const arc = overlay(null, radius * TOKEN_PLANE.arc, face + TOKEN_LIFT.arc);
    const debuff = overlay(this.tokenTextures.debuffTint(), radius * DEBUFF_PLANE, face + TOKEN_LIFT.debuff);
    debuff.visible = false;
    const ticks = boss ? overlay(this.tokenTextures.sigilTicks(), radius * TOKEN_PLANE.ticks * TOKEN_PLANE.sigil, face + TOKEN_LIFT.marks) : null;
    let bossSpire: UnitToken["bossSpire"] = null;
    if (boss) {
      bossSpire = new THREE.Mesh(this.bossSpire, new THREE.MeshLambertMaterial({ color: ENEMY_RED, emissive: BOSS_SPIRE.glow, flatShading: true }));
      bossSpire.scale.setScalar(radius);
      bossSpire.position.y = face;
    }
    const group = new THREE.Group();
    group.userData.guid = unit.guid;
    body.userData.guid = unit.guid;
    group.add(shadow, edge, body, cone, debuff, arc, halo, pin);
    if (ticks) group.add(ticks);
    if (bossSpire) group.add(bossSpire);
    this.unitsGroup.add(group);
    const calloutMarker = unit.callout ? createUnitCalloutMarker(unit.callout, () => this.requestRender()) : null;
    if (calloutMarker) this.scene.add(calloutMarker);
    const object: UnitObject = {
      group,
      body,
      calloutMarker,
      calloutKey: unit.callout ? `${unit.callout.title}|${unit.callout.subtitle}|${unit.callout.marker}` : "",
      bodyMaterial,
      bodyMaterials: [bodyMaterial],
      coneMaterial,
      cone,
      token: { radius, face, edge, shadow, halo, pin, arc, debuff, ticks, sigil: null, chip: null, bossSpire },
      icon: unit.icon ?? null,
      boss,
      mini: false,
      healthFraction: unit.healthFraction ?? null,
      powerLevel: unit.power ?? null,
      owner: unit.owner,
      loggedFacing: unit.facing !== undefined,
      hitFacing: undefined,
      kind: unit.kind,
      name: unit.name,
      color: unit.color,
      textured: false,
      dead: false,
      base: new THREE.Vector3(),
      floorY: 0,
      drop: null,
      worldX: unit.worldX,
      worldY: unit.worldY,
      loggedZ: unit.z,
      sampleMs: unit.atMs,
      floorTracked: false,
      health: unit.health,
      bar: Boolean(unit.bar),
      miniatureUrl: unit.miniatureUrl,
      animationUrl: unit.animationUrl,
      gameModel: Boolean(unit.gameModel),
      locomotion: unit.locomotion ?? "Stand",
      animatedGameModel: null,
      flapWings: Boolean(unit.flapWings),
      flappingWhelp: null,
      mapScale: unit.mapScale ?? 1,
      worldHeight: unit.worldHeight,
      barHeight: BAR_HEIGHT,
      labelHeight: LABEL_HEIGHT,
      deadLift: DEAD_LIFT,
      modelBase: 0,
      trail: null,
      muted: unit.muted,
    };
    this.applyTokenFace(object);
    group.scale.setScalar(this.scaleOf(object));
    this.units.set(unit.guid, object);
    if (object.miniatureUrl && object.gameModel && object.animationUrl) {
      this.requestAnimatedGameModel(object);
    } else if (object.miniatureUrl) {
      const mini = this.requestBossMini(object.miniatureUrl, object.gameModel, object.mapScale, object.worldHeight);
      if (mini) this.applyBossMini(object, mini);
    }
    return object;
  }

  // Turns the unit (`facing` radians, or undefined for no known facing). The
  // disc's icon and the cast arc keep north up; the notch turns, and shows
  // only when the facing is known.
  applyFacing(object: UnitObject, facing: number | undefined) {
    const angle = facing ?? 0;
    object.group.rotation.y = angle;
    if (!object.mini) object.body.rotation.y = -angle;
    object.token.arc.rotation.y = -angle;
    object.token.pin.rotation.y = -angle;
    object.cone.visible = facing !== undefined && (object.boss || !object.mini);
  }

  // The disc's face and the notch for the unit's colour, icon and death.
  private applyTokenFace(object: UnitObject) {
    const ring = object.dead ? DEAD_RING : object.color;
    object.coneMaterial.map = this.tokenTextures.facingMarks(object.boss ? ENEMY_RED : ring, object.boss);
    object.coneMaterial.color.setHex(object.dead && object.boss ? 0x777777 : 0xffffff);
    object.coneMaterial.needsUpdate = true;
    object.token.edge.material.color.set(ring);
    if (object.token.chip) {
      const chipMap = this.tokenTextures.disc(null, ring, object.dead, guardianWell(object.name));
      if (object.token.chip.material.map !== chipMap) {
        object.token.chip.material.map = chipMap;
        object.token.chip.material.needsUpdate = true;
      }
    }
    if (object.mini) return;
    const map = object.boss
      ? this.tokenTextures.sigil()
      : this.tokenTextures.disc(object.icon, ring, object.dead, object.kind === "hostile" ? "enemy" : object.kind === "pet" ? guardianWell(object.name) : null);
    if (object.bodyMaterial.map !== map) {
      object.bodyMaterial.map = map;
      object.bodyMaterial.needsUpdate = true;
    }
    object.bodyMaterial.color.setHex(object.boss && object.dead ? 0x777777 : 0xffffff);
  }

  private requestAnimatedGameModel(object: UnitObject) {
    const url = object.miniatureUrl;
    const animationUrl = object.animationUrl;
    if (!url || !animationUrl || object.animatedGameModel) return;
    const guid = object.group.userData.guid as string;
    this.bossMinisLoading++;
    void loadAnimatedGameModel(url).then((template) => {
      if (this.disposed || this.units.get(guid) !== object || object.miniatureUrl !== url || object.animationUrl !== animationUrl) return;
      const root = cloneSkinned(template.scene);
      const nativeHeight = Math.max(1e-3, template.box.max.y - template.box.min.y);
      let scale = publishedModelGeometryScale(true, nativeHeight, object.mapScale, object.worldHeight);
      const guardian = !object.boss && object.kind === "pet";
      if (guardian) scale *= Math.max(1, MIN_GUARDIAN_MODEL_HEIGHT / (nativeHeight * scale));
      root.scale.setScalar(scale);
      root.rotation.y = BOSS_MINI_YAW;
      const materials: MapBodyMaterial[] = [];
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const clone = (source: THREE.Material) => {
          const material = source.clone() as MapBodyMaterial;
          material.transparent = true;
          materials.push(material);
          return material;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      });
      for (const material of object.bodyMaterials) material.dispose();
      const hidden = new THREE.MeshLambertMaterial({ visible: false });
      object.body.material = hidden;
      object.bodyMaterial = materials[0] ?? hidden;
      object.bodyMaterials = [hidden, ...materials];
      object.textured = true;
      object.mini = true;
      object.body.scale.setScalar(1);
      object.body.position.y = 0;
      object.body.rotation.set(0, 0, 0);
      object.modelBase = guardian ? object.token.face : 0;
      root.position.y = object.modelBase - template.box.min.y * scale;
      object.body.add(root);
      this.applyRetainedModelLayout(object, template.box, scale);
      const clips = new Map(template.clips.map((clip) => [clip.name, clip]));
      object.animatedGameModel = {
        root,
        mixer: new THREE.AnimationMixer(root),
        clips,
        animationUrl,
        packRequested: false,
        packLoaded: false,
        packFailed: false,
        stateKey: null,
        clipName: null,
      };
      setBodyColor(object);
      this.applyTokenFace(object);
      this.requestRender();
    }).catch((error) => console.error("Failed to load animated game model", url, error)).finally(() => {
      this.bossMinisLoading--;
      this.requestRender();
    });
  }

  private applyRetainedModelLayout(object: UnitObject, nativeBox: THREE.Box3, scale: number) {
    const { token } = object;
    const guardian = !object.boss && object.kind === "pet";
    if (guardian) {
      if (!token.chip) {
        token.chip = new THREE.Mesh(this.tokenPlane, new THREE.MeshBasicMaterial({
          transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        }));
        token.chip.scale.setScalar(token.radius);
        token.chip.position.y = token.face;
        object.group.add(token.chip);
      }
    } else {
      token.radius = MINI_TOKEN_RADIUS;
      token.edge.visible = false;
      token.face = TOKEN_GROUND.underside;
      token.halo.position.y = token.pin.position.y = token.face + TOKEN_LIFT.halo;
      token.arc.position.y = token.face + TOKEN_LIFT.arc;
      token.debuff.position.y = token.face + TOKEN_LIFT.debuff;
      token.debuff.scale.setScalar(MINI_TOKEN_RADIUS * DEBUFF_PLANE);
      object.cone.position.y = token.face + TOKEN_LIFT.marks;
      if (token.ticks) token.ticks.position.y = token.face + TOKEN_LIFT.marks;
      for (const [part, size] of [[token.halo, TOKEN_PLANE.halo], [token.pin, TOKEN_PLANE.pin], [token.arc, TOKEN_PLANE.arc], [token.shadow, TOKEN_PLANE.shadow]] as const) {
        part.scale.setScalar(MINI_TOKEN_RADIUS * size);
      }
      if (token.bossSpire) token.bossSpire.visible = false;
      if (object.boss && !token.sigil) {
        token.sigil = new THREE.Mesh(this.tokenPlane, new THREE.MeshBasicMaterial({
          map: this.tokenTextures.sigil(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        }));
        token.sigil.scale.setScalar(MINI_TOKEN_RADIUS * TOKEN_PLANE.sigil);
        token.sigil.position.y = token.face;
        token.ticks?.scale.setScalar(MINI_TOKEN_RADIUS * TOKEN_PLANE.sigil);
        object.group.add(token.sigil);
      }
      if (object.boss) object.cone.scale.setScalar(MINI_TOKEN_RADIUS * MARKS_SCALE);
      else object.cone.visible = false;
    }
    const top = object.modelBase + (nativeBox.max.y - nativeBox.min.y) * scale;
    object.barHeight = Math.max(BAR_HEIGHT, top + BOSS_MINI_BAR_GAP);
    object.labelHeight = object.barHeight + LABEL_HEIGHT - BAR_HEIGHT;
    // Static death fallback rotates -z into +y, so lift the back of the model
    // to the floor when a source Death clip is unavailable.
    object.deadLift = object.modelBase - nativeBox.min.z * scale;
  }

  private requestGameModelAnimationPack(object: UnitObject, model: AnimatedGameModel) {
    if (model.packRequested || model.packFailed) return;
    model.packRequested = true;
    const guid = object.group.userData.guid as string;
    this.bossMinisLoading++;
    void loadGameModelAnimationPack(model.animationUrl).then((clips) => {
      if (this.disposed || this.units.get(guid) !== object || object.animatedGameModel !== model) return;
      for (const clip of clips) model.clips.set(clip.name, clip);
      model.packLoaded = true;
      model.stateKey = null;
      this.requestRender();
    }).catch((error) => {
      // Do not retry every render frame. Changing the manifest URL recreates
      // the unit and permits a fresh request.
      model.packFailed = true;
      console.error("Failed to load game-model animation pack", model.animationUrl, error);
    }).finally(() => {
      this.bossMinisLoading--;
      this.requestRender();
    });
  }

  // Returns the published unit model if loaded, starting its load on first use.
  private requestBossMini(url: string, gameModel: boolean, mapScale: number, worldHeight?: number): BossMini | null {
    const cacheKey = `${gameModel ? "game" : "miniature"}:${worldHeight ?? "baseline"}:${mapScale}:${url}`;
    if (this.bossMinis.has(cacheKey)) return this.bossMinis.get(cacheKey) ?? null;
    this.bossMinis.set(cacheKey, null);
    this.bossMinisLoading++;
    void this.loadBossMiniCandidate(url, gameModel, mapScale, worldHeight).then((mini) => {
      this.bossMinisLoading--;
      if (!mini) return;
      if (this.disposed) {
        mini.geometry.dispose();
        for (const material of new Set(mini.materials ?? [])) {
          material.map?.dispose();
          material.dispose();
        }
        return;
      }
      this.bossMinis.set(cacheKey, mini);
      for (const object of this.units.values()) {
        if (object.miniatureUrl === url && object.gameModel === gameModel && object.mapScale === mapScale && object.worldHeight === worldHeight) this.applyBossMini(object, mini);
      }
      this.updatePlates();
      this.requestRender();
    });
    return null;
  }

  // Loads every primitive in a published model as plain float geometry, sized
  // and turned to face -z. Original models commonly split their creature skin
  // across several materials, so preserve a material group for each primitive.
  private async loadBossMiniCandidate(url: string, gameModel: boolean, mapScale: number, worldHeight?: number): Promise<BossMini | null> {
    const sourceMaterials: THREE.Material[] = [];
    try {
      const gltf = await (await gltfLoader()).loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      const geometries: THREE.BufferGeometry[] = [];
      const sourceGeometries = new Set<THREE.BufferGeometry>();
      let allTextured = true;
      gltf.scene.traverse((child) => {
        const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
        if (!mesh.isMesh) return;
        geometries.push(bakedGeometry(mesh));
        sourceGeometries.add(mesh.geometry);
        const source = Array.isArray(mesh.material) ? null : mesh.material;
        sourceMaterials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
        if (!(source instanceof THREE.MeshStandardMaterial) || !source.map) allTextured = false;
      });
      for (const geometry of sourceGeometries) geometry.dispose();
      if (geometries.length === 0) {
        disposeModelMaterials(sourceMaterials);
        return null;
      }
      const mini = mergeGeometries(geometries, allTextured);
      for (const geometry of geometries) geometry.dispose();
      if (!mini) {
        disposeModelMaterials(sourceMaterials);
        return null;
      }
      const materials = allTextured
        ? sourceMaterials.map((material) => material as THREE.MeshStandardMaterial)
        : null;
      if (materials) {
        for (const material of new Set(materials)) material.map!.colorSpace = THREE.SRGBColorSpace;
      } else {
        disposeModelMaterials(sourceMaterials);
        sourceMaterials.length = 0;
      }
      mini.rotateY(BOSS_MINI_YAW);
      mini.computeBoundingBox();
      const nativeBox = mini.boundingBox!;
      const nativeHeight = Math.max(1e-3, nativeBox.max.y - nativeBox.min.y);
      const modelScale = publishedModelGeometryScale(gameModel, nativeHeight, mapScale, worldHeight);
      mini.scale(modelScale, modelScale, modelScale);
      mini.computeBoundingBox();
      if (gameModel) {
        mini.translate(0, -mini.boundingBox!.min.y, 0);
        mini.computeBoundingBox();
      }
      mini.computeBoundingSphere();
      const box = mini.boundingBox!;
      const barHeight = Math.max(BAR_HEIGHT, box.max.y + BOSS_MINI_BAR_GAP);
      const result = {
        geometry: mini,
        materials,
        barHeight,
        labelHeight: barHeight + LABEL_HEIGHT - BAR_HEIGHT,
        // Lying down turns -z into +y, so the back of the model rests on the ground.
        deadLift: -box.min.z,
      };
      sourceMaterials.length = 0;
      return result;
    } catch (error) {
      disposeModelMaterials(sourceMaterials);
      console.error("Failed to load published unit model", url, error);
      return null;
    }
  }

  private requestFlappingWhelp(object: UnitObject) {
    if (!object.flapWings || !object.miniatureUrl || object.flappingWhelp) return;
    const guid = object.group.userData.guid as string;
    const url = object.miniatureUrl;
    void loadFlappingWhelp(url).then((template) => {
      if (this.disposed || this.units.get(guid) !== object || object.miniatureUrl !== url) return;
      const stand = template.clips.find((clip) => clip.name === "Stand");
      if (!stand || stand.duration <= 0) return; // Keep the static model if the clip is absent.
      const wingLoop = loopingWhelpStand(stand);
      const root = cloneSkinned(template.scene);
      const box = new THREE.Box3().setFromObject(template.scene);
      const height = Math.max(1e-3, box.max.y - box.min.y);
      const scale = publishedModelGeometryScale(true, height, object.mapScale, object.worldHeight);
      root.scale.setScalar(scale);
      root.position.y = -box.min.y * scale;
      root.rotation.y = BOSS_MINI_YAW;
      const materials: MapBodyMaterial[] = [];
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const clone = (source: THREE.Material) => {
          const material = source.clone() as MapBodyMaterial;
          material.transparent = true;
          materials.push(material);
          return material;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      });
      for (const material of object.bodyMaterials) material.dispose();
      const hidden = new THREE.MeshLambertMaterial({ visible: false });
      object.body.material = hidden;
      object.bodyMaterial = materials[0] ?? hidden;
      object.bodyMaterials = [hidden, ...materials];
      object.textured = true;
      object.body.add(root);
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(wingLoop).play();
      object.flappingWhelp = { root, mixer, clipDuration: wingLoop.duration, phaseSeconds: parseInt(guid.slice(-4), 16) * 0.071 };
      setBodyColor(object);
      this.requestRender();
    }).catch((error) => console.error("Failed to animate Rookery Whelp", url, error));
  }

  private applyUnitModelMaterials(object: UnitObject, mini: BossMini) {
    const opacity = object.bodyMaterial.opacity;
    if (!mini.materials) {
      const material = object.bodyMaterial;
      material.map = null;
      material.depthWrite = opacity >= 1;
      material.polygonOffset = false;
      material.needsUpdate = true;
      object.body.material = material;
      object.bodyMaterials = [material];
      object.textured = false;
      return;
    }
    const materials = mini.materials.map((source) => {
      const material = source.clone();
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
      return material;
    });
    for (const material of object.bodyMaterials) material.dispose();
    object.body.material = materials.length === 1 ? materials[0]! : materials;
    object.bodyMaterial = materials[0]!;
    object.bodyMaterials = materials;
    object.textured = true;
  }

  private applyBossMini(object: UnitObject, mini: BossMini) {
    if (!object.boss && object.kind === "pet") {
      this.applyGuardianMini(object, mini);
      return;
    }
    object.mini = true;
    object.body.geometry = mini.geometry;
    object.body.scale.setScalar(1);
    object.body.position.y = 0;
    object.body.rotation.set(0, 0, 0);
    this.applyUnitModelMaterials(object, mini);
    const { token } = object;
    token.radius = MINI_TOKEN_RADIUS;
    token.edge.visible = false;
    // A model stands on the floor; its rings lie there too.
    token.face = TOKEN_GROUND.underside;
    token.halo.position.y = token.pin.position.y = token.face + TOKEN_LIFT.halo;
    token.arc.position.y = token.face + TOKEN_LIFT.arc;
    token.debuff.position.y = token.face + TOKEN_LIFT.debuff;
    token.debuff.scale.setScalar(MINI_TOKEN_RADIUS * DEBUFF_PLANE);
    object.cone.position.y = token.face + TOKEN_LIFT.marks;
    if (token.ticks) token.ticks.position.y = token.face + TOKEN_LIFT.marks;
    for (const [part, size] of [[token.halo, TOKEN_PLANE.halo], [token.pin, TOKEN_PLANE.pin], [token.arc, TOKEN_PLANE.arc], [token.shadow, TOKEN_PLANE.shadow]] as const) {
      part.scale.setScalar(MINI_TOKEN_RADIUS * size);
    }
    if (token.bossSpire) token.bossSpire.visible = false;
    if (object.boss && !token.sigil) {
      // The model stands on the sigil.
      token.sigil = new THREE.Mesh(this.tokenPlane, new THREE.MeshBasicMaterial({
        map: this.tokenTextures.sigil(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      token.sigil.scale.setScalar(MINI_TOKEN_RADIUS * TOKEN_PLANE.sigil);
      token.sigil.position.y = token.face;
      token.ticks?.scale.setScalar(MINI_TOKEN_RADIUS * TOKEN_PLANE.sigil);
      object.group.add(token.sigil);
    }
    if (object.boss) object.cone.scale.setScalar(MINI_TOKEN_RADIUS * MARKS_SCALE);
    else object.cone.visible = false;
    setBodyColor(object);
    object.barHeight = mini.barHeight;
    object.labelHeight = mini.labelHeight;
    object.deadLift = mini.deadLift;
    object.modelBase = 0;
    if (object.dead) object.body.position.y = mini.deadLift;
    this.requestFlappingWhelp(object);
  }

  // A guardian's model (a totem, a pet) keeps the guardian's disc as a chip
  // to stand on, with its ring, facing notch, halos and shadow at disc size;
  // a tiny model is grown to MIN_GUARDIAN_MODEL_HEIGHT.
  private applyGuardianMini(object: UnitObject, mini: BossMini) {
    const { token } = object;
    const box = mini.geometry.boundingBox!;
    const scale = Math.max(1, MIN_GUARDIAN_MODEL_HEIGHT / Math.max(1e-3, box.max.y - box.min.y));
    if (!token.chip) {
      token.chip = new THREE.Mesh(this.tokenPlane, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      }));
      token.chip.scale.setScalar(token.radius);
      token.chip.position.y = token.face;
      object.group.add(token.chip);
    }
    object.mini = true;
    object.body.geometry = mini.geometry;
    object.body.scale.setScalar(scale);
    object.body.rotation.set(0, 0, 0);
    object.modelBase = token.face;
    object.deadLift = token.face + mini.deadLift * scale;
    object.body.position.y = object.dead ? object.deadLift : object.modelBase;
    if (object.dead) object.body.rotation.x = -Math.PI / 2;
    this.applyUnitModelMaterials(object, mini);
    setBodyColor(object);
    this.applyTokenFace(object);
    object.barHeight = Math.max(BAR_HEIGHT, token.face + box.max.y * scale + BOSS_MINI_BAR_GAP);
    object.labelHeight = object.barHeight + LABEL_HEIGHT - BAR_HEIGHT;
  }

  private removeUnit(guid: string) {
    const object = this.units.get(guid);
    if (!object) return;
    this.unitsGroup.remove(object.group);
    if (object.calloutMarker) {
      this.scene.remove(object.calloutMarker);
      object.calloutMarker.material.map?.dispose();
      object.calloutMarker.material.dispose();
    }
    if (object.animatedGameModel) {
      object.animatedGameModel.mixer.stopAllAction();
      object.animatedGameModel.mixer.uncacheRoot(object.animatedGameModel.root);
    }
    if (object.flappingWhelp) {
      object.flappingWhelp.mixer.stopAllAction();
      object.flappingWhelp.mixer.uncacheRoot(object.flappingWhelp.root);
    }
    for (const material of object.bodyMaterials) material.dispose();
    object.coneMaterial.dispose();
    const { token } = object;
    for (const part of [token.shadow, token.edge, token.halo, token.pin, token.arc, token.debuff, token.ticks, token.sigil, token.chip]) part?.material.dispose();
    token.bossSpire?.material.dispose();
    object.drop?.material.dispose();
    this.units.delete(guid);
    this.world.floorHeights.delete(guid);
    this.world.unitFloorHeights.delete(guid);
    const wobbling = this.wobbling.indexOf(object);
    if (wobbling >= 0) this.wobbling.splice(wobbling, 1);
    const lunging = this.lunging.indexOf(object);
    if (lunging >= 0) this.lunging.splice(lunging, 1);
    if (this.hoveredGuid === guid) {
      this.hoveredGuid = null;
      this.updateCursor();
    }
  }

  // The whelps' Stand clip flaps even if the replay/video is paused. Their
  // skeletons are independent; the source geometry and textures are shared.
  updateWhelpAnimations(now: number): boolean {
    let active = false;
    for (const object of this.units.values()) {
      const wing = object.flappingWhelp;
      if (!wing || object.dead || !object.group.visible) continue;
      wing.mixer.setTime((now / 1000 + wing.phaseSeconds) % wing.clipDuration);
      active = true;
    }
    return active;
  }

  updateGameModelAnimations(fx: EncounterEffects | null, cursorMs: number): boolean {
    let visible = false;
    for (const object of this.units.values()) {
      const model = object.animatedGameModel;
      if (!model || !object.group.visible) continue;
      visible = true;
      const guid = object.group.userData.guid as string;
      const deadSinceMs = fx ? deathStartedAt(fx, guid, cursorMs) : null;
      const state = modelAnimationState(fx, guid, cursorMs, object.locomotion, this.unitCasts.has(guid), deadSinceMs);
      const clipName = selectModelAnimation(model.clips, state.candidates);
      const needsPack = state.candidates.some((candidate) => candidate !== "Stand")
        && (!clipName || !state.candidates.includes(clipName) || clipName === "Stand");
      if (needsPack) this.requestGameModelAnimationPack(object, model);
      const deathFallback = usesStaticDeathFallback(deadSinceMs, clipName, model.packLoaded || model.packFailed);
      object.body.rotation.x = deathFallback ? -Math.PI / 2 : 0;
      object.body.position.y = deathFallback ? object.deadLift : object.modelBase;
      if (!clipName) continue;
      const clip = model.clips.get(clipName);
      if (!clip || clip.duration <= 0) continue;
      if (model.stateKey !== state.key || model.clipName !== clipName) {
        model.mixer.stopAllAction();
        const action = model.mixer.clipAction(clip);
        action.reset();
        action.clampWhenFinished = !state.loop;
        action.setLoop(state.loop ? THREE.LoopRepeat : THREE.LoopOnce, state.loop ? Infinity : 1);
        action.play();
        model.stateKey = state.key;
        model.clipName = clipName;
      }
      const action = model.mixer.clipAction(clip);
      action.time = modelAnimationTimeSeconds(cursorMs, state.startedAtMs, clip.duration, state.loop);
      model.mixer.update(0);
    }
    return visible && this.clock.playing;
  }

  // Slain totems disappear immediately. Dead non-boss enemies leave their
  // ground frame behind while the loaded 3D model and its shadow fade together.
  // Boss corpses stay fully visible.
  updateDeadUnitVisibility(object: UnitObject, deadSinceMs: number | null, cursorMs: number) {
    const hostileModel = object.mini && object.kind === "hostile";
    const state = deadUnitVisualState(deadSinceMs, cursorMs, {
      boss: object.boss,
      hostileModel,
      totem: object.kind === "pet" && guardianWell(object.name) === "totem",
    });
    object.group.visible = state.unitVisible;
    if (!hostileModel) return;
    object.body.visible = state.modelOpacity > 0;
    for (const material of object.bodyMaterials) {
      material.opacity = state.modelOpacity;
      material.depthWrite = state.modelOpacity >= 1;
    }
    object.token.shadow.material.opacity = state.shadowOpacity;
  }

  // Slain units: a model lies down, grey; a disc greys with a skull. Until resurrected.
  setDead(object: UnitObject, dead: boolean) {
    if (object.dead === dead) return;
    object.dead = dead;
    if (object.mini) {
      // Retained skinned models use their source Death clip; static flattened
      // models still lie down because they have no skeleton to pose.
      if (!object.animatedGameModel) {
        object.body.rotation.x = dead ? -Math.PI / 2 : 0;
        object.body.position.y = dead ? object.deadLift : object.modelBase;
      }
      setBodyColor(object);
    }
    this.applyTokenFace(object);
  }

  /** The target frames' units: halos for the selected chain and pins, and the chain's target lines. */
  setUnitRoles(roles: MapUnitRoles) {
    this.roles = roles;
    this.requestRender();
  }

  // The token parts that follow the replay: cast arcs, halos for the
  // selected chain and pins, the boss sigils' turn, and
  // the chain's target lines.
  updateTokens(now: number) {
    const dt = frameStepSeconds(now, this.tokenAt);
    this.tokenAt = now;
    const { roles } = this;
    for (const [guid, object] of this.units) {
      const { token } = object;
      const cast = object.dead ? undefined : this.unitCasts.get(guid);
      const castColor = cast ? this.castColor(cast) : null;
      token.arc.visible = Boolean(cast);
      if (cast && castColor) {
        const map = this.tokenTextures.castArc(Math.min(CAST_ARC_TEXTURE_STEPS, Math.floor(cast.progress * CAST_ARC_TEXTURE_STEPS)));
        if (token.arc.material.map !== map) {
          token.arc.material.map = map;
          token.arc.material.needsUpdate = true;
        }
        token.arc.material.color.copy(castColor);
      }
      const kind: HaloKind | null = guid === roles.selected ? "selected"
        : guid === roles.target ? "target"
          : guid === roles.targetsTarget ? "targetsTarget" : null;
      token.halo.visible = kind !== null;
      if (kind) {
        const map = this.tokenTextures.halo(kind);
        if (token.halo.material.map !== map) {
          token.halo.material.map = map;
          token.halo.material.needsUpdate = true;
        }
        token.halo.material.color.setHex(HALO_COLORS[kind]);
      }
      token.pin.visible = roles.pinned.has(guid);
      token.pin.material.color.setHex(HALO_COLORS.pinned);
      if (object.calloutMarker) {
        const unitScale = this.scaleOf(object);
        object.calloutMarker.visible = object.group.visible;
        object.calloutMarker.position.set(
          object.group.position.x,
          object.group.position.y + (object.barHeight + RAID_TARGET_MARKER_LIFT) * unitScale,
          object.group.position.z,
        );
        object.calloutMarker.scale.setScalar(RAID_TARGET_MARKER_SIZE * unitScale);
      }
      if (token.ticks) token.ticks.rotation.y = (now / 1000) * SIGIL_SPIN - object.group.rotation.y;
      if (token.bossSpire) {
        const { material } = token.bossSpire;
        token.bossSpire.rotation.y = (now / 1000) * BOSS_SPIRE.spin - object.group.rotation.y;
        material.color.set(object.dead ? BOSS_SPIRE.dead : ENEMY_RED);
        material.emissive.setHex(object.dead ? 0x000000 : BOSS_SPIRE.glow);
        // While casting, it turns and glows in the spell's colour, building as the cast fills.
        if (cast && castColor) {
          const glow = bossSpireCastGlow(cast.progress, now / 1000);
          material.color.lerp(castColor, glow);
          material.emissive.lerp(castColor, glow / 2);
        }
      }
    }
    this.updateTargetLines(dt);
    this.updateOwnerLines();
    this.updateTrails();
  }

  // Each living unit's movement trail, in its colour, fading from the unit
  // back to nothing; dimmer for muted units. It starts at the unit; older
  // points stand at their logged height on the mesh, never below the unit's
  // floor (a swimmer's log sits under the surface), on the flat artwork at 0.
  private updateTrails() {
    const mesh = this.dungeonMesh;
    const lift = OWNER_LINE.lift * this.unitScale;
    let count = 0;
    for (const object of this.units.values()) {
      const trail = object.trail;
      if (!trail || object.dead) continue;
      this.color.set(object.color);
      const opacity = TRAIL_LINE.opacity * (object.muted ? TRAIL_LINE.mutedFactor : 1);
      const last = trail.length - 1;
      for (let index = 0; index < last && count < MAX_TRAIL_SEGMENTS; index++) {
        for (const [slot, at] of [[0, index], [1, index + 1]] as const) {
          const { point, z } = trail[at];
          const scene = mapPointToScene(point, this.aspect, GROUND_WIDTH);
          const y = !mesh ? 0 : at === 0 || z === undefined ? object.base.y : Math.max(z * mesh.scale, object.floorY);
          this.trailPositions.set([scene.x, y + lift, scene.z], count * 6 + slot * 3);
          this.trailColors.set([this.color.r, this.color.g, this.color.b, opacity * (1 - at / last)], count * 8 + slot * 4);
        }
        count++;
      }
    }
    const geometry = this.trailLines.geometry;
    geometry.setDrawRange(0, count * 2);
    geometry.attributes.position.needsUpdate = count > 0;
    geometry.attributes.color.needsUpdate = count > 0;
  }

  // A thin line from each guardian to its owner, in the owner's colour: dim,
  // bright when either end is selected, a target in the chain, or pinned.
  private updateOwnerLines() {
    const { roles } = this;
    const lit = (guid: string) => guid === roles.selected || guid === roles.target || guid === roles.targetsTarget || roles.pinned.has(guid);
    let count = 0;
    const lift = OWNER_LINE.lift * this.unitScale;
    for (const [guid, guardian] of this.units) {
      if (!guardian.owner || count >= MAX_OWNER_LINES) continue;
      const owner = this.units.get(guardian.owner);
      if (!owner || owner.dead || guardian.dead) continue;
      const offset = count * 6;
      const from = guardian.group.position;
      const to = owner.group.position;
      this.ownerLinePositions.set([from.x, from.y + lift, from.z, to.x, to.y + lift, to.z], offset);
      const brightness = lit(guid) || lit(guardian.owner) ? 1 : OWNER_LINE.dim;
      this.color.set(owner.color).multiplyScalar(brightness);
      this.ownerLineColors.set([this.color.r, this.color.g, this.color.b, this.color.r, this.color.g, this.color.b], offset);
      count++;
    }
    const geometry = this.ownerLines.geometry;
    geometry.setDrawRange(0, count * 2);
    geometry.attributes.position.needsUpdate = count > 0;
    geometry.attributes.color.needsUpdate = count > 0;
  }

  // Selected -> its target (dashes in the cast's school colour while casting,
  // the unit's colour otherwise) and target -> target's target (purple dots).
  private updateTargetLines(dt: number) {
    const { roles } = this;
    const shown = (object: UnitObject | undefined) => object?.group.visible ? object : undefined;
    const selected = shown(roles.selected ? this.units.get(roles.selected) : undefined);
    const target = shown(roles.target ? this.units.get(roles.target) : undefined);
    const targetsTarget = shown(roles.targetsTarget ? this.units.get(roles.targetsTarget) : undefined);
    const cast = roles.selected && selected && !selected.dead ? this.unitCasts.get(roles.selected) : undefined;
    const lines: [UnitObject | undefined, UnitObject | undefined, THREE.Color, boolean][] = [
      [selected && !selected.dead ? selected : undefined, target, cast ? this.castColor(cast) : this.color.set(selected?.color ?? "#ffffff").clone(), false],
      [target, targetsTarget && roles.targetsTarget !== roles.selected ? targetsTarget : undefined, new THREE.Color(HALO_COLORS.targetsTarget), true],
    ];
    lines.forEach(([from, to, color, dotted], index) => {
      let line = this.targetLines[index];
      if (!line) {
        const map = this.tokenTextures.dash(dotted).clone();
        map.needsUpdate = true;
        line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        line.renderOrder = 5;
        this.targetLines[index] = line;
        this.scene.add(line);
      }
      line.visible = Boolean(from && to);
      if (!from || !to) return;
      const lift = TARGET_LINE_LIFT * this.unitScale;
      const start = this.vector.copy(from.group.position).setY(from.group.position.y + lift);
      const end = this.vectorB.copy(to.group.position).setY(to.group.position.y + lift);
      const along = end.clone().sub(start);
      const length = along.length();
      if (length < 1e-6) {
        line.visible = false;
        return;
      }
      along.divideScalar(length);
      // A ribbon along the line, turned to face the camera about its own axis.
      const toCamera = this.camera.position.clone().sub(start);
      const normal = toCamera.sub(along.clone().multiplyScalar(toCamera.dot(along))).normalize();
      const side = new THREE.Vector3().crossVectors(normal, along).normalize();
      this.matrix.makeBasis(along, side, normal);
      line.quaternion.setFromRotationMatrix(this.matrix);
      line.position.copy(start).add(end).multiplyScalar(0.5);
      const width = (dotted ? TARGETS_TARGET_LINE_WIDTH : TARGET_LINE_WIDTH) * this.unitScale;
      line.scale.set(length, width, 1);
      const map = line.material.map!;
      const period = TARGET_LINE_DASH * this.unitScale * (dotted ? 0.6 : 1);
      map.repeat.x = length / period;
      map.offset.x -= (dt * TARGET_LINE_SPEED) / (dotted ? 0.6 : 1);
      line.material.color.copy(color);
      line.material.opacity = dotted ? TARGET_LINE.targetsTargetOpacity : TARGET_LINE.opacity;
    });
  }

  dispose() {
    if (this.floorBuild) clearTimeout(this.floorBuild.timer);
    for (const line of this.targetLines) {
      line.geometry.dispose();
      line.material.map?.dispose();
      line.material.dispose();
    }
    this.tokenPlane.dispose();
    this.columnBox.dispose();
    this.tokenEdge.dispose();
    this.bossSpire.dispose();
    for (const guid of [...this.units.keys()]) this.removeUnit(guid);
    for (const mini of this.bossMinis.values()) {
      mini?.geometry.dispose();
      for (const material of new Set(mini?.materials ?? [])) {
        material.map?.dispose();
        material.dispose();
      }
    }
    this.ownerLines.geometry.dispose();
    this.ownerLines.material.dispose();
    this.trailLines.geometry.dispose();
    this.trailLines.material.dispose();
  }
}
