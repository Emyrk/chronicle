import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MeshBVH } from "three-mesh-bvh";
import { mapAssetUrl, type WowMapFloorBounds, type WowMapLayer, type WowMapMeshLiquid } from "@/pages/Technical/mapGallery";
import {
  AIM_AHEAD_FRACTION,
  BOSS_ENGAGE_YARDS,
  CINEMATIC_ELEVATION_DEG,
  CINEMATIC_ELEVATION_STEP_DEG,
  directorFrame,
  DISTANCE_DEAD_ZONE,
  DISTANCE_SMOOTH_SECONDS,
  exceedsDeadZone,
  frameDistance,
  MAX_CINEMATIC_ELEVATION_DEG,
  MIN_FRAME_RADIUS_YARDS,
  smoothDamp,
  snapDampedValue,
  STRAGGLER_CUTOFF_YARDS,
  STRAGGLER_RELEASE_YARDS,
  TARGET_DEAD_ZONE_FRACTION,
  TARGET_SMOOTH_SECONDS,
  type DampedValue,
  type DirectorUnit,
} from "./cameraDirector";
import { MAP_CONTROL_ACTIONS, type MapControlAction } from "./mapControls";
import { clampToRadius, corsAssetUrl, dungeonMeshPlacement, FloorHeightCache } from "./dungeonMeshes";
import { FOCUS_RADIUS_YARDS, FULL_MAP_VIEWPORT, healthBarColor, interpolateViewport, mapPointToScene, MAX_HEALTH_BARS, type MapPoint, type MapViewport } from "./mapModel";
import {
  DEFAULT_EFFECT_OPTIONS,
  deriveActiveEffects,
  deriveCastIcons,
  deriveCombatText,
  deriveRecentHealGain,
  INTERRUPTED_ICON_MS,
  INTERRUPTED_PLAYER_ICON_MS,
  isDeadAt,
  type ActiveEffect,
  type CastIcon,
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
// Recent healing at the end of the fill (tailwind green-200).
const BAR_HEAL = 0xbbf7d0;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const MAX_COMBAT_TEXT = 8;
const COMBAT_TEXT_HEIGHT = 1.8;
// Rendered label textures kept for reuse (spell name + colour).
const MAX_LABEL_TEXTURES = 128;
const DEAD_COLOR = 0x57534e;
// Spell icons above casters: pooled sprites over the bars and combat text.
const MAX_CAST_ICONS = 12;
// About 26 px at the constant on-screen size.
const CAST_ICON_SIZE = 3.4;
// Gap between a caster's health bar and the bottom of its icons.
const CAST_ICON_BAR_GAP = 0.55;
// Gap above the icons for combat text and the hover label.
const CAST_ICON_TOP_GAP = 0.3;
// Above this many icons, all draw at CAST_ICON_CROWDED_SCALE.
const CAST_ICON_CROWDED = 8;
const CAST_ICON_CROWDED_SCALE = 0.8;
// A cast grows in from CAST_ICON_GROW_FROM over this long (replay time).
const CAST_ICON_GROW_MS = 150;
const CAST_ICON_GROW_FROM = 0.75;
// A cast going off pops to CAST_ICON_POP_SCALE and back over this long.
const CAST_ICON_POP_MS = 180;
const CAST_ICON_POP_SCALE = 1.35;
// A white ring flashes around the icon as the cast goes off.
const CAST_ICON_FLASH_MS = 120;
// An interrupted icon (times from the interrupt): a quick impact bump, drains
// to grey and dims, wiggles 3 times by up to +-8 degrees (decaying), then
// fades and shrinks over its last INTERRUPT_FADE_MS. Enemies also float
// "Interrupted" above the icon.
const INTERRUPT_IMPACT_MS = 80;
const INTERRUPT_IMPACT_SCALE = 1.15;
const INTERRUPT_GREY_MS = 150;
const INTERRUPT_BRIGHTNESS = 0.7;
const INTERRUPT_WIGGLE_MS = 240;
const INTERRUPT_WIGGLE = (8 * Math.PI) / 180;
const INTERRUPT_FADE_MS = 300;
const INTERRUPT_SHRINK = 0.85;
const INTERRUPT_LABEL_MS = 550;
const INTERRUPT_LABEL_COLOR = "#c2847e";
const INTERRUPT_LABEL_HEIGHT = 1.6;
// The frozen outline of a cut cast, with a red tick where it was cut.
const CUT_ARC_COLOR = "#78716c";
const CUT_TICK_COLOR = "#ef4444";
// The cast progress outline around an icon, in 5 % steps.
const CAST_ARC_STEPS = 20;
const CAST_ARC_SIZE = 1.25;
const CAST_ARC_OPACITY = 0.7;
// Loaded icon textures kept for reuse, keyed by URL.
const MAX_ICON_TEXTURES = 128;
// A failed icon load is retried after this long (real time).
const ICON_RETRY_MS = 30_000;
// Boss minis have a 1-unit footprint; scaled a little wider than the 1.8-unit
// hostile box so they read at boss-fight zoom.
const BOSS_MINI_SIZE = 2.6;
// The minis face +z (glTF front); the facing cone and WoW facing use -z.
const BOSS_MINI_YAW = Math.PI;
// Gap between the top of a boss mini and its health bar.
const BOSS_MINI_BAR_GAP = 0.6;
// Lift that keeps a dead (lying) primitive body above the ground.
const DEAD_LIFT = 0.9;
// Default camera directions from the target.
const ANGLED_OFFSET = new THREE.Vector3(0, 0.85, 0.75);
// A tiny +z offset keeps OrbitControls' up vector stable while leaving
// artwork-up at the top of the screen, as in the 2D view.
const TOP_DOWN_OFFSET = new THREE.Vector3(0, 1, 0.0001);
const TILES_MAX_DISTANCE = 400;

// --- Dungeon mesh mode (the real cave as the ground, see dungeonMeshes.ts) ---
// On the mesh, units start from true scale: a player capsule stands this tall.
const MESH_PLAYER_HEIGHT_YARDS = 2;
// The player capsule's geometry height (CapsuleGeometry radius 0.9, length 1.2).
const PLAYER_GEOMETRY_HEIGHT = 3;
// Zoomed out, units never shrink below this fraction of their tiles-mode
// (constant on-screen) size, so the raid stays visible without being giants
// at Fit.
const MESH_MIN_SCREEN_SCALE = 0.5;
// Boss minis are this many times a player's true scale on the mesh, so Kresh
// (a 2.6-unit footprint) comes out around 4.5 yd across.
const MESH_BOSS_SCALE = 2.5;
// With a fight focused, the camera can back off to this multiple of the Fit
// distance, and the target can pan this far (yards) from the focus centre.
const MESH_MAX_DISTANCE_FACTOR = 2.5;
const MESH_PAN_RADIUS_YARDS = FOCUS_RADIUS_YARDS;
// Without a focus (full map) the camera can back off to this multiple of the
// mesh's bounding radius.
const MESH_FULL_MAP_DISTANCE_FACTOR = 3;
// The camera stays at least this far (scene units) above the floor beneath it.
const MESH_CAMERA_CLEARANCE = 0.3;
// Floor probes drop from this height (scene units), above any cave surface.
const FLOOR_PROBE_HEIGHT = 100;
// The camera direction the mesh starts from: steeper than ANGLED_OFFSET so
// the rock between the camera and a sunken chamber hides less of the fight.
const MESH_ANGLED_OFFSET = new THREE.Vector3(0, 1.6, 0.75);

// --- Navigation feel (chronicle-1079) ---
// OrbitControls' inertia: the camera coasts to a stop instead of snapping.
const ORBIT_DAMPING = 0.08;
const ORBIT_ROTATE_SPEED = 0.6;
const ORBIT_ZOOM_SPEED = 0.9;
const ORBIT_PAN_SPEED = 0.8;
// Keyboard camera (mapControls): pan as a fraction of the camera distance per
// second, so it feels the same zoomed in or out; rotate in radians per second;
// zoom by e^(rate) per second.
const KEY_PAN_SPEED = 0.6;
const KEY_ROTATE_SPEED = 1.6;
const KEY_ZOOM_SPEED = 1.2;
// A dropped frame never jumps the camera further than this.
const KEY_MAX_STEP_S = 0.1;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// A click inspects a unit unless the pointer moved this far (a drag) or a
// double-click follows within this long.
const UNIT_CLICK_SLOP_PX = 5;
const UNIT_CLICK_DELAY_MS = 250;
// A double-click eases the camera to what was clicked over this long.
const DOUBLE_CLICK_MS = 450;
// It halves the distance, but never dives closer than this (yards, mesh mode).
const MIN_DOUBLE_CLICK_DISTANCE_YARDS = 10;
// Shift+double-click pulls back instead.
const DOUBLE_CLICK_OUT_FACTOR = 2;
// A Director spring is settled once it is within this fraction of its goal.
const DIRECTOR_SETTLED = 1e-3;
// The longest step the Director's springs take, so a stalled tab does not jump.
const DIRECTOR_MAX_STEP_SECONDS = 0.1;

export type DungeonMeshState = "loading" | "ready" | "failed";

export interface DungeonMeshRequest {
  url: string;
  /** The mesh entry's world-axis bounds: the ground the units project onto, which places the mesh under them. */
  bounds: WowMapFloorBounds;
  /** Tint for the `liquid_*` planes (lava); null keeps the GLB's own water. */
  liquid?: WowMapMeshLiquid | null;
}

/**
 * The cinematic camera is on (mesh mode only): it keeps the boss and the group
 * framed itself, so viewport requests only re-engage it. Null hands the camera
 * back to the viewport framing.
 */
export interface MapSceneDirector {
  /** The hostile units that count as the fight's boss. */
  bossGuids: ReadonlySet<string>;
}

/** The fight the mesh camera is locked to: its centre (artwork point) and Fit zoom. */
export interface MapSceneFocus {
  centre: MapPoint;
  zoom: number;
}

interface DungeonMeshCave {
  mesh: THREE.Mesh;
  bvh: MeshBVH;
  /** World -> mesh-local, for floor probes. */
  inverse: THREE.Matrix4;
}

interface DungeonMesh {
  url: string;
  group: THREE.Group;
  /** The walkable geometry (everything but the water planes). */
  caves: DungeonMeshCave[];
  /** Scene units per yard. */
  scale: number;
  /** Bounding-sphere radius, for the full-map zoom limit. */
  radius: number;
}

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
  /** Published model URL from the shared miniature manifest. */
  miniatureUrl: string | undefined;
}

interface BossMini {
  geometry: THREE.BufferGeometry;
  /** The model's own material when it has a base-colour texture; cloned per unit. */
  material: THREE.MeshStandardMaterial | null;
  /** Health bar height, above the model's bounding box. */
  barHeight: number;
  /** Hover label height, the same distance above the bar as for primitives. */
  labelHeight: number;
  /** Lift that keeps the model above the ground while it lies dead. */
  deadLift: number;
}

interface UnitObject {
  group: THREE.Group;
  body: THREE.Mesh;
  // Lambert with the unit's tint, or a textured mini's cloned material.
  bodyMaterial: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
  textured: boolean;
  coneMaterial: THREE.MeshLambertMaterial;
  cone: THREE.Mesh;
  kind: MapMarkerKind;
  name: string;
  color: string;
  dead: boolean;
  /** Replayed position; lunges offset `group.position` from it. */
  base: THREE.Vector3;
  health: MapUnitHealth | null;
  /** Published miniature URL; the primitive shows until it loads. */
  miniatureUrl: string | undefined;
  barHeight: number;
  labelHeight: number;
  deadLift: number;
}

export interface MapScene3DEffects {
  fx: EncounterEffects | null;
  /** `visibleGuids` is ignored: the scene limits effects to its own units. */
  options: DeriveEffectsOptions;
  /** Resolves effect colours, which may be CSS custom properties. */
  resolveColor: (color: string) => string;
  /** Casters whose recent hits float their spell name; null for none. */
  combatTextGuids: ReadonlySet<string> | null;
  /** Casters whose hits float no spell name (their cast icon shows it); null for none. */
  suppressNameGuids: ReadonlySet<string> | null;
  /** Casters whose casts show a spell icon above them; null for none. */
  castIcons: {
    guids: ReadonlySet<string>;
    /** Casters whose icons are kept first when over the cap (bosses). */
    priorityGuids: ReadonlySet<string> | null;
    /** Enemy casters, whose interrupted casts linger longer and are labelled. */
    enemyGuids: ReadonlySet<string> | null;
    /** The spell's icon URL (a question mark when unknown). */
    iconUrl: (spellId: number) => string;
    /** Shown until a spell's icon loads, or when it fails to. */
    placeholderUrl: string;
  } | null;
  /** Units whose heals (cast or received) float their amount; null for none. */
  healTextGuids: ReadonlySet<string> | null;
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
  // Unit miniatures by candidate-URL key: null while loading or after all candidates fail.
  private readonly bossMinis = new Map<string, BossMini | null>();
  private gltfLoader: Promise<GLTFLoader> | null = null;
  // The real dungeon mesh while "3D map" is on; `dungeonMeshRequest` is the
  // load in flight (a later request or toggle-off abandons it).
  private dungeonMesh: DungeonMesh | null = null;
  private dungeonMeshRequest: { url: string } | null = null;
  private readonly meshLight = new THREE.HemisphereLight(0xfff4e0, 0x6b5a48, 1.2);
  private focus: MapSceneFocus | null = null;
  // Scene point of `focus` at its floor height while the mesh is on.
  private focusCentre: THREE.Vector3 | null = null;
  private readonly floorHeights = new FloorHeightCache((x, z) => this.sampleFloor(x, z));
  private readonly floorRay = new THREE.Ray();
  private constraining = false;
  private label: THREE.Sprite | null = null;
  private hoveredGuid: string | null = null;
  // A click on a unit (inspect it); held briefly so a double-click (zoom) cancels it.
  private onUnitClick: ((guid: string) => void) | null = null;
  private pointerDownAt: { x: number; y: number } | null = null;
  private unitClickTimer = 0;
  private groundKey = "";
  private aspect = 1;
  private viewport: MapViewport = FULL_MAP_VIEWPORT;
  // A re-framing easing the camera from `from` to `this.viewport`.
  private viewAnimation: { from: MapViewport; direction: THREE.Vector3; start: number; duration: number } | null = null;
  // The camera's viewport when the user's current gesture began.
  private gestureStart: MapViewport | null = null;
  private unitScale = 1;
  private frame = 0;
  private disposed = false;

  // --- Cinematic camera, "the Director" (chronicle-1079) ---
  // On while the mesh shows and the framing is the default one: every frame it
  // springs the camera toward a shot holding the boss and the group.
  private director: MapSceneDirector | null = null;
  // The user took the camera; a viewport request (Follow, encounter jump,
  // selection) hands it back.
  private directorPaused = false;
  // A double-clicked unit the shot follows instead of the group.
  private directorSubject: string | null = null;
  // The springs are seeded and following; a re-engage while this is set is a
  // no-op, so the whole run's per-tick follow requests do not restart them.
  private directorRunning = false;
  // The first valid shot after the dungeon mesh loads should be visible immediately;
  // later Director changes keep their cinematic spring.
  private directorSnapPending = false;
  // Springs: the aim point, the distance and the elevation above the horizon.
  private readonly directorX: DampedValue = { value: 0, velocity: 0 };
  private readonly directorZ: DampedValue = { value: 0, velocity: 0 };
  private readonly directorDistance: DampedValue = { value: 0, velocity: 0 };
  private readonly directorElevation: DampedValue = { value: CINEMATIC_ELEVATION_DEG, velocity: 0 };
  // The goal the springs chase; it only moves when the fit leaves the dead zone.
  private readonly directorGoal = { x: 0, z: 0, distance: 0, seeded: false };
  private directorAt = 0;
  // Scratch for the Director's own maths; the effect layer owns `vector`.
  private readonly directorVector = new THREE.Vector3();
  private readonly directorFrom = new THREE.Vector3();
  private readonly directorTo = new THREE.Vector3();
  private readonly directorAim = new THREE.Vector3();
  private readonly directorEye = new THREE.Vector3();
  // Who the last frame held, for the straggler hysteresis.
  private readonly directorInFrame = new Set<string>();
  // Refilled per frame so the Director allocates nothing while it runs.
  private readonly directorUnits: DirectorUnit[] = [];
  // A double-click easing the camera to the point (and distance) clicked.
  private cameraMove: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromDistance: number;
    toDistance: number;
    direction: THREE.Vector3;
    start: number;
  } | null = null;

  // Effects layer: pooled primitives, re-derived from the effect clock on
  // every rendered frame. Nothing here is allocated per frame.
  private effects: MapScene3DEffects | null = null;
  private clock = { ms: 0, at: 0, playing: false, speed: 1 };
  // The effect clock's time at the last updateEffects, for the bars' heal chunk.
  private effectCursorMs = 0;
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
  // Background, fill, heal chunk and absorb quads per bar.
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
  // The window the map lives in: a popped-out panel has its own.
  private readonly keyWindow: Window;
  private readonly heldActions = new Set<MapControlAction>();
  private keyMoveLastMs = 0;
  private hoveredEffectKey = "";
  private readonly onEffectHover: (hover: MapScene3DEffectHover | null) => void;
  private readonly combatText: CombatText[] = [];
  private readonly combatSprites: THREE.Sprite[] = [];
  private readonly labelTextures = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();
  private readonly castIcons: CastIcon[] = [];
  private readonly castSprites: THREE.Sprite[] = [];
  // Progress outlines and go flashes, one per icon sprite.
  private readonly castArcs: THREE.Sprite[] = [];
  // "Interrupted" labels, one per icon sprite.
  private readonly castLabels: THREE.Sprite[] = [];
  // Outline textures by step (index CAST_ARC_STEPS is the full ring), made on
  // first use; cut outlines (grey, red tick) likewise.
  private readonly arcTextures: (THREE.CanvasTexture | undefined)[] = [];
  private readonly cutArcTextures: (THREE.CanvasTexture | undefined)[] = [];
  // Index into castIcons of each shown icon sprite, for hover picking.
  private readonly castSpriteIcons = new Int16Array(MAX_CAST_ICONS);
  // Top of each caster's icons (unscaled height), for text and the hover label.
  private readonly castIconTops = new Map<string, number>();
  private readonly castIconCast = { caster: "", spellId: 0, spellName: "", phase: "casting" as CastIcon["phase"] };
  // Icon textures by URL, in least-recently-used order; a number is the time a load failed.
  private readonly iconTextures = new Map<string, THREE.Texture | "loading" | number>();

  private readonly container: HTMLElement;
  private readonly onContextLost: () => void;
  private readonly onUserViewport: (viewport: MapViewport) => void;
  private readonly onDungeonMesh: (state: DungeonMeshState) => void;

  constructor(
    container: HTMLElement,
    onContextLost: () => void,
    onEffectHover: (hover: MapScene3DEffectHover | null) => void = () => {},
    onUserViewport: (viewport: MapViewport) => void = () => {},
    onDungeonMesh: (state: DungeonMeshState) => void = () => {},
  ) {
    this.container = container;
    this.keyWindow = container.ownerDocument.defaultView ?? window;
    this.onContextLost = onContextLost;
    this.onEffectHover = onEffectHover;
    this.onUserViewport = onUserViewport;
    this.onDungeonMesh = onDungeonMesh;
    // Throws when WebGL is unavailable; the caller falls back to 2D.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x11100d);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("dblclick", this.handleDoubleClick);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
    this.keyWindow.addEventListener("keydown", this.handleKeyDown);
    this.keyWindow.addEventListener("keyup", this.handleKeyUp);
    this.keyWindow.addEventListener("blur", this.releaseKeys);
    container.appendChild(this.renderer.domElement);

    this.textureLoader.setCrossOrigin("anonymous");
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-30, 80, 40);
    this.scene.add(sun);
    // Lifts the cave's albedo textures (roughness 1, no vertex colour) while the mesh is on.
    this.meshLight.visible = false;
    this.scene.add(this.meshLight);
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
      MAX_HEALTH_BARS * 4,
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
    for (let index = 0; index < MAX_CAST_ICONS; index++) {
      const sprite = new THREE.Sprite(createIconMaterial());
      sprite.renderOrder = 11;
      sprite.visible = false;
      this.castSprites.push(sprite);
      const arc = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
      arc.renderOrder = 12;
      arc.visible = false;
      this.castArcs.push(arc);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      label.center.set(0.5, 0);
      label.renderOrder = 12;
      label.visible = false;
      this.castLabels.push(label);
      this.scene.add(sprite, arc, label);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = TILES_MAX_DISTANCE;
    // Inertia on orbit and pan, and the wheel zooming toward the cursor rather
    // than the orbit target; the render loop keeps ticking until it settles.
    this.controls.enableDamping = true;
    this.controls.dampingFactor = ORBIT_DAMPING;
    this.controls.zoomToCursor = true;
    this.controls.rotateSpeed = ORBIT_ROTATE_SPEED;
    this.controls.zoomSpeed = ORBIT_ZOOM_SPEED;
    this.controls.panSpeed = ORBIT_PAN_SPEED;
    this.controls.addEventListener("change", this.handleControlsChange);
    this.controls.addEventListener("start", this.handleControlsStart);
    this.controls.addEventListener("end", this.handleControlsEnd);

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.resize();
    this.resetCamera(false);
  }

  setGround(ground: MapSceneGround) {
    const { canvas, overlays, iconBaseUrl } = ground;
    const rendered = "source" in canvas;
    const key = `${iconBaseUrl}|${canvas.width}x${canvas.height}|${rendered ? canvas.path : canvas.tiles.map((tile) => tile.fileDataID).join(",")}|${overlays?.map((overlay) => overlay.id).join(",") ?? ""}`;
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
    const addTile = (path: string, left: number, top: number, width: number, height: number, y: number) => {
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
      this.textureLoader.load(corsAssetUrl(mapAssetUrl(iconBaseUrl, path)), (texture) => {
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

    if (rendered) {
      // A rendered instance map is one image covering the whole canvas.
      addTile(canvas.path, 0, 0, 1, 1, 0);
    } else {
      for (const tile of canvas.tiles) {
        addTile(
          tile.path,
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
            tile.path,
            (overlay.offsetX + tile.column * 256) / layer.width,
            (overlay.offsetY + tile.row * 256) / layer.height,
            256 / layer.width,
            256 / layer.height,
            0.01,
          );
        }
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
      if (object && (object.kind !== unit.kind || object.miniatureUrl !== unit.miniatureUrl)) {
        this.removeUnit(unit.guid);
        object = undefined;
      }
      if (!object) object = this.addUnit(unit);
      object.name = unit.name;
      object.color = unit.color;
      object.health = unit.health;
      const { x, z } = mapPointToScene(unit.point, this.aspect, GROUND_WIDTH);
      object.base.set(x, this.baseHeight(unit.guid, x, z), z);
      object.group.position.copy(object.base);
      object.group.rotation.y = unit.facing;
      object.group.scale.setScalar(this.scaleOf(object));
      const opacity = unit.muted ? MUTED_OPACITY : 1;
      for (const material of [object.bodyMaterial, object.coneMaterial]) {
        material.opacity = opacity;
        material.depthWrite = !unit.muted;
      }
      setBodyColor(object);
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

  /**
   * Swaps the tiles for the real dungeon mesh (`request`), loading it on first
   * use, or back to the tiles with `null`. Reports loading / ready / failed
   * through `onDungeonMesh`; a failed load leaves the tiles showing.
   */
  setDungeonMesh(request: DungeonMeshRequest | null) {
    const current = this.dungeonMesh?.url ?? this.dungeonMeshRequest?.url ?? null;
    if ((request?.url ?? null) === current) return;
    this.dungeonMeshRequest = null;
    this.directorRunning = false;
    this.directorSubject = null;
    if (this.dungeonMesh) {
      disposeDungeonMesh(this.dungeonMesh);
      this.scene.remove(this.dungeonMesh.group);
      this.dungeonMesh = null;
    }
    if (!request) {
      this.applyGroundMode();
      this.viewAnimation = null;
      this.placeCamera(this.viewport, ANGLED_OFFSET.clone().normalize());
      return;
    }
    const pending = { url: request.url };
    this.dungeonMeshRequest = pending;
    this.onDungeonMesh("loading");
    void this.loadDungeonMesh(request).then((mesh) => {
      if (this.disposed || this.dungeonMeshRequest !== pending) {
        if (mesh) disposeDungeonMesh(mesh);
        return;
      }
      this.dungeonMeshRequest = null;
      if (!mesh) {
        this.onDungeonMesh("failed");
        return;
      }
      this.dungeonMesh = mesh;
      this.scene.add(mesh.group);
      this.applyGroundMode();
      this.viewAnimation = null;
      this.placeCamera(this.viewport, MESH_ANGLED_OFFSET.clone().normalize());
      // Start on the first valid cinematic shot immediately. The mesh already
      // had an asynchronous load; making the camera spend another few seconds
      // springing in from the overview makes the replay feel unnecessarily slow.
      this.directorRunning = false;
      if (this.director) this.engageDirector(true);
      this.onDungeonMesh("ready");
    });
  }

  /**
   * The fight the mesh camera stays on (null for the whole map): zoom is
   * capped at a multiple of its Fit distance and panning at
   * MESH_PAN_RADIUS_YARDS from its centre. Ignored while the tiles show.
   */
  setFocus(focus: MapSceneFocus | null) {
    this.focus = focus;
    this.updateCameraLimits();
  }

  /**
   * Turns the cinematic camera on (the default framing) or off (the user
   * pinned a viewport). It only drives the camera while the dungeon mesh
   * shows; the tiles keep the viewport framing either way.
   */
  setDirector(director: MapSceneDirector | null) {
    this.director = director;
    if (!director) {
      this.directorRunning = false;
      this.directorSnapPending = false;
      return;
    }
    this.engageDirector();
    this.requestRender();
  }

  // Hands the camera back to the Director, springing from wherever it is now.
  // The first shot after an asynchronous mesh load can opt to snap into place.
  // Already following: nothing to seed, or the springs would stutter.
  private engageDirector(snap = false) {
    this.directorPaused = false;
    this.cameraMove = null;
    if (snap) this.directorSnapPending = true;
    if (this.directorRunning) return;
    this.directorRunning = true;
    this.directorGoal.seeded = false;
    this.directorInFrame.clear();
    this.directorAt = 0;
    const { target } = this.controls;
    this.directorX.value = target.x;
    this.directorZ.value = target.z;
    this.directorX.velocity = 0;
    this.directorZ.velocity = 0;
    this.directorDistance.value = this.camera.position.distanceTo(target);
    this.directorDistance.velocity = 0;
    this.directorElevation.value = this.cameraElevationDeg();
    this.directorElevation.velocity = 0;
  }

  /** Whether the Director is the one moving the camera right now. */
  private directing(): boolean {
    return this.director !== null && this.dungeonMesh !== null && !this.directorPaused && this.cameraMove === null;
  }

  /**
   * Frames `viewport` (artwork fractions) from the current viewing angle,
   * easing there over `durationMs` when it is above zero. While the Director
   * has the camera the request only re-engages it: Follow, an encounter jump
   * and a new selection all come through here.
   */
  setViewport(viewport: MapViewport, durationMs = 0) {
    if (this.director && this.dungeonMesh) {
      this.viewport = viewport;
      this.viewAnimation = null;
      // Back to the group: Follow and encounter jumps drop a followed unit.
      this.directorSubject = null;
      this.engageDirector();
      this.requestRender();
      return;
    }
    const offset = this.camera.position.clone().sub(this.controls.target);
    const direction = offset.lengthSq() > 0 ? offset.normalize() : ANGLED_OFFSET.clone().normalize();
    const from = this.cameraViewport();
    this.viewport = viewport;
    if (durationMs > 0) {
      this.viewAnimation = { from, direction, start: performance.now(), duration: durationMs };
      this.requestRender();
      return;
    }
    this.viewAnimation = null;
    this.placeCamera(viewport, direction);
  }

  /** Re-frames the current viewport straight down (`topDown`) or angled. */
  resetCamera(topDown: boolean) {
    this.viewAnimation = null;
    this.placeCamera(this.viewport, (topDown ? TOP_DOWN_OFFSET : ANGLED_OFFSET).clone().normalize());
  }

  // The full map at zoom 1 sits at the default angled distance; zoom moves
  // the camera proportionally closer along `direction`.
  private placeCamera(viewport: MapViewport, direction: THREE.Vector3) {
    const { x, z } = mapPointToScene(
      { leftPercent: viewport.centerX * 100, topPercent: viewport.centerY * 100 },
      this.aspect,
      GROUND_WIDTH,
    );
    this.controls.target.set(x, this.floorHeights.heightAt("camera-target", x, z), z);
    this.camera.position.copy(direction).multiplyScalar(this.baseDistance() / viewport.zoom).add(this.controls.target);
    this.controls.update();
    this.updateUnitScale();
    this.requestRender();
  }

  // The inverse of placeCamera: the viewport the camera shows now.
  private cameraViewport(): MapViewport {
    const target = this.controls.target;
    return {
      centerX: target.x / GROUND_WIDTH + 0.5,
      centerY: target.z / (GROUND_WIDTH * this.aspect) + 0.5,
      zoom: this.baseDistance() / Math.max(1e-6, this.camera.position.distanceTo(target)),
    };
  }

  // Steps a running re-framing; returns whether it needs another frame.
  private updateViewAnimation(now: number): boolean {
    const animation = this.viewAnimation;
    if (!animation) return false;
    const t = Math.min(1, Math.max(0, (now - animation.start) / animation.duration));
    this.placeCamera(interpolateViewport(animation.from, this.viewport, 1 - (1 - t) ** 3), animation.direction.clone());
    if (t < 1) return true;
    this.viewAnimation = null;
    return false;
  }

  private baseDistance(): number {
    return Math.max(GROUND_WIDTH, GROUND_WIDTH * this.aspect) * ANGLED_OFFSET.length();
  }

  // Units are world meshes, so scale them with camera distance to hold a
  // constant on-screen size: zooming in spreads them apart instead of
  // enlarging them. Scale 1 at the default full-map distance. On the dungeon
  // mesh they hold their true size instead, down to a floor on that
  // on-screen size so the raid stays visible zoomed out.
  private updateUnitScale(force = false) {
    const screenScale = this.camera.position.distanceTo(this.controls.target) / this.baseDistance();
    const mesh = this.dungeonMesh;
    const scale = mesh
      ? Math.max((MESH_PLAYER_HEIGHT_YARDS * mesh.scale) / PLAYER_GEOMETRY_HEIGHT, MESH_MIN_SCREEN_SCALE * screenScale)
      : screenScale;
    if (scale === this.unitScale && !force) return;
    this.unitScale = scale;
    for (const object of this.units.values()) object.group.scale.setScalar(this.scaleOf(object));
    this.updateLabel();
  }

  // Bosses stand larger than players on the mesh; everything else shares unitScale.
  private scaleOf(object: UnitObject): number {
    return this.dungeonMesh && object.miniatureUrl ? this.unitScale * MESH_BOSS_SCALE : this.unitScale;
  }

  // The ground height under a unit: the mesh floor while it shows, else 0.
  private baseHeight(guid: string, x: number, z: number): number {
    return this.dungeonMesh ? this.floorHeights.heightAt(guid, x, z) : 0;
  }

  // The highest cave surface straight below (x, z) in scene units, or null
  // when the probe misses the mesh (or the tiles show).
  private sampleFloor(x: number, z: number): number | null {
    const mesh = this.dungeonMesh;
    if (!mesh) return null;
    let best: number | null = null;
    for (const cave of mesh.caves) {
      this.floorRay.origin.set(x, FLOOR_PROBE_HEIGHT, z);
      this.floorRay.direction.set(0, -1, 0);
      this.floorRay.applyMatrix4(cave.inverse);
      const hit = cave.bvh.raycastFirst(this.floorRay, THREE.FrontSide);
      if (!hit) continue;
      const y = this.vector.copy(hit.point).applyMatrix4(cave.mesh.matrixWorld).y;
      if (best === null || y > best) best = y;
    }
    return best;
  }

  // Loads the mesh, zeroes its centring node translations so it sits in raw
  // WoW coordinates, places it under the artwork projection and builds a BVH
  // per cave mesh for floor probes. Resolves null on any failure.
  private async loadDungeonMesh(request: DungeonMeshRequest): Promise<DungeonMesh | null> {
    try {
      this.gltfLoader ??= createGltfLoader();
      const [loader, { MeshBVH }] = await Promise.all([this.gltfLoader, import("three-mesh-bvh")]);
      const gltf = await loader.loadAsync(corsAssetUrl(request.url));
      for (const node of gltf.scene.children) node.position.set(0, 0, 0);
      const placement = dungeonMeshPlacement(request.bounds, GROUND_WIDTH);
      const group = new THREE.Group();
      group.rotation.y = placement.rotationY;
      group.scale.setScalar(placement.scale);
      group.position.set(placement.x, 0, placement.z);
      group.add(gltf.scene);
      group.updateMatrixWorld(true);
      const caves: DungeonMeshCave[] = [];
      gltf.scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (isLiquid(mesh, gltf.scene)) {
          // Water planes: translucent, drawn after the cave without writing
          // depth; tinted when the entry says the liquid is not water.
          for (const material of materials) {
            material.transparent = true;
            material.depthWrite = false;
            if (request.liquid && "color" in material && material.color instanceof THREE.Color) {
              material.color.set(request.liquid.color);
              material.opacity = request.liquid.opacity;
            }
          }
          mesh.renderOrder = 1;
          return;
        }
        caves.push({ mesh, bvh: new MeshBVH(mesh.geometry), inverse: mesh.matrixWorld.clone().invert() });
      });
      if (caves.length === 0) return null;
      const radius = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere()).radius;
      return { url: request.url, group, caves, scale: placement.scale, radius };
    } catch (error) {
      console.warn("Dungeon mesh unavailable, keeping the map tiles", request.url, error);
      return null;
    }
  }

  // Shows the mesh or the tiles, re-grounds every unit and re-applies the
  // scale and camera limits for the mode.
  private applyGroundMode() {
    const mesh = this.dungeonMesh !== null;
    this.groundGroup.visible = !mesh;
    this.meshLight.visible = mesh;
    this.floorHeights.clear();
    for (const [guid, object] of this.units) {
      object.base.y = this.baseHeight(guid, object.base.x, object.base.z);
      object.group.position.copy(object.base);
    }
    this.updateCameraLimits();
    this.updateUnitScale(true);
    this.requestRender();
  }

  // Zoom and pan limits for the mode and focus; re-targets the floor.
  private updateCameraLimits() {
    const mesh = this.dungeonMesh;
    if (!mesh) {
      this.focusCentre = null;
      this.controls.maxDistance = TILES_MAX_DISTANCE;
      // Back onto the flat ground, camera and target together.
      this.camera.position.y -= this.controls.target.y;
      this.controls.target.y = 0;
    } else if (this.focus) {
      const { x, z } = mapPointToScene(this.focus.centre, this.aspect, GROUND_WIDTH);
      this.focusCentre ??= new THREE.Vector3();
      this.focusCentre.set(x, this.floorHeights.heightAt("focus", x, z), z);
      this.controls.maxDistance = (MESH_MAX_DISTANCE_FACTOR * this.baseDistance()) / this.focus.zoom;
    } else {
      this.focusCentre = null;
      this.controls.maxDistance = MESH_FULL_MAP_DISTANCE_FACTOR * mesh.radius;
    }
    this.constrainCamera();
    this.controls.update();
    this.updateUnitScale();
    this.requestRender();
  }

  // On the mesh: keeps the target within the pan radius of the focus and on
  // the floor, and the camera above the floor beneath it, moving the camera
  // with the target so the view does not swing.
  private constrainCamera() {
    const mesh = this.dungeonMesh;
    if (!mesh || this.constraining) return;
    const { target } = this.controls;
    const { position } = this.camera;
    let moved = false;
    if (this.focusCentre) {
      const clamped = clampToRadius(target, this.focusCentre, MESH_PAN_RADIUS_YARDS * mesh.scale);
      if (clamped !== target) {
        position.x += clamped.x - target.x;
        position.z += clamped.z - target.z;
        target.x = clamped.x;
        target.z = clamped.z;
        moved = true;
      }
    }
    const floor = this.floorHeights.heightAt("camera-target", target.x, target.z);
    if (floor !== target.y) {
      position.y += floor - target.y;
      target.y = floor;
      moved = true;
    }
    const minY = this.floorHeights.heightAt("camera", position.x, position.z) + MESH_CAMERA_CLEARANCE;
    if (position.y < minY) {
      position.y = minY;
      moved = true;
    }
    if (!moved) return;
    this.constraining = true;
    this.controls.update();
    this.constraining = false;
  }

  // The camera's elevation above the horizon, in degrees.
  private cameraElevationDeg(): number {
    const offset = this.directorVector.copy(this.camera.position).sub(this.controls.target);
    return (Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) * 180) / Math.PI;
  }

  // The compass direction the camera looks from; the Director keeps whatever
  // the user last orbited to.
  private cameraYaw(): number {
    const offset = this.directorVector.copy(this.camera.position).sub(this.controls.target);
    return Math.abs(offset.x) + Math.abs(offset.z) < 1e-6 ? 0 : Math.atan2(offset.x, offset.z);
  }

  // Puts the camera `distance` from (x, z) on the floor, `elevationDeg` above
  // the horizon along `yaw`, and re-applies the mesh's floor and pan limits.
  private placeDirectorCamera(x: number, z: number, distance: number, elevationDeg: number, yaw: number) {
    const floor = this.floorHeights.heightAt("camera-target", x, z);
    this.controls.target.set(x, floor, z);
    const elevation = (elevationDeg * Math.PI) / 180;
    this.camera.position.set(
      x + Math.sin(yaw) * Math.cos(elevation) * distance,
      floor + Math.sin(elevation) * distance,
      z + Math.cos(yaw) * Math.cos(elevation) * distance,
    );
    this.controls.update();
    this.constrainCamera();
    this.updateUnitScale();
  }

  // Whether the cave stands between the two points (the camera's line to the fight).
  private meshBlocks(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const mesh = this.dungeonMesh;
    if (!mesh) return false;
    for (const cave of mesh.caves) {
      const origin = this.directorFrom.copy(from).applyMatrix4(cave.inverse);
      const end = this.directorTo.copy(to).applyMatrix4(cave.inverse);
      const length = origin.distanceTo(end);
      if (length <= 1e-6) continue;
      this.floorRay.origin.copy(origin);
      this.floorRay.direction.copy(end).sub(origin).divideScalar(length);
      const hit = cave.bvh.raycastFirst(this.floorRay, THREE.DoubleSide);
      if (hit && hit.distance < length) return true;
    }
    return false;
  }

  // The lowest cinematic elevation with a clear line to the fight, climbing in
  // steps when the cave blocks it; the shot shortens only if even the highest
  // one is blocked.
  private clearShot(x: number, z: number, distance: number, yaw: number): { elevation: number; distance: number } {
    const mesh = this.dungeonMesh;
    const floor = this.floorHeights.heightAt("director-shot", x, z);
    // From the fight's own height, not the floor the ray would graze.
    const from = this.directorAim.set(x, floor + MESH_PLAYER_HEIGHT_YARDS * (mesh?.scale ?? 1), z);
    for (let elevationDeg = CINEMATIC_ELEVATION_DEG; ; elevationDeg += CINEMATIC_ELEVATION_STEP_DEG) {
      const capped = Math.min(elevationDeg, MAX_CINEMATIC_ELEVATION_DEG);
      const elevation = (capped * Math.PI) / 180;
      const to = this.directorEye.set(
        x + Math.sin(yaw) * Math.cos(elevation) * distance,
        floor + Math.sin(elevation) * distance,
        z + Math.cos(yaw) * Math.cos(elevation) * distance,
      );
      if (!this.meshBlocks(from, to)) return { elevation: capped, distance };
      if (capped >= MAX_CINEMATIC_ELEVATION_DEG) {
        // Still blocked overhead: come in closer instead.
        const shortened = Math.max(MIN_DOUBLE_CLICK_DISTANCE_YARDS * (mesh?.scale ?? 1), distance * 0.75);
        return { elevation: capped, distance: shortened };
      }
    }
  }

  // Re-fills the pooled unit list the framing rule reads.
  private readDirectorUnits(bossGuids: ReadonlySet<string>): DirectorUnit[] {
    const units = this.directorUnits;
    let count = 0;
    for (const [guid, object] of this.units) {
      const slot = (units[count] ??= { guid: "", x: 0, z: 0, player: false, boss: false, dead: false });
      slot.guid = guid;
      slot.x = object.base.x;
      slot.z = object.base.z;
      slot.player = object.kind === "player";
      slot.boss = bossGuids.has(guid);
      slot.dead = object.dead || object.health?.dead === true;
      count++;
    }
    units.length = count;
    return units;
  }

  /**
   * One Director step: works out the shot that holds the boss and the group,
   * moves the goal only when the fit leaves the dead zone, and springs the
   * camera toward it. Returns whether the springs still need another frame.
   */
  private updateDirector(now: number): boolean {
    const mesh = this.dungeonMesh;
    const director = this.director;
    if (!mesh || !director || !this.directing()) return false;
    const frame = directorFrame(this.readDirectorUnits(director.bossGuids), this.directorInFrame, {
      stragglerCutoff: STRAGGLER_CUTOFF_YARDS * mesh.scale,
      stragglerRelease: STRAGGLER_RELEASE_YARDS * mesh.scale,
      bossEngageDistance: BOSS_ENGAGE_YARDS * mesh.scale,
      subjectGuid: this.directorSubject,
    });
    const dt = this.directorAt === 0 ? 1 / 60 : Math.min(DIRECTOR_MAX_STEP_SECONDS, (now - this.directorAt) / 1000);
    this.directorAt = now;
    if (!frame) return false;
    this.directorInFrame.clear();
    for (const guid of frame.guids) this.directorInFrame.add(guid);

    const radius = Math.max(frame.radius, MIN_FRAME_RADIUS_YARDS * mesh.scale);
    const yaw = this.cameraYaw();
    // The aim point sits past the fight, away from the camera, so the fight
    // reads below the centre line with the room above it.
    const ahead = AIM_AHEAD_FRACTION * radius;
    const aimX = frame.x - Math.sin(yaw) * ahead;
    const aimZ = frame.z - Math.cos(yaw) * ahead;
    const fitted = frameDistance(frame.radius, {
      verticalFov: (this.camera.fov * Math.PI) / 180,
      aspect: this.camera.aspect,
      elevationDeg: this.directorElevation.value,
      scale: mesh.scale,
    });
    const goal = this.directorGoal;
    if (!goal.seeded) {
      goal.x = aimX;
      goal.z = aimZ;
      goal.distance = fitted;
      goal.seeded = true;
    } else {
      // Dead zones: a fight that stays put keeps the camera still.
      if (Math.hypot(aimX - goal.x, aimZ - goal.z) > TARGET_DEAD_ZONE_FRACTION * radius) {
        goal.x = aimX;
        goal.z = aimZ;
      }
      if (exceedsDeadZone(goal.distance, fitted, DISTANCE_DEAD_ZONE)) goal.distance = fitted;
    }
    const shot = this.clearShot(goal.x, goal.z, goal.distance, yaw);

    if (this.directorSnapPending) {
      this.directorSnapPending = false;
      const x = snapDampedValue(this.directorX, goal.x);
      const z = snapDampedValue(this.directorZ, goal.z);
      const distance = snapDampedValue(this.directorDistance, shot.distance);
      const elevation = snapDampedValue(this.directorElevation, shot.elevation);
      this.placeDirectorCamera(x, z, distance, elevation, yaw);
      return false;
    }

    const x = smoothDamp(this.directorX, goal.x, TARGET_SMOOTH_SECONDS, dt);
    const z = smoothDamp(this.directorZ, goal.z, TARGET_SMOOTH_SECONDS, dt);
    const distance = smoothDamp(this.directorDistance, shot.distance, DISTANCE_SMOOTH_SECONDS, dt);
    const elevation = smoothDamp(this.directorElevation, shot.elevation, TARGET_SMOOTH_SECONDS, dt);
    this.placeDirectorCamera(x, z, distance, elevation, yaw);
    const settled = Math.hypot(x - goal.x, z - goal.z) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(distance - shot.distance) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(elevation - shot.elevation) <= DIRECTOR_SETTLED;
    return !settled;
  }

  // Steps a double-click move; returns whether it needs another frame.
  private updateCameraMove(now: number): boolean {
    const move = this.cameraMove;
    if (!move) return false;
    const t = Math.min(1, Math.max(0, (now - move.start) / DOUBLE_CLICK_MS));
    // easeInOutCubic.
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    const target = this.controls.target.copy(move.from).lerp(move.to, eased);
    const distance = move.fromDistance + (move.toDistance - move.fromDistance) * eased;
    this.camera.position.copy(move.direction).multiplyScalar(distance).add(target);
    this.controls.update();
    this.constrainCamera();
    this.updateUnitScale();
    if (t < 1) return true;
    this.cameraMove = null;
    return false;
  }

  // The scene point under the pointer: a unit's body, else the mesh floor or
  // the ground plane. Null when the ray misses everything.
  private pickScenePoint(event: MouseEvent): { point: THREE.Vector3; guid: string | null } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const unitHit = this.raycaster.intersectObjects([...this.units.values()].map((unit) => unit.body), false)[0];
    if (unitHit) {
      const guid = (unitHit.object.userData.guid as string | undefined) ?? null;
      const object = guid ? this.units.get(guid) : undefined;
      return { point: (object?.base ?? unitHit.point).clone(), guid };
    }
    const mesh = this.dungeonMesh;
    if (mesh) {
      const hit = this.raycaster.intersectObject(mesh.group, true)[0];
      return hit ? { point: hit.point.clone(), guid: null } : null;
    }
    // Tiles: the ground is the y = 0 plane.
    const { origin, direction } = this.raycaster.ray;
    if (direction.y >= -1e-6) return null;
    const along = -origin.y / direction.y;
    const point = new THREE.Vector3().copy(direction).multiplyScalar(along).add(origin);
    const halfWidth = GROUND_WIDTH / 2;
    const halfDepth = (GROUND_WIDTH * this.aspect) / 2;
    if (Math.abs(point.x) > halfWidth || Math.abs(point.z) > halfDepth) return null;
    return { point, guid: null };
  }

  /**
   * Double-click: zoom in on what was clicked, keeping the current orbit
   * direction. A unit hands the shot to the Director, which then follows it;
   * the floor eases the camera there and leaves it to the user. Shift pulls
   * back instead, and empty sky does nothing.
   */
  private readonly handleDoubleClick = (event: MouseEvent) => {
    clearTimeout(this.unitClickTimer);
    const hit = this.pickScenePoint(event);
    if (!hit) return;
    event.preventDefault();
    if (hit.guid && this.director && this.dungeonMesh) {
      this.directorSubject = hit.guid;
      this.engageDirector();
      this.requestRender();
      return;
    }
    const { target } = this.controls;
    const current = this.camera.position.distanceTo(target);
    const closest = this.dungeonMesh
      ? MIN_DOUBLE_CLICK_DISTANCE_YARDS * this.dungeonMesh.scale
      : this.controls.minDistance;
    const wanted = event.shiftKey ? current * DOUBLE_CLICK_OUT_FACTOR : Math.max(closest, current / 2);
    this.directorPaused = true;
    this.directorRunning = false;
    this.viewAnimation = null;
    this.cameraMove = {
      from: target.clone(),
      to: hit.point.clone(),
      fromDistance: current,
      toDistance: Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, wanted)),
      direction: this.camera.position.clone().sub(target).normalize(),
      start: performance.now(),
    };
    this.requestRender();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.handleControlsChange);
    this.controls.removeEventListener("start", this.handleControlsStart);
    this.controls.removeEventListener("end", this.handleControlsEnd);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    canvas.removeEventListener("dblclick", this.handleDoubleClick);
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    clearTimeout(this.unitClickTimer);
    this.keyWindow.removeEventListener("keydown", this.handleKeyDown);
    this.keyWindow.removeEventListener("keyup", this.handleKeyUp);
    this.keyWindow.removeEventListener("blur", this.releaseKeys);
    for (const guid of [...this.units.keys()]) this.removeUnit(guid);
    this.clearLabel();
    this.clearGround();
    this.dungeonMeshRequest = null;
    if (this.dungeonMesh) disposeDungeonMesh(this.dungeonMesh);
    this.dungeonMesh = null;
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    for (const mini of this.bossMinis.values()) {
      mini?.geometry.dispose();
      mini?.material?.map?.dispose();
      mini?.material?.dispose();
    }
    this.beams.geometry.dispose();
    this.beams.material.dispose();
    for (const pool of [this.rings, this.bolts, this.slashes, this.bars]) {
      pool.geometry.dispose();
      pool.material.dispose();
      pool.dispose();
    }
    for (const sprite of this.combatSprites) sprite.material.dispose();
    for (const { texture } of this.labelTextures.values()) texture.dispose();
    for (const sprite of [...this.castSprites, ...this.castArcs, ...this.castLabels]) sprite.material.dispose();
    for (const texture of [...this.arcTextures, ...this.cutArcTextures]) texture?.dispose();
    for (const texture of this.iconTextures.values()) {
      if (typeof texture === "object") texture.dispose();
    }
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
    this.unitsGroup.add(group);
    const object: UnitObject = {
      group,
      body,
      bodyMaterial,
      coneMaterial,
      cone,
      kind: unit.kind,
      name: unit.name,
      color: unit.color,
      textured: false,
      dead: false,
      base: new THREE.Vector3(),
      health: unit.health,
      miniatureUrl: unit.miniatureUrl,
      barHeight: BAR_HEIGHT,
      labelHeight: LABEL_HEIGHT,
      deadLift: DEAD_LIFT,
    };
    group.scale.setScalar(this.scaleOf(object));
    this.units.set(unit.guid, object);
    if (object.miniatureUrl) {
      const mini = this.requestBossMini(object.miniatureUrl);
      if (mini) this.applyBossMini(object, mini);
    }
    return object;
  }

  // Returns the published miniature if loaded, starting its load on first use.
  private requestBossMini(url: string): BossMini | null {
    if (this.bossMinis.has(url)) return this.bossMinis.get(url) ?? null;
    this.bossMinis.set(url, null);
    void this.loadBossMiniCandidate(corsAssetUrl(url)).then((mini) => {
      if (!mini) return;
      if (this.disposed) {
        mini.geometry.dispose();
        mini.material?.map?.dispose();
        mini.material?.dispose();
        return;
      }
      this.bossMinis.set(url, mini);
      for (const object of this.units.values()) {
        if (object.miniatureUrl === url) this.applyBossMini(object, mini);
      }
      this.updateLabel();
      this.requestRender();
    });
    return null;
  }

  // Loads a published mini's first mesh as plain float geometry, sized and
  // turned to face -z, keeping its material only if it has a base-colour texture.
  private async loadBossMiniCandidate(url: string): Promise<BossMini | null> {
    try {
      this.gltfLoader ??= createGltfLoader();
      const gltf = await (await this.gltfLoader).loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      let geometry: THREE.BufferGeometry | null = null;
      let material: THREE.MeshStandardMaterial | null = null;
      gltf.scene.traverse((child) => {
        const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
        if (!mesh.isMesh) return;
        const source = mesh.material as THREE.MeshStandardMaterial;
        if (!geometry) {
          geometry = bakedGeometry(mesh);
          if (source.isMeshStandardMaterial && source.map) material = source;
        }
        mesh.geometry.dispose();
        if (source !== material) {
          source.map?.dispose();
          source.dispose();
        }
      });
      if (!geometry) return null;
      if (material) (material as THREE.MeshStandardMaterial).map!.colorSpace = THREE.SRGBColorSpace;
      const mini = geometry as THREE.BufferGeometry;
      mini.rotateY(BOSS_MINI_YAW).scale(BOSS_MINI_SIZE, BOSS_MINI_SIZE, BOSS_MINI_SIZE);
      mini.computeBoundingBox();
      mini.computeBoundingSphere();
      const box = mini.boundingBox!;
      const barHeight = Math.max(BAR_HEIGHT, box.max.y + BOSS_MINI_BAR_GAP);
      return {
        geometry: mini,
        material,
        barHeight,
        labelHeight: barHeight + LABEL_HEIGHT - BAR_HEIGHT,
        // Lying down turns -z into +y, so the back of the model rests on the ground.
        deadLift: -box.min.z,
      };
    } catch (error) {
      console.error("Failed to load published miniature", url, error);
      return null;
    }
  }

  private applyBossMini(object: UnitObject, mini: BossMini) {
    object.body.geometry = mini.geometry;
    if (mini.material) {
      // Keep the texture: the per-unit clone carries opacity, the hit flash
      // (emissive) and the death grey (colour multiply).
      const material = mini.material.clone();
      material.transparent = true;
      material.opacity = object.bodyMaterial.opacity;
      material.depthWrite = object.bodyMaterial.depthWrite;
      object.bodyMaterial.dispose();
      object.body.material = material;
      object.bodyMaterial = material;
      object.textured = true;
      setBodyColor(object);
    }
    object.barHeight = mini.barHeight;
    object.labelHeight = mini.labelHeight;
    object.deadLift = mini.deadLift;
    if (object.dead) object.body.position.y = mini.deadLift;
  }

  private removeUnit(guid: string) {
    const object = this.units.get(guid);
    if (!object) return;
    this.unitsGroup.remove(object.group);
    object.bodyMaterial.dispose();
    object.coneMaterial.dispose();
    this.units.delete(guid);
    this.floorHeights.delete(guid);
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
    this.effectCursorMs = cursorMs;

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
        target.bodyMaterial.emissive.copy(color).multiplyScalar(fade * 0.6 * Math.min(2, effect.intensity));
        if (!this.wobbling.includes(target)) this.wobbling.push(target);
      } else if (ringCount < MAX_EFFECT_PRIMITIVES) {
        // "ring": an AoE pulse expanding from the caster; "cast": a ring that
        // closes in on the caster as the cast completes; "impact": a small
        // quick burst under a melee ability's target; "heal": a ring rising
        // up the healed target, sized by the healing (bigger and gold on crits).
        const radius = (effect.type === "ring"
          ? 1.5 + 6 * effect.progress
          : effect.type === "heal" ? (0.9 + 0.4 * effect.progress) * (0.5 + 0.5 * effect.intensity)
            : effect.type === "impact" ? 0.6 + 1.8 * effect.progress : 4 - 2.5 * effect.progress) * this.unitScale;
        const brightness = effect.type === "cast" ? 0.35 + 0.5 * effect.progress : fade * (effect.type === "impact" ? 1.2 : 1);
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
    this.commitPool(this.rings, ringCount);
    this.commitPool(this.bolts, boltCount);
    this.commitPool(this.slashes, slashCount);
    // Icons first: combat text on a unit with icons floats above them.
    this.updateCastIcons(fx, cursorMs);
    this.updateCombatText(fx, cursorMs);
    return fx !== null && clock.playing;
  }

  private updateCombatText(fx: EncounterEffects | null, cursorMs: number) {
    const sources = this.effects?.combatTextGuids ?? null;
    const healGuids = this.effects?.healTextGuids ?? null;
    const any = Boolean(fx && ((sources && sources.size > 0) || (healGuids && healGuids.size > 0)));
    const texts = any
      ? deriveCombatText(fx!, cursorMs, sources, healGuids, this.effects?.suppressNameGuids ?? null, this.effectOptions, MAX_COMBAT_TEXT, this.combatText)
      : this.combatText;
    if (!any) texts.length = 0;
    let shown = 0;
    for (const text of texts) {
      const target = this.units.get(text.target);
      if (!target) continue;
      const sprite = this.combatSprites[shown];
      const label = this.labelTexture(text.text, this.effects!.resolveColor(text.color), text.crit);
      if (sprite.material.map !== label.texture) {
        sprite.material.map = label.texture;
        sprite.material.needsUpdate = true;
      }
      sprite.material.opacity = 1 - text.progress * text.progress;
      const height = COMBAT_TEXT_HEIGHT * (text.crit ? 1.25 : 1) * this.unitScale;
      sprite.scale.set(height * label.aspect, height, 1);
      // Float up from above the bar (or the unit's cast icons); stagger
      // labels on the same target.
      const iconTop = this.castIconTops.get(text.target);
      const start = iconTop !== undefined ? iconTop + CAST_ICON_TOP_GAP : target.labelHeight + 0.5;
      const lift = (start + 2 * text.progress + (shown % 3) * 1.2) * this.scaleOf(target);
      sprite.position.set(target.base.x, target.base.y + lift, target.base.z);
      sprite.visible = true;
      shown++;
    }
    for (let index = shown; index < MAX_COMBAT_TEXT; index++) this.combatSprites[index].visible = false;
  }

  private updateCastIcons(fx: EncounterEffects | null, cursorMs: number) {
    const castIcons = this.effects?.castIcons;
    const on = Boolean(fx && castIcons && castIcons.guids.size > 0);
    const icons = on
      ? deriveCastIcons(fx!, cursorMs, castIcons!.guids, Math.min(MAX_CAST_ICONS, this.effectOptions.maxEffects), this.castIcons, {
        priorityGuids: castIcons!.priorityGuids,
        enemyGuids: castIcons!.enemyGuids,
        filterGuids: this.effectOptions.filterGuids,
      })
      : this.castIcons;
    if (!on) icons.length = 0;
    const right = this.vectorB.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    let visible = 0;
    for (const icon of icons) {
      if (this.units.has(icon.caster)) visible++;
    }
    const baseSize = CAST_ICON_SIZE * (visible > CAST_ICON_CROWDED ? CAST_ICON_CROWDED_SCALE : 1);
    this.castIconTops.clear();
    // Every pooled sprite starts each frame in colour, upright and untinted,
    // so scrubbing back before an interrupt shows the colour icon again.
    for (const sprite of this.castSprites) {
      sprite.material.userData.saturation.value = 1;
      sprite.material.rotation = 0;
      sprite.material.color.setHex(0xffffff);
    }
    let shown = 0;
    for (let index = 0; index < icons.length; index++) {
      const icon = icons[index];
      const caster = this.units.get(icon.caster);
      if (!caster) continue;
      // The question mark stands in while the icon loads or after it failed.
      const texture = this.iconTexture(castIcons!.iconUrl(icon.spellId)) ?? this.iconTexture(castIcons!.placeholderUrl);
      if (!texture) continue;
      const sprite = this.castSprites[shown];
      const arc = this.castArcs[shown];
      const material = sprite.material;
      if (material.map !== texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
      let scale = 1;
      let opacity = 1;
      let rotation = 0;
      let arcTexture: THREE.CanvasTexture | null = null;
      let arcOpacity = 0;
      let flash = false;
      let label = false;
      if (icon.phase === "casting") {
        // Grows in, then holds while the outline sweeps round with the cast.
        scale = icon.elapsedMs < CAST_ICON_GROW_MS
          ? CAST_ICON_GROW_FROM + (1 - CAST_ICON_GROW_FROM) * easeOutCubic(icon.elapsedMs / CAST_ICON_GROW_MS)
          : 1;
        const step = Math.floor(icon.progress * CAST_ARC_STEPS);
        if (step > 0) {
          arcTexture = this.arcTexture(step, false);
          arcOpacity = CAST_ARC_OPACITY;
        }
      } else if (icon.phase === "instant") {
        // Pops as the cast goes off with a white ring flash, then fades.
        const pop = icon.elapsedMs / CAST_ICON_POP_MS;
        if (pop < 0.35) scale = 1 + (CAST_ICON_POP_SCALE - 1) * easeOutCubic(pop / 0.35);
        else if (pop < 1) scale = CAST_ICON_POP_SCALE - (CAST_ICON_POP_SCALE - 1) * easeOutBack((pop - 0.35) / 0.65, 1.7);
        opacity = 1 - icon.progress * icon.progress;
        if (icon.elapsedMs < CAST_ICON_FLASH_MS) {
          arcTexture = this.arcTexture(CAST_ARC_STEPS, false);
          arcOpacity = 1 - icon.elapsedMs / CAST_ICON_FLASH_MS;
          flash = true;
        }
      } else {
        // Interrupted: the icon bumps, drains to grey and wiggles; the
        // outline freezes where the cast was cut, then everything fades.
        const elapsed = icon.elapsedMs;
        const lingerMs = icon.enemy ? INTERRUPTED_ICON_MS : INTERRUPTED_PLAYER_ICON_MS;
        if (elapsed < INTERRUPT_IMPACT_MS) {
          const impact = elapsed / INTERRUPT_IMPACT_MS;
          scale = impact < 0.5
            ? 1 + (INTERRUPT_IMPACT_SCALE - 1) * easeOutCubic(impact / 0.5)
            : INTERRUPT_IMPACT_SCALE - (INTERRUPT_IMPACT_SCALE - 1) * easeOutBack((impact - 0.5) / 0.5, 1.7);
        }
        const grey = 1 - (1 - Math.min(1, elapsed / INTERRUPT_GREY_MS)) ** 2;
        material.userData.saturation.value = 1 - grey;
        material.color.setScalar(1 - (1 - INTERRUPT_BRIGHTNESS) * grey);
        if (elapsed < INTERRUPT_WIGGLE_MS) {
          const wiggle = elapsed / INTERRUPT_WIGGLE_MS;
          rotation = Math.sin(wiggle * Math.PI * 6) * INTERRUPT_WIGGLE * (1 - wiggle);
        }
        const fadeFrom = lingerMs - INTERRUPT_FADE_MS;
        if (elapsed > fadeFrom) {
          const fade = ((elapsed - fadeFrom) / INTERRUPT_FADE_MS) ** 2;
          opacity = 1 - fade;
          scale *= 1 - (1 - INTERRUPT_SHRINK) * fade;
        }
        const step = Math.floor(icon.cutProgress * CAST_ARC_STEPS);
        if (step > 0) {
          arcTexture = this.arcTexture(step, true);
          arcOpacity = 1;
        }
        label = icon.enemy && elapsed < INTERRUPT_LABEL_MS;
      }
      material.opacity = opacity;
      material.rotation = rotation;
      const size = baseSize * scale * this.unitScale;
      sprite.scale.set(size, size, 1);
      // Directly above the health bar; the newest icon on a caster is
      // centred and an older one sits to its right.
      let slot = 0;
      for (let previous = 0; previous < index; previous++) {
        if (icons[previous].caster === icon.caster) slot++;
      }
      const bottom = caster.barHeight + CAST_ICON_BAR_GAP;
      const casterScale = this.scaleOf(caster);
      sprite.position.set(caster.base.x, caster.base.y + (bottom + baseSize / 2) * casterScale, caster.base.z)
        .addScaledVector(right, slot * baseSize * 1.1 * this.unitScale);
      sprite.visible = true;
      if (arcTexture) {
        const arcMaterial = arc.material;
        if (arcMaterial.map !== arcTexture) {
          arcMaterial.map = arcTexture;
          arcMaterial.needsUpdate = true;
        }
        const blending = flash ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (arcMaterial.blending !== blending) {
          arcMaterial.blending = blending;
          arcMaterial.needsUpdate = true;
        }
        arcMaterial.opacity = arcOpacity * opacity;
        arc.scale.set(size * CAST_ARC_SIZE, size * CAST_ARC_SIZE, 1);
        arc.position.copy(sprite.position);
        arc.visible = true;
      } else {
        arc.visible = false;
      }
      let top = bottom + baseSize;
      const labelSprite = this.castLabels[shown];
      if (label) {
        const text = this.labelTexture("Interrupted", INTERRUPT_LABEL_COLOR, false);
        if (labelSprite.material.map !== text.texture) {
          labelSprite.material.map = text.texture;
          labelSprite.material.needsUpdate = true;
        }
        labelSprite.material.opacity = opacity;
        const height = INTERRUPT_LABEL_HEIGHT * this.unitScale;
        labelSprite.scale.set(height * text.aspect, height, 1);
        labelSprite.position.copy(sprite.position).setY(caster.base.y + (top + 0.1) * casterScale);
        labelSprite.visible = true;
        top += 0.1 + INTERRUPT_LABEL_HEIGHT;
      } else {
        labelSprite.visible = false;
      }
      this.castIconTops.set(icon.caster, Math.max(this.castIconTops.get(icon.caster) ?? 0, top));
      this.castSpriteIcons[shown] = index;
      shown++;
    }
    for (let index = shown; index < MAX_CAST_ICONS; index++) {
      this.castSprites[index].visible = false;
      this.castArcs[index].visible = false;
      this.castLabels[index].visible = false;
    }
    // The hover label sits above the hovered unit's icons.
    if (this.hoveredGuid) this.updateLabel();
  }

  // The cast outline traced `step / CAST_ARC_STEPS` of the way round,
  // clockwise from 12 o'clock (grey with a red tick at the end when `cut`);
  // created on first use and kept.
  private arcTexture(step: number, cut: boolean): THREE.CanvasTexture {
    const textures = cut ? this.cutArcTextures : this.arcTextures;
    let texture = textures[step];
    if (!texture) {
      texture = createArcTexture(step / CAST_ARC_STEPS, cut);
      textures[step] = texture;
    }
    return texture;
  }

  /** Starts loading cast icons ahead of their first draw, through the same cache as iconTexture. */
  preloadIcons(urls: readonly string[]) {
    // Newest insert is most recently used, so walk backwards: the earliest
    // urls end up freshest and are the last to be evicted.
    for (let i = Math.min(urls.length, MAX_ICON_TEXTURES) - 1; i >= 0; i--) {
      if (this.disposed) return;
      this.iconTexture(urls[i]!);
    }
  }

  // The icon's texture once loaded, starting the load on first use; null
  // while loading or after a failed load (retried after ICON_RETRY_MS).
  private iconTexture(url: string): THREE.Texture | null {
    const cached = this.iconTextures.get(url);
    if (cached !== undefined && !(typeof cached === "number" && performance.now() - cached >= ICON_RETRY_MS)) {
      // Re-insert to keep the cache in least-recently-used order.
      this.iconTextures.delete(url);
      this.iconTextures.set(url, cached);
      return typeof cached === "object" ? cached : null;
    }
    this.iconTextures.delete(url);
    this.iconTextures.set(url, "loading");
    this.textureLoader.load(corsAssetUrl(url), (texture) => {
      if (this.disposed || this.iconTextures.get(url) !== "loading") {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      this.iconTextures.set(url, texture);
      this.requestRender();
    }, undefined, () => {
      if (this.disposed || this.iconTextures.get(url) !== "loading") return;
      this.iconTextures.set(url, performance.now());
      this.requestRender();
    });
    if (this.iconTextures.size > MAX_ICON_TEXTURES) {
      // Evict the least recently used icon that is not on screen.
      for (const [oldestUrl, oldest] of this.iconTextures) {
        if (typeof oldest === "object" && this.castSprites.some((sprite) => sprite.visible && sprite.material.map === oldest)) continue;
        if (typeof oldest === "object") oldest.dispose();
        this.iconTextures.delete(oldestUrl);
        break;
      }
    }
    return null;
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
      if (![...this.combatSprites, ...this.castLabels].some((sprite) => sprite.material.map === oldest.texture)) {
        oldest.texture.dispose();
        this.labelTextures.delete(oldestKey);
      }
    }
    return label;
  }

  // Reports the spell effect under the pointer when it changes.
  private updateEffectHover() {
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
    // The bar's lift above the unit's base, in scene units.
    let barLift = BAR_HEIGHT;
    const fx = this.effects?.fx ?? null;
    const quad = (base: THREE.Vector3, from: number, to: number, quadWidth: number, quadHeight: number, color: THREE.Color | number) => {
      const center = this.vector.copy(base).setY(base.y + barLift).addScaledVector(right, ((from + to) / 2 - 0.5) * width);
      this.matrix.compose(center, this.camera.quaternion, this.scaleVector.set(quadWidth, quadHeight, 1));
      this.bars.setMatrixAt(count, this.matrix);
      this.bars.setColorAt(count, typeof color === "number" ? this.color.setHex(color) : color);
      count++;
    };
    for (const object of this.units.values()) {
      const { health } = object;
      if (!health || count + 4 > MAX_HEALTH_BARS * 4) continue;
      const dead = health.dead || object.dead;
      barLift = object.barHeight * this.scaleOf(object);
      const fraction = health.max > 0 ? Math.min(1, Math.max(0, health.current / health.max)) : 0;
      const absorb = health.max > 0 ? Math.min(1 - fraction, Math.max(0, health.absorb / health.max)) : 0;
      // From the effect clock while effects run, so the chunk shrinks
      // smoothly between replay ticks; the tick's value otherwise.
      const gain = fx ? deriveRecentHealGain(fx, object.group.userData.guid as string, this.effectCursorMs) : health.healGain ?? 0;
      const healed = health.max > 0 ? Math.min(fraction, Math.max(0, gain / health.max)) : 0;
      quad(object.base, 0, 1, width + padding, thickness + padding, dead ? BAR_DEAD : BAR_BACKGROUND);
      if (dead) continue;
      if (fraction > 0) quad(object.base, 0, fraction, width * fraction, thickness, this.color.setStyle(healthBarColor(fraction)));
      if (healed > 0) quad(object.base, fraction - healed, fraction, width * healed, thickness, BAR_HEAL);
      if (absorb > 0) quad(object.base, fraction, fraction + absorb, width * absorb, thickness, BAR_ABSORB);
    }
    this.commitPool(this.bars, count);
  }

  // Slain units lie down, grey, until resurrected.
  private setDead(object: UnitObject, dead: boolean) {
    if (object.dead === dead) return;
    object.dead = dead;
    object.body.rotation.x = dead ? -Math.PI / 2 : 0;
    object.body.position.y = dead ? object.deadLift : 0;
    object.cone.visible = !dead;
    setBodyColor(object);
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
    // Above the unit's cast icons while it has any.
    const iconTop = this.castIconTops.get(this.hoveredGuid!);
    const height = iconTop !== undefined ? iconTop + CAST_ICON_TOP_GAP : object.labelHeight;
    const { position } = object.group;
    this.label!.position.set(position.x, position.y + height * this.scaleOf(object), position.z);
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

  /** Called with a unit's guid when it is clicked (not dragged, not double-clicked). */
  setOnUnitClick(callback: ((guid: string) => void) | null) {
    this.onUnitClick = callback;
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.pointerDownAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  };

  // A press and release without moving (a drag orbits or pans) on a unit.
  private readonly handlePointerUp = (event: PointerEvent) => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down || event.button !== 0 || !this.onUnitClick) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > UNIT_CLICK_SLOP_PX) return;
    const guid = this.pickScenePoint(event)?.guid;
    clearTimeout(this.unitClickTimer);
    if (!guid) return;
    this.unitClickTimer = window.setTimeout(() => this.onUnitClick?.(guid), UNIT_CLICK_DELAY_MS);
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
    this.constrainCamera();
    this.updateUnitScale();
    this.requestRender();
  };

  // The user took the camera: stop any re-framing in progress and pause the
  // Director until a viewport request (Follow, a jump, a new selection)
  // hands the camera back.
  private readonly handleControlsStart = () => {
    this.viewAnimation = null;
    this.cameraMove = null;
    this.directorPaused = true;
    this.directorRunning = false;
    this.directorSubject = null;
    this.gestureStart = this.cameraViewport();
  };

  // The user panned or zoomed: remember and report where they left it. A
  // click or a pure orbit leaves the framing as it was.
  private readonly handleControlsEnd = () => {
    const viewport = this.cameraViewport();
    const start = this.gestureStart;
    this.gestureStart = null;
    if (start && Math.abs(viewport.centerX - start.centerX) < 1e-6 && Math.abs(viewport.centerY - start.centerY) < 1e-6
      && Math.abs(viewport.zoom / start.zoom - 1) < 1e-6) return;
    this.viewport = viewport;
    this.onUserViewport(viewport);
  };

  // Camera keys act while the pointer is over the map, never while typing.
  // Modified presses (e.g. Shift+F for focus mode) belong to the page.
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (!this.pointerInside) return;
    const action = MAP_CONTROL_ACTIONS.find((candidate) => candidate.defaultKey === event.code)?.id;
    if (!action) return;
    event.preventDefault();
    if (this.heldActions.has(action)) return;
    // The first key takes the camera like a drag does: the Director pauses.
    if (this.heldActions.size === 0) {
      this.handleControlsStart();
      this.keyMoveLastMs = 0;
    }
    this.heldActions.add(action);
    this.requestRender();
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    const action = MAP_CONTROL_ACTIONS.find((candidate) => candidate.defaultKey === event.code)?.id;
    if (!action || !this.heldActions.delete(action)) return;
    if (this.heldActions.size === 0) this.handleControlsEnd();
  };

  // Focus left the window mid-press: the keyup never arrives.
  private readonly releaseKeys = () => {
    if (this.heldActions.size === 0) return;
    this.heldActions.clear();
    this.handleControlsEnd();
  };

  // Moves the camera for the held keys; true while any is held.
  private updateKeyboardCamera(now: number): boolean {
    if (this.heldActions.size === 0) return false;
    const dt = this.keyMoveLastMs ? Math.min(KEY_MAX_STEP_S, (now - this.keyMoveLastMs) / 1000) : 0;
    this.keyMoveLastMs = now;
    if (dt <= 0) return true;
    const held = this.heldActions;
    const axis = (positive: MapControlAction, negative: MapControlAction) => (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
    const target = this.controls.target;
    const offset = this.directorVector.copy(this.camera.position).sub(target);

    const rotate = axis("rotate_left", "rotate_right");
    if (rotate) offset.applyAxisAngle(Y_AXIS, rotate * KEY_ROTATE_SPEED * dt);

    const zoom = axis("zoom_out", "zoom_in");
    if (zoom) {
      const distance = offset.length() * Math.exp(zoom * KEY_ZOOM_SPEED * dt);
      offset.setLength(Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, distance)));
    }

    const forward = axis("move_forward", "move_back");
    const strafe = axis("move_right", "move_left");
    if (forward || strafe) {
      // Along the ground, relative to where the camera looks.
      const horizontal = Math.hypot(offset.x, offset.z) || 1;
      const fx = -offset.x / horizontal;
      const fz = -offset.z / horizontal;
      const step = (offset.length() * KEY_PAN_SPEED * dt) / Math.hypot(forward, strafe);
      target.x += (fx * forward - fz * strafe) * step;
      target.z += (fz * forward + fx * strafe) * step;
    }

    this.camera.position.copy(target).add(offset);
    this.controls.update();
    return true;
  }

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
      // Only keeps a frame loop running while something moves (playback
      // effects, a re-framing, the Director, coasting damping); otherwise
      // rendering stays on demand.
      const reframing = this.updateViewAnimation(now);
      const moving = this.updateCameraMove(now);
      const directing = this.updateDirector(now);
      const keyMoving = this.updateKeyboardCamera(now);
      // Damping coasts the camera to a stop after a gesture; update() reports
      // whether it is still moving, so the loop idles again once it settles.
      const damping = this.controls.update();
      const animating = this.updateEffects(now) || reframing || moving || directing || keyMoving || damping;
      this.updateBars();
      this.updateEffectHover();
      this.renderer.render(this.scene, this.camera);
      if (animating) this.requestRender();
    });
  };
}

// Untextured bodies take the unit's colour; textured minis keep their texture
// (white multiply). Both turn grey when dead.
function setBodyColor(object: UnitObject) {
  object.bodyMaterial.color.set(object.dead ? DEAD_COLOR : object.textured ? 0xffffff : object.color);
}

// Loaded on first use so the glTF loader and meshopt decoder stay out of the
// 3D chunk until a boss mini is needed. The minis use EXT_meshopt_compression.
async function createGltfLoader(): Promise<GLTFLoader> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

// The minis' positions are quantized (KHR_mesh_quantization) with the scale in
// the node transform; bake that into float positions, float UVs and fresh
// normals.
function bakedGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const source = mesh.geometry.getAttribute("position");
  const positions = new Float32Array(source.count * 3);
  const vertex = new THREE.Vector3();
  for (let index = 0; index < source.count; index++) {
    vertex.fromBufferAttribute(source, index).applyMatrix4(mesh.matrixWorld).toArray(positions, index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const uv = mesh.geometry.getAttribute("uv");
  if (uv) {
    const uvs = new Float32Array(uv.count * 2);
    for (let index = 0; index < uv.count; index++) {
      uvs[index * 2] = uv.getX(index);
      uvs[index * 2 + 1] = uv.getY(index);
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }
  const index = mesh.geometry.getIndex();
  if (index) geometry.setIndex(new THREE.BufferAttribute(index.array.slice(), 1));
  geometry.computeVertexNormals();
  return geometry;
}

// The mesh's water planes are the `liquid_*` nodes (a multi-primitive node
// becomes a group of meshes, so check the ancestors too).
function isLiquid(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
    if (/^liquid/i.test(node.name)) return true;
  }
  return false;
}

function disposeDungeonMesh(mesh: DungeonMesh) {
  mesh.group.traverse((child) => {
    const object = child as THREE.Mesh;
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const textured = material as THREE.MeshStandardMaterial;
      textured.map?.dispose();
      textured.normalMap?.dispose();
      textured.roughnessMap?.dispose();
      textured.metalnessMap?.dispose();
      textured.emissiveMap?.dispose();
      material.dispose();
    }
  });
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

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// Overshoots past 1 by an amount set by `overshoot`, then settles at 1.
function easeOutBack(t: number, overshoot: number): number {
  const x = t - 1;
  return 1 + (overshoot + 1) * x ** 3 + overshoot * x ** 2;
}

// A white outline round a square icon, traced `fraction` of the way round
// clockwise from 12 o'clock. Drawn on a canvas CAST_ARC_SIZE times the icon,
// about 2 px wide at the icon's on-screen size. A `cut` outline is grey with
// a red tick across its end.
function createArcTexture(fraction: number, cut: boolean): THREE.CanvasTexture {
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
function createIconMaterial(): THREE.SpriteMaterial {
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
