import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mapAssetUrl, type WowMapFloorBounds, type WowMapLayer, type WowMapMeshLiquid } from "@/pages/Technical/mapGallery";
import type { MapCameraPose } from "./cameraPath";
import type { DroneProbe } from "./droneCamera";
import { CAPSULE_AVATAR, walkAvatarUrl } from "./walkAvatars";
import type { LiveMapPresence } from "../../liveSessionProtocol";
import { actionForKey, cameraAngles, cameraOffset, clampMobileMapInput, frameStepSeconds, IDLE_MOBILE_MAP_INPUT, type MobileMapInput, planarStep, pointerLossEndsDrag, turnYaw, WALK_TOGGLE_KEY, walkDragButton, walkMouseControl, walkMovementYaw, wheelZoomDistance } from "./mapControls";
import { type DispelKind } from "./unitTokenArt";
import { UnitTokenTextures } from "./unitTokens";
import type { PlanInput, PlanItem, PlanMarkerIcon, PlanPoint } from "./plan/mapPlan";
import { PlanLayer, type PlanSurface } from "./plan/planLayer";
import {
  clampToRadius,
  medianHeight,
} from "./dungeonMeshes";
import { MAP_CURSOR, MAP_HOSTILE_CURSOR, MAP_UNIT_CURSOR } from "./mapCursors";
import { flatArtworkUnitScale, FOCUS_RADIUS_YARDS, FULL_MAP_VIEWPORT, mapPointToScene, topDownMapDistance, type MapPoint, type MapViewport } from "./mapModel";
import { type MapDebugOverlay } from "./mapDebugOverlays";
import {
  MAX_EFFECT_PRIMITIVES,
  type DeriveEffectsOptions,
  type EncounterEffects,
  type ReplayEffectKind,
} from "./replayEffects";
import type { MapMarkerKind, MapSceneGround, MapUnitHealth } from "./useMapScene";
import { type ModelLocomotion } from "./modelAnimation";
import { createAvatar, createUnitGeometries, createWalkAvatarModel, playWalkAvatarState, type WalkAvatarModel } from "./sceneFactories";
import { loadWalkAvatar } from "./sceneLoaders";
import { GROUND_WIDTH, MESH_PLAYER_HEIGHT_YARDS, ORBIT_FAR, ORBIT_NEAR, PLAYER_GEOMETRY_HEIGHT, TOKEN_RADIUS } from "./sceneConstants";
import {
  DEFAULT_AD_STRAFE,
  DOUBLE_CLICK_OUT_FACTOR,
  MESH_FULL_MAP_DISTANCE_FACTOR,
  MESH_MAX_DISTANCE_FACTOR,
  MESH_MAX_POLAR_RADIANS,
  MIN_DOUBLE_CLICK_DISTANCE_YARDS,
  MOBILE_ORBIT_PAN_SPEED,
  MOBILE_ORBIT_ROTATE_SPEED,
  MOBILE_ORBIT_ZOOM_SPEED,
  ORBIT_PAN_SPEED,
  ORBIT_ROTATE_SPEED,
  ORBIT_ZOOM_SPEED,
  TILES_MAX_DISTANCE_SCENE_UNITS,
  TILES_MAX_POLAR_RADIANS,
  UNIT_CLICK_DELAY_MS,
  UNIT_CLICK_SLOP_PX,
  WALK_BACK_YPS,
  WALK_BODY_TURN_RATE_PER_S,
  WALK_EXIT_DISTANCE_YARDS,
  WALK_FLY_YPS,
  WALK_GRAVITY_YPS2,
  WALK_JUMP_YPS,
  WALK_RUN_YPS,
  WALK_START_DISTANCE_YARDS,
  WALK_START_PITCH_RADIANS,
  WALK_STEP_YARDS,
} from "./controlProfile";
import { LivePresence } from "./livePresence";
import { DungeonWorld, type DungeonMesh } from "./dungeonWorld";
import { DebugOverlayLayer } from "./debugOverlays";
import { CameraArbiter, type CameraOwner } from "./cameraArbiter";
import { TweenRig } from "./tweenRig";
import { ScriptedRig } from "./scriptedRig";
import { FreeRig } from "./freeRig";
import { WalkRig } from "./walkRig";
import { DirectorRig } from "./directorRig";
import { CameraCollision } from "./cameraCollision";
import { MapInputState, mobileInputActive, MouseDrag, type InputFrame } from "./inputFrame";
import { UnitLayer, type UnitObject } from "./unitLayer";
import { EffectsLayer } from "./effectsLayer";
import { HudLayer } from "./hudLayer";
import { raycastUnits } from "./unitPicking";

/** Ground plane width in scene units; depth follows the artwork's aspect. */
export { GROUND_WIDTH };

/** Primitive pool size for each effect kind; also the derivation cap's ceiling. */
export { MAX_EFFECT_PRIMITIVES };
// Default camera directions from the target.
const ANGLED_OFFSET = new THREE.Vector3(0, 0.85, 0.75);
const TOP_DOWN_OFFSET = new THREE.Vector3(0, 1, 0);
// Flat artwork has no yard scale. Keep token geometry fixed in map space so
// zooming in makes units larger with the artwork instead of shrinking them.

// --- Dungeon mesh mode (the real cave as the ground, see dungeonMeshes.ts) ---
// On calibrated flat artwork the disc represents a character's footprint, not
// their standing height. Keeping that distinction makes close fight framing
// readable even on physically small dungeon floors.
const FLAT_PLAYER_TOKEN_DIAMETER_YARDS = 1.25;
// Zoomed out, units never shrink below this fraction of their tiles-mode
// (constant on-screen) size, so the raid stays visible without being giants
// at Fit.
const MESH_MIN_SCREEN_SCALE = 0.5;
// With a fight focused, the target can pan this far (yards) from the focus
// centre (the zoom limits are in controlProfile).
const MESH_PAN_RADIUS_YARDS = FOCUS_RADIUS_YARDS;
// The camera direction the mesh starts from: steeper than ANGLED_OFFSET so
// the rock between the camera and a sunken chamber hides less of the fight.
const MESH_ANGLED_OFFSET = new THREE.Vector3(0, 1.6, 0.75);

// --- Navigation: every control tunable is in controlProfile.ts ---
// The orbit camera's near plane (0.5 scene units, several yards on the mesh)
// would clip the floor at your feet, leaving the bottom of the view black, so
// walking pulls it in close and the far plane with it, for depth precision.
const WALK_NEAR_YARDS = 0.1;
const WALK_FAR_YARDS = 3000;

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
export interface MapScene3DOptions {
  /**
   * A video capture scene: renders at exactly this size (not the container's),
   * keeps its drawing buffer for the encoder, takes no input, and only draws
   * through captureFrame.
   */
  capture?: { width: number; height: number } | null;
  /** Builds the renderer; a WebGLRenderer by default. Tests pass a stub (there is no WebGL in Node). */
  createRenderer?: (parameters: THREE.WebGLRendererParameters) => THREE.WebGLRenderer;
  /** The clock (ms) the scene stamps clock anchors, tweens and throttles with; performance.now by default. */
  now?: () => number;
}

/** What the drone camera needs from the scene: its yard scale, unit placement and mesh probe. */
export interface MapSceneDroneInput {
  /** Scene units per yard. */
  scale: number;
  /** An artwork point in scene units (x, z), as units are placed. */
  toPlane: (point: MapPoint) => { x: number; z: number };
  probe: DroneProbe;
}

export interface MapSceneDirector {
  /** The hostile units that count as the fight's boss. */
  bossGuids: ReadonlySet<string>;
}

/** A unit as the follow track reads it at one replay time: an artwork point and what it is. */
export interface MapSceneFollowUnit {
  guid: string;
  point: MapPoint;
  /** Logged world height (yards), when the log has one: the yaw probe finds the floor below it. */
  z?: number;
  player: boolean;
  boss: boolean;
  dead: boolean;
}

/**
 * The recorded replay the Director looks ahead in: the units (players and
 * bosses) at any replay time. Keep the object stable while the data is the
 * same; a new one rebuilds the track.
 */
export interface MapSceneFollowSource {
  /** What the data is, apart from how far it has streamed: a new key rebuilds the track; growth alone does not. */
  key: string;
  startMs: number;
  /** How far the data reaches now; it may grow while the result streams in. */
  readonly endMs: number;
  unitsAt: (ms: number) => readonly MapSceneFollowUnit[];
  /**
   * Every recorded sample of the units the log gives no height, on this map
   * and floor: their floors on the mesh are chosen from these up front
   * (walkableFloors). Leave it out when every unit has a logged height.
   */
  unitTracks?: () => readonly MapSceneUnitTrack[];
}

/** A unit's recorded samples (artwork points at replay times), in replay order. */
export interface MapSceneUnitTrack {
  guid: string;
  samples: readonly { ms: number; point: MapPoint }[];
}

/** The fight the mesh camera is locked to: its centre (artwork point) and Fit zoom. */
export interface MapSceneFocus {
  centre: MapPoint;
  zoom: number;
}

export interface MapUnitCallout {
  title: string;
  subtitle: string;
  color: string;
  marker: PlanMarkerIcon;
}

export interface MapScene3DUnit {
  guid: string;
  /** WoW raid target marker above a featured character in an authored reconstruction. */
  callout?: MapUnitCallout;
  point: MapPoint;
  /** Radians; undefined when the log does not record facing (no notch is drawn). */
  facing?: number;
  /** Original world coordinates, used to choose fixed encounter geometry. */
  worldX: number;
  worldY: number;
  color: string;
  kind: MapMarkerKind;
  muted: boolean;
  name: string;
  /** Health at the cursor (for its bar and nameplate), or null when unknown or bars are off. */
  health: MapUnitHealth | null;
  /** Draw its health bar: picked by the declutter (selectHealthBars). A unit with a nameplate shows its health there instead. */
  bar?: boolean;
  /** Published model URL from the shared miniature manifest. */
  miniatureUrl: string | undefined;
  /** Optional lazy animation-pack URL for an original game model. */
  animationUrl?: string;
  /** The published model is an original game model. */
  gameModel?: boolean;
  /** Movement state derived from replay positions. */
  locomotion?: ModelLocomotion;
  /** Replay the original Rookery Whelp's Stand clip for continuous wing flaps. */
  flapWings?: boolean;
  /** Manual size multiplier configured in the Miniature Foundry. */
  mapScale?: number;
  /** Client-derived standing height in world yards. */
  worldHeight?: number;
  /** Logged world height (yards), when the log has one; picks the floor on the mesh. */
  z?: number;
  /** The replay time of the sample `point` comes from (interpolated or held): without `z`, it reads the unit's floor track. */
  atMs?: number;
  /** The token's icon (a player's class, a pet's paw), or null for none. */
  icon?: string | null;
  /** A boss: a sigil instead of a disc. */
  boss?: boolean;
  /** Health at the cursor (0-1), for the nameplate; null when unknown. */
  healthFraction?: number | null;
  /** A guardian's owning player: an owner line runs between them. */
  owner?: string;
  /** A debuffed player's dispel type (magic, curse, disease, poison), tinting its token. */
  dispel?: DispelKind | null;
  /** Power (0-1) and its colour, drawn as a thin strip under the health bar. */
  power?: { fraction: number; color: string } | null;
  /** Where the unit was lately, newest (now) first, for its movement trail. */
  trail?: MapScene3DTrailPoint[];
}

/** One point of a unit's movement trail: where it was, and its logged height then. */
export interface MapScene3DTrailPoint {
  point: MapPoint;
  z?: number;
}


/** Who the map's target frames show, for the token halos and target lines. */
export interface MapUnitRoles {
  selected: string | null;
  target: string | null;
  targetsTarget: string | null;
  pinned: ReadonlySet<string>;
}

export interface MapScene3DEffects {
  /** Active server world map, used to gate encounter-specific effects. */
  mapId: number | undefined;
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
    /** Procs (instant, off the GCD): no icon. */
    isProc?: (spellId: number) => boolean;
    /** Major cooldowns: a larger, gold-framed icon that stays up longer. */
    isCooldown?: (spellId: number) => boolean;
  } | null;
  /** Units whose heals (cast or received) float their amount; null for none. */
  healTextGuids: ReadonlySet<string> | null;
  /** A cast spell's school colour from its spell data (CSS), for casts whose events carry no school. */
  castSchoolColor?: (spellId: number) => string | null;
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

interface WalkState {
  /** Feet, in scene units. */
  position: THREE.Vector3;
  /** The character's facing (rotation about y; -z is ahead at 0). */
  yaw: number;
  vy: number;
  grounded: boolean;
  camYaw: number;
  /** The camera is still easing behind the character after a turn (walkCameraSettling). */
  camSettling: boolean;
  /** Camera elevation above the head, radians. */
  camPitch: number;
  /** Camera distance from the head, yards; 0 is first person. */
  camDistance: number;
  /** The distance the camera actually sits at, yards: `camDistance`, or closer while a wall is in the way. */
  camShown: number;
  lastMs: number;
  avatar: THREE.Group;
  /** The gold capsule: shown while the chosen monster loads, or for good without one. */
  capsule: THREE.Mesh;
  model: WalkAvatarModel | null;
  /** The body's turn from `yaw` toward a strafe (radians, + is left); eases toward its target. */
  bodyTurn: number;
}


/**
 * Imperative three.js scene for the Map panel's 3D view: the artwork as a
 * textured ground plane and units as primitives. Owned by MapView3D through a
 * ref; React never reconciles three objects. Renders on demand.
 */
export class MapScene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, ORBIT_NEAR, ORBIT_FAR);
  // The user's free cam, with OrbitControls inside it (freeRig.ts).
  private readonly free: FreeRig;
  private get controls(): OrbitControls {
    return this.free.controls;
  }
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly geometries = createUnitGeometries();
  private readonly groundGroup = new THREE.Group();
  private alignmentOverlay = false;
  private readonly unitsGroup = new THREE.Group();
  // Units, their models, trails and target lines, and the no-Z floor tracks (unitLayer.ts).
  private readonly unitLayer: UnitLayer;
  // Effect pools and the effect clock (effectsLayer.ts).
  private readonly effectsLayer: EffectsLayer;
  // Health bars, nameplates, cast icons, combat text and the compass (hudLayer.ts).
  private readonly hud: HudLayer;
  private get units(): ReadonlyMap<string, UnitObject> {
    return this.unitLayer.units;
  }
  private readonly textureLoader = new THREE.TextureLoader();
  // The real dungeon mesh while "3D map" is on; `dungeonMeshRequest` is the
  // load in flight (a later request or toggle-off abandons it).
  private readonly world = new DungeonWorld();
  private readonly debugLayer = new DebugOverlayLayer(this.world);
  private get dungeonMesh(): DungeonMesh | null {
    return this.world.dungeonMesh;
  }
  private dungeonMeshRequest: { url: string } | null = null;
  private readonly meshLight = new THREE.HemisphereLight(0xfff4e0, 0x6b5a48, 1.2);
  private focus: MapSceneFocus | null = null;
  // Scene point of `focus` at its floor height while the mesh is on.
  private focusCentre: THREE.Vector3 | null = null;
  private constraining = false;
  private hoveredGuid: string | null = null;
  // A click on a unit (inspect it); held briefly so a double-click (zoom) cancels it.
  private onUnitClick: ((guid: string) => void) | null = null;
  private pointerDownAt: { x: number; y: number } | null = null;
  // The free cam's pivot lift above the floor (FreeRig.pivotLift).
  private get pivotLift(): number {
    return this.free.pivotLift;
  }
  private set pivotLift(lift: number) {
    this.free.pivotLift = lift;
  }
  private unitClickTimer = 0;
  private groundKey = "";
  private aspect = 1;
  private viewport: MapViewport = FULL_MAP_VIEWPORT;
  // Authored poses, camera marks and capture frames (scriptedRig.ts).
  private readonly scripted = new ScriptedRig();
  // The viewport re-framing and the double-click move (tweenRig.ts).
  private readonly tween = new TweenRig({
    camera: this.camera,
    controls: () => this.controls,
    viewport: () => this.viewport,
    placeCamera: (viewport, direction) => this.placeCamera(viewport, direction),
    constrainCamera: () => {
      this.constrainCamera();
    },
    updateUnitScale: () => this.updateUnitScale(),
  });
  // The camera's viewport when the user's current gesture began.
  private gestureStart: MapViewport | null = null;
  private unitScale = 1;
  /** Scene units per world yard, when the active map is calibrated. */
  private worldUnitScale: number | null = null;
  private chipScale = 1;
  private frame = 0;
  private disposed = false;
  private readonly capture: { width: number; height: number } | null;
  private readonly now: () => number;
  private externalPending = false;

  // --- Cinematic camera, "the Director" (chronicle-1079) ---
  // On while the mesh shows and the framing is the default one: every frame it
  // springs the camera toward a shot holding the boss and the group.
  private director: MapSceneDirector | null = null;
  // Who owns the camera: every take, and every hand-back to the Director
  // (Follow, encounter jump, selection), goes through it (cameraArbiter.ts).
  private readonly arbiter = new CameraArbiter({
    cancelViewTween: () => {
      this.tween.view = null;
    },
    cancelMove: () => {
      this.tween.move = null;
    },
    stopDirector: () => {
      this.directorRig.stop();
    },
    dropFollow: () => {
      this.directorSubject = null;
    },
    walking: () => this.walk !== null,
    tweening: () => this.tween.active(),
    followCamera: () => this.director !== null,
  });
  // The Director's springs, follow track and line of sight (directorRig.ts).
  private readonly directorRig = new DirectorRig({
    camera: this.camera,
    controls: () => this.controls,
    world: this.world,
    unitLayer: () => this.unitLayer,
    effects: () => this.effectsLayer,
    director: () => this.director,
    subject: () => this.directorSubject,
    aspect: () => this.aspect,
    now: () => this.now(),
    disposed: () => this.disposed,
    directing: () => this.directing(),
    pivotFloor: (x, z) => this.pivotFloor(x, z),
    cameraCeiling: () => this.cameraCeiling(),
    cameraYaw: () => this.cameraYaw(),
    cameraElevationDeg: () => this.cameraElevationDeg(),
    place: (x, z, distance, elevationDeg, yaw) => this.placeDirectorCamera(x, z, distance, elevationDeg, yaw),
    requestRender: () => this.requestRender(),
  });
  // The unit the shot follows instead of the group (double-clicked, or a
  // unit frame's Follow); changes are reported through onFollowChange.
  private subject: string | null = null;
  private onFollowChange: (guid: string | null) => void = () => {};
  private get directorSubject(): string | null {
    return this.subject;
  }
  private set directorSubject(guid: string | null) {
    if (guid === this.subject) return;
    this.subject = guid;
    this.onFollowChange(guid);
  }
  // Scratch for the camera angle reads (cameraYaw, cameraElevationDeg) and the free cam; the effect layer owns `vector`.
  private readonly directorVector = new THREE.Vector3();
  // The one collision and floor-clamp pass, each rig by its policy (cameraCollision.ts).
  private readonly collision = new CameraCollision({
    camera: this.camera,
    controls: () => this.controls,
    world: this.world,
  });
  // Scratch: the camera before the orbit pass, to tell whether it moved it.
  private readonly collisionBefore = new THREE.Vector3();
  // How far past the pan radius the Director left the camera: the user's
  // pan limit grows by this on handover (and only shrinks), so grabbing the
  // camera never snaps it back toward the focus in one step.
  private panSlack = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly vector = new THREE.Vector3();
  private readonly vectorB = new THREE.Vector3();
  private readonly vectorC = new THREE.Vector3();
  private readonly scaleVector = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private pointerInside = false;
  // The window the map lives in: a popped-out panel has its own.
  private readonly keyWindow: Window;
  // Held keys, the mouse drag (the free cam's, or walk mode's left/right
  // buttons), Shift and the mobile pad and stick: read once per frame as an
  // InputFrame by walk mode and the free cam (inputFrame.ts).
  private readonly input = new MapInputState();
  private walkCaptureActive = false;
  private walkCaptureElapsedMs: number | null = null;
  private walk: WalkState | null = null;
  private walkAvatarId = CAPSULE_AVATAR;
  private adStrafe = DEFAULT_AD_STRAFE;
  private readonly tokenTextures = new UnitTokenTextures(() => this.requestRender());
  // The raid plan drawn on the floor (see plan/), and the drawing input while a tool is active.
  private readonly planLayer = new PlanLayer(this.tokenTextures);
  private planItems: readonly PlanItem[] = [];
  private planSelected: string | null = null;
  private planSurface: PlanSurface | null = null;
  private planInput: PlanInput | null = null;
  private planPointer: number | null = null;
  private readonly presence: LivePresence;
  private onWalkChange: (walking: boolean) => void = () => {};
  private readonly walkHead = new THREE.Vector3();
  // Walk mode's camera (walkRig.ts); the character stays with updateWalk.
  private readonly walkRig = new WalkRig({
    camera: this.camera,
    controls: () => this.controls,
    head: this.walkHead,
    direction: this.collision.direction,
    collideCamera: (from, direction, shown, want, padding, min, dt) => this.collision.cast(from, direction, shown, want, padding, min, dt),
    walking: () => this.walk !== null,
  });
  private readonly onEffectHover: (hover: MapScene3DEffectHover | null) => void;

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
    onCompassYaw: (yaw: number) => void = () => {},
    options: MapScene3DOptions = {},
  ) {
    this.capture = options.capture ?? null;
    this.now = options.now ?? (() => performance.now());
    this.presence = new LivePresence({
      scene: this.scene,
      geometries: this.geometries,
      now: this.now,
      requestRender: () => this.requestRender(),
      currentPresence: () => this.currentPresence(),
    });
    this.container = container;
    this.keyWindow = container.ownerDocument.defaultView ?? window;
    this.onContextLost = onContextLost;
    this.onEffectHover = onEffectHover;
    this.onUserViewport = onUserViewport;
    this.onDungeonMesh = onDungeonMesh;
    // Throws when WebGL is unavailable; the caller falls back to 2D.
    // A capture scene keeps its drawing buffer so the video encoder can read
    // each frame, and renders at exactly the output size.
    const createRenderer = options.createRenderer ?? ((parameters) => new THREE.WebGLRenderer(parameters));
    this.renderer = createRenderer({ antialias: true, preserveDrawingBuffer: this.capture !== null });
    this.renderer.setPixelRatio(this.capture ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x11100d);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.cursor = MAP_CURSOR;
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost);
    container.appendChild(this.renderer.domElement);
    if (this.capture) {
      // Not interactive: no pointer, keys or orbit controls.
      this.renderer.domElement.style.pointerEvents = "none";
    } else {
      this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
      this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
      this.renderer.domElement.addEventListener("dblclick", this.handleDoubleClick);
      this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
      this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
      this.renderer.domElement.addEventListener("pointercancel", this.handlePointerLoss);
      this.renderer.domElement.addEventListener("lostpointercapture", this.handlePointerLoss);
      this.renderer.domElement.addEventListener("wheel", this.handleWheel, { passive: false });
      this.renderer.domElement.addEventListener("contextmenu", this.handleWalkContextMenu);
      // Capture, so walk mode's Esc is handled before the page's own Esc (focus mode) sees it.
      this.keyWindow.addEventListener("keydown", this.handleKeyDown, { capture: true });
      this.keyWindow.addEventListener("keyup", this.handleKeyUp);
      this.keyWindow.addEventListener("blur", this.releaseKeys);
    }

    this.textureLoader.setCrossOrigin("anonymous");
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-30, 80, 40);
    this.scene.add(sun);
    // Lifts the cave's albedo textures (roughness 1, no vertex colour) while the mesh is on.
    this.meshLight.visible = false;
    this.scene.add(this.meshLight);
    this.scene.add(this.groundGroup, this.debugLayer.debugOverlayGroup, this.unitsGroup, this.planLayer.group);

    // The effects layer builds its pools in the order the scene always did,
    // calling back between the beams and the rest so the unit layer's owner
    // and trail lines come in between (object ids break draw-order ties
    // between transparent pools at the origin).
    const built: { unitLayer?: UnitLayer } = {};
    this.effectsLayer = new EffectsLayer({
      scene: this.scene,
      world: this.world,
      camera: this.camera,
      renderer: this.renderer,
      raycaster: this.raycaster,
      pointer: this.pointer,
      scratch: { color: this.color, matrix: this.matrix, quaternion: this.quaternion, scaleVector: this.scaleVector, vector: this.vector, vectorB: this.vectorB },
      units: () => this.unitLayer,
      hud: () => this.hud,
      now: this.now,
      requestRender: () => this.requestRender(),
      onEffectHover: (hover) => this.onEffectHover(hover),
      aspect: () => this.aspect,
      dungeonMesh: () => this.dungeonMesh,
      unitScale: () => this.unitScale,
      pointerInside: () => this.pointerInside,
    }, (effects) => {
      built.unitLayer = new UnitLayer({
        scene: this.scene,
        unitsGroup: this.unitsGroup,
        world: this.world,
        tokenTextures: this.tokenTextures,
        camera: this.camera,
        scratch: { color: this.color, matrix: this.matrix, vector: this.vector, vectorB: this.vectorB },
        effects,
        now: this.now,
        requestRender: () => this.requestRender(),
        updatePlates: () => this.updatePlates(),
        updateCursor: () => this.updateCursor(),
        aspect: () => this.aspect,
        disposed: () => this.disposed,
        dungeonMesh: () => this.dungeonMesh,
        followSource: () => this.directorRig.followSource,
        unitScale: () => this.unitScale,
        worldUnitScale: () => this.worldUnitScale,
        hoveredGuid: () => this.hoveredGuid,
        setHoveredGuid: (guid) => {
          this.hoveredGuid = guid;
        },
      });
    });
    this.unitLayer = built.unitLayer!;
    // Health bars, combat text and cast icon sprites, after the effect pools as before.
    this.hud = new HudLayer({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      textureLoader: this.textureLoader,
      scratch: { color: this.color, matrix: this.matrix, scaleVector: this.scaleVector, vector: this.vector, vectorB: this.vectorB, vectorC: this.vectorC },
      units: this.unitLayer,
      effects: this.effectsLayer,
      now: this.now,
      requestRender: () => this.requestRender(),
      onCompassYaw: onCompassYaw,
      cameraYaw: () => this.cameraYaw(),
      disposed: () => this.disposed,
      hoveredGuid: () => this.hoveredGuid,
      unitScale: () => this.unitScale,
    });

    this.free = new FreeRig({
      camera: this.camera,
      element: this.renderer.domElement,
      capture: this.capture !== null,
      scratch: this.directorVector,
      pivotFloor: (x, z) => this.pivotFloor(x, z),
      wantDistance: () => this.collision.wantDistance,
      requestRender: () => this.requestRender(),
    });
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
      // The ground draws first (base tiles, then overlays): sorted by distance
      // like the tokens, a tile nearer the camera would paint over their faces.
      mesh.renderOrder = y > 0 ? -1 : -2;
      // Hidden until textured so pending or failed tiles show the backdrop.
      mesh.visible = false;
      this.groundGroup.add(mesh);
      this.textureLoader.load(mapAssetUrl(iconBaseUrl, path), (texture) => {
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
    if (aspectChanged) {
      this.setViewport(this.viewport);
      // The plan's world <-> scene transform uses the aspect.
      this.updatePlanSurface();
    }
    this.requestRender();
  }

  /** Keeps the camera and DOM artwork on the same exact top-down projection. */
  setAlignmentOverlay(enabled: boolean) {
    if (enabled === this.alignmentOverlay) return;
    this.alignmentOverlay = enabled;
    this.controls.enableRotate = !enabled;
    // Looking straight down makes the normal +Y up vector degenerate. In
    // alignment mode artwork top is scene -Z, so use that as screen up.
    this.camera.up.set(0, enabled ? 0 : 1, enabled ? -1 : 0);
    if (enabled) this.resetCamera(true);
    else if (this.director && this.dungeonMesh) this.engageDirector(true);
    else this.resetCamera(false);
  }

  setUnits(units: MapScene3DUnit[]) {
    this.unitLayer.setUnits(units);
  }

  /** Sets the combat events to draw, or turns effects off with `null`. */
  setEffects(effects: MapScene3DEffects | null) {
    this.effectsLayer.setEffects(effects);
  }

  /** Persistent map diagnostics, independent of replay combat effects. */
  setDebugOverlays(overlays: readonly MapDebugOverlay[]) {
    this.debugLayer.setDebugOverlays(overlays, this.aspect);
    this.requestRender();
  }

  /**
   * Anchors the effect clock on a replay tick. While playing, frames run
   * ahead of the last tick at `speed` (up to MAX_EXTRAPOLATE_MS) so short
   * effects animate smoothly between the coarse ticks (EffectsLayer).
   */
  setEffectClock(cursorMs: number, playing: boolean, speed: number) {
    this.effectsLayer.setEffectClock(cursorMs, playing, speed);
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
    this.directorRig.stop();
    this.directorSubject = null;
    if (this.dungeonMesh) {
      // The parsed mesh is shared with other scenes (see parsedDungeonMesh): just let go of this copy.
      this.scene.remove(this.dungeonMesh.group);
      this.world.dungeonMesh = null;
    }
    if (!request) {
      this.applyGroundMode();
      this.tween.view = null;
      this.placeCamera(this.viewport, ANGLED_OFFSET.clone().normalize());
      this.syncCameraOwner();
      return;
    }
    const pending = { url: request.url };
    this.dungeonMeshRequest = pending;
    this.onDungeonMesh("loading");
    void this.world.loadDungeonMesh(request).then((mesh) => {
      if (this.disposed || this.dungeonMeshRequest !== pending) return;
      this.dungeonMeshRequest = null;
      if (!mesh) {
        this.onDungeonMesh("failed");
        return;
      }
      this.world.dungeonMesh = mesh;
      this.scene.add(mesh.group);
      this.applyGroundMode();
      this.tween.view = null;
      this.placeCamera(this.viewport, (this.alignmentOverlay ? TOP_DOWN_OFFSET : MESH_ANGLED_OFFSET).clone().normalize());
      // Start on the first valid cinematic shot immediately. The mesh already
      // had an asynchronous load; making the camera spend another few seconds
      // springing in from the overview makes the replay feel unnecessarily slow.
      // A camera the viewer took stays theirs (a floor change does not hand it
      // back, chronicle-2020).
      this.directorRig.stop();
      if (this.director && !this.alignmentOverlay && this.arbiter.directorHeld) this.engageDirector(true);
      this.syncCameraOwner();
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
    const turningOn = this.director === null;
    this.director = director;
    if (!director || this.alignmentOverlay) {
      this.directorRig.off();
      this.syncCameraOwner();
      return;
    }
    // New settings while on (another boss) keep a camera the viewer took:
    // only turning it on hands the camera back (chronicle-2020).
    if (!turningOn && !this.arbiter.directorHeld) {
      this.syncCameraOwner();
      return;
    }
    this.engageDirector();
    this.requestRender();
  }

  /** Cuts the Director straight to its next shot (the replay jumped), instead of springing there from the old one. */
  cutDirector() {
    if (!this.director) return;
    this.directorRig.cut(this.now());
    this.engageDirector(true);
    this.requestRender();
  }

  // Hands the camera back to the Director, springing from wherever it is now.
  // The first shot after an asynchronous mesh load can opt to snap into place.
  private engageDirector(snap = false) {
    this.arbiter.handBack();
    this.directorRig.engage(snap);
    this.syncCameraOwner();
  }

  /**
   * The recorded replay the Director looks ahead in (null: it frames each
   * frame as it comes). The framing track is built from it off the frame loop.
   */
  setFollowSource(source: MapSceneFollowSource | null) {
    if (!this.directorRig.setFollowSource(source)) return;
    this.unitLayer.ensureFloorTracks();
    this.requestRender();
  }

  /** Whether the Director is the one moving the camera right now. */
  private directing(): boolean {
    return this.director !== null && this.dungeonMesh !== null && this.arbiter.directorHeld && this.tween.move === null && this.walk === null;
  }

  /** Captures the exact orbit-camera pose for camera marks and authored paths. */
  captureCameraPose(): MapCameraPose {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
    };
  }

  /**
   * Draws one video frame now, synchronously: the camera at `pose` and every
   * time-driven animation at `nowMs` (the frame's own clock, not the wall
   * clock), so the same inputs always give the same image. Capture scenes only.
   */
  captureFrame(pose: MapCameraPose, nowMs: number) {
    if (!this.capture || this.disposed) return;
    this.applyCameraPose(pose);
    this.renderFrame(nowMs);
  }

  /**
   * How many things a frame could still be missing: textures, icons, boss
   * minis, the dungeon mesh, or data the caller says is in flight.
   */
  pendingAssets(): number {
    let pending = this.tokenTextures.pendingCount() + this.unitLayer.bossMinisLoading + (this.dungeonMeshRequest ? 1 : 0) + (this.externalPending ? 1 : 0);
    for (const texture of this.hud.iconTextures.values()) if (texture === "loading") pending++;
    return pending;
  }

  /** Marks asset data the caller is still fetching (spell icons' metadata) as pending. */
  setExternalPending(pending: boolean) {
    this.externalPending = pending;
  }

  /** The drone camera's view of the scene, once the dungeon mesh shows; null before. */
  droneInput(): MapSceneDroneInput | null {
    const mesh = this.dungeonMesh;
    if (!mesh) return null;
    return {
      scale: mesh.scale,
      toPlane: (point) => mapPointToScene(point, this.aspect, GROUND_WIDTH),
      probe: {
        floorAt: (x, z) => this.world.floorHeights.heightAt("drone", x, z, this.cameraCeiling()),
        clearShot: (x, z, distance, yaw) => this.directorRig.droneClearShot(x, z, distance, yaw),
      },
    };
  }

  /** Applies an authored orbit-camera pose and takes control from automated camera modes. */
  applyCameraPose(pose: MapCameraPose, options: { pauseDirector?: boolean; constrain?: boolean } = {}) {
    if (this.walk) this.stopWalk();
    if (options.pauseDirector !== false) {
      this.arbiter.take("scripted", "pose");
    } else {
      // Under the Director: the pose stops a tween in flight, and the Director keeps the camera.
      this.tween.move = null;
      this.tween.view = null;
    }
    this.scripted.apply(pose, this.camera, this.controls.target);
    // A raised pivot stays raised: the free cam's lift above the floor.
    this.pivotLift = Math.max(0, pose.target[1] - this.pivotFloor(pose.target[0], pose.target[2]));
    this.controls.update();
    if (options.constrain !== false) this.constrainCamera();
    this.updateUnitScale();
    this.syncCameraOwner();
    this.requestRender();
  }

  /**
   * Frames `viewport` (artwork fractions) from the current viewing angle,
   * easing there over `durationMs` when it is above zero. While the Director
   * has the camera the request only re-engages it: Follow, an encounter jump
   * and a new selection all come through here.
   */
  setViewport(viewport: MapViewport, durationMs = 0) {
    // Walking, the character has the camera: a new framing (another
    // encounter, Follow) moves the character to its centre instead.
    if (this.walk) {
      this.viewport = viewport;
      this.moveWalkTo(viewport);
      return;
    }
    if (this.director && this.dungeonMesh && !this.alignmentOverlay) {
      this.viewport = viewport;
      this.tween.view = null;
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
      this.tween.view = { from, direction, start: this.now(), duration: durationMs };
      this.arbiter.tweenStarted();
      this.syncCameraOwner();
      this.requestRender();
      return;
    }
    this.tween.view = null;
    this.placeCamera(viewport, direction);
    this.syncCameraOwner();
  }

  /** Re-frames the current viewport straight down (`topDown`) or angled. */
  resetCamera(topDown: boolean) {
    if (this.walk) this.stopWalk();
    // Asking for top-down takes the camera from the Director, as a drag does;
    // Follow (a new viewport request) hands it back. Angled only stops a tween.
    if (topDown) this.arbiter.take("free", "top-down");
    else this.tween.view = null;
    this.placeCamera(this.viewport, (topDown ? TOP_DOWN_OFFSET : ANGLED_OFFSET).clone().normalize());
    this.syncCameraOwner();
  }

  // The full map at zoom 1 sits at the default angled distance; zoom moves
  // the camera proportionally closer along `direction`.
  private placeCamera(viewport: MapViewport, direction: THREE.Vector3) {
    const { x, z } = mapPointToScene(
      { leftPercent: viewport.centerX * 100, topPercent: viewport.centerY * 100 },
      this.aspect,
      GROUND_WIDTH,
    );
    this.pivotLift = 0;
    this.controls.target.set(x, this.pivotFloor(x, z), z);
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

  // Steps a running re-framing (TweenRig); returns whether it needs another frame.
  private updateViewAnimation(now: number): boolean {
    return this.tween.updateView(now);
  }

  private baseDistance(): number {
    if (this.alignmentOverlay) {
      return topDownMapDistance(
        GROUND_WIDTH,
        GROUND_WIDTH * this.aspect,
        this.camera.aspect,
        THREE.MathUtils.degToRad(this.camera.fov),
      );
    }
    return Math.max(GROUND_WIDTH, GROUND_WIDTH * this.aspect) * ANGLED_OFFSET.length();
  }

  // Where the ground has yards, units hold their physical size against the map
  // as it zooms. Mesh capsules use standing player height, while flat discs use
  // a smaller character-footprint diameter. Without yards, flat artwork keeps
  // native token geometry instead.
  private updateUnitScale(force = false) {
    const screenScale = this.camera.position.distanceTo(this.controls.target) / this.baseDistance();
    const yards = this.world.yardScale(this.aspect);
    const trueScale = yards === null ? null : this.dungeonMesh
      ? (MESH_PLAYER_HEIGHT_YARDS * yards) / PLAYER_GEOMETRY_HEIGHT
      : (FLAT_PLAYER_TOKEN_DIAMETER_YARDS * yards) / (2 * TOKEN_RADIUS.player);
    const baseScale = trueScale === null ? flatArtworkUnitScale()
      : this.dungeonMesh ? Math.max(trueScale, MESH_MIN_SCREEN_SCALE * screenScale)
      : trueScale;
    const scale = baseScale * this.chipScale;
    const worldScale = yards === null ? null : yards * this.chipScale;
    if (scale === this.unitScale && worldScale === this.worldUnitScale && !force) return;
    this.unitScale = scale;
    this.worldUnitScale = worldScale;
    for (const object of this.units.values()) {
      object.group.scale.setScalar(this.unitLayer.scaleOf(object));
      this.unitLayer.layoutDrop(object);
    }
    this.planLayer.setUnitScale(scale);
    this.updatePlates();
  }

  // The probe start for the camera's aim point: from the median logged height
  // (or, without one, tracked floor) of the units the Director frames (every
  // unit otherwise), so the camera does not aim at a canopy above the party.
  // Undefined without either.
  private cameraCeiling(): number | undefined {
    const mesh = this.dungeonMesh;
    if (!mesh) return undefined;
    const framed = this.directing() && this.directorRig.inFrame.size > 0 ? this.directorRig.inFrame : null;
    const heights: (number | undefined)[] = [];
    for (const [guid, object] of this.units) {
      if (!framed || framed.has(guid)) heights.push(object.loggedZ ?? (object.floorTracked ? object.floorY / mesh.scale : undefined));
    }
    return this.unitLayer.probeCeiling(medianHeight(heights), mesh.scale);
  }

  // The floor below the free cam's pivot at (x, z), before its lift.
  private pivotFloor(x: number, z: number): number {
    return this.world.floorHeights.heightAt("camera-target", x, z, this.cameraCeiling());
  }

  // Shows the mesh or the tiles, re-grounds every unit and re-applies the
  // scale and camera limits for the mode.
  private applyGroundMode() {
    this.updatePlanSurface();
    const mesh = this.dungeonMesh !== null;
    this.groundGroup.visible = !mesh;
    this.meshLight.visible = mesh;
    this.world.floorHeights.clear();
    this.world.unitFloorHeights.clear();
    this.unitLayer.ensureFloorTracks();
    for (const [guid, object] of this.units) this.unitLayer.placeUnit(guid, object, object.base.x, object.base.z);
    this.updateCameraLimits();
    this.updateUnitScale(true);
    this.debugLayer.rebuildDebugOverlays(this.aspect);
    this.requestRender();
  }

  // Zoom and pan limits for the mode and focus; re-targets the floor.
  private updateCameraLimits() {
    const mesh = this.dungeonMesh;
    if (!mesh) {
      this.focusCentre = null;
      this.controls.maxDistance = TILES_MAX_DISTANCE_SCENE_UNITS;
      this.controls.maxPolarAngle = TILES_MAX_POLAR_RADIANS;
      // Back onto the flat ground, camera and target together.
      this.camera.position.y -= this.controls.target.y;
      this.controls.target.y = 0;
      this.pivotLift = 0;
    } else if (this.focus) {
      this.controls.maxPolarAngle = MESH_MAX_POLAR_RADIANS;
      const { x, z } = mapPointToScene(this.focus.centre, this.aspect, GROUND_WIDTH);
      this.focusCentre ??= new THREE.Vector3();
      this.focusCentre.set(x, this.world.floorHeights.heightAt("focus", x, z), z);
      this.controls.maxDistance = (MESH_MAX_DISTANCE_FACTOR * this.baseDistance()) / this.focus.zoom;
    } else {
      this.focusCentre = null;
      this.controls.maxPolarAngle = MESH_MAX_POLAR_RADIANS;
      this.controls.maxDistance = MESH_FULL_MAP_DISTANCE_FACTOR * mesh.radius;
    }
    this.constrainCamera();
    this.controls.update();
    this.updateUnitScale();
    this.requestRender();
  }

  // On the mesh: keeps the target within the pan radius of the focus and on
  // the floor (plus the free cam's lift), and the camera above the floor
  // beneath it, moving the camera with the target so the view does not swing.
  private constrainCamera(dt = 0): boolean {
    const mesh = this.dungeonMesh;
    if (this.constraining) return false;
    if (!mesh || this.walk) {
      this.collision.reset();
      return false;
    }
    const { target } = this.controls;
    const { position } = this.camera;
    // Measured before this pass's own clamps, so only a change something else
    // made (a zoom, a new shot) counts as a new distance to come back out to.
    const arrived = position.distanceTo(target);
    let moved = false;
    // The pan limit is for the user's camera: the Director's shot follows the
    // recorded group, and clamping it to the (grid-snapped, per-tick) follow
    // centre would step it.
    // Handing over, the limit is re-based to where the Director left the
    // camera (panSlack), so grabbing it never snaps it back in one step.
    if (this.focusCentre) {
      const panRadius = MESH_PAN_RADIUS_YARDS * mesh.scale;
      const beyond = () => Math.max(0, Math.hypot(target.x - this.focusCentre!.x, target.z - this.focusCentre!.z) - panRadius);
      if (this.directing()) {
        this.panSlack = beyond();
      } else {
        const clamped = clampToRadius(target, this.focusCentre, panRadius + this.panSlack);
        if (clamped !== target) {
          position.x += clamped.x - target.x;
          position.z += clamped.z - target.z;
          target.x = clamped.x;
          target.z = clamped.z;
          moved = true;
        }
        // Only shrinks: panning back toward the focus gives the slack up.
        this.panSlack = Math.min(this.panSlack, beyond());
      }
    }
    const floor = this.pivotFloor(target.x, target.z) + this.pivotLift;
    if (floor !== target.y) {
      position.y += floor - target.y;
      target.y = floor;
      moved = true;
    }
    // The camera above the floor beneath it, then clear of the cave (the
    // Director measures only: it eases in from the ray next frame).
    if (this.collision.clampAboveFloor(position)) moved = true;
    const before = this.collisionBefore.copy(position);
    const easing = this.collision.orbit(dt, arrived, this.directing() ? this.directorRig : null);
    if (!position.equals(before)) moved = true;
    if (moved) {
      this.constraining = true;
      this.controls.update();
      this.constraining = false;
    }
    this.collision.shown(position.distanceTo(target));
    return easing;
  }

  // The camera's elevation above the horizon, in degrees.
  private cameraElevationDeg(): number {
    const offset = this.directorVector.copy(this.camera.position).sub(this.controls.target);
    return (cameraAngles(offset).pitch * 180) / Math.PI;
  }

  // The compass direction the camera looks from; the Director keeps whatever
  // the user last orbited to.
  private cameraYaw(): number {
    const offset = this.directorVector.copy(this.camera.position).sub(this.controls.target);
    return cameraAngles(offset, 1e-6).yaw;
  }

  private emitCompassYaw() {
    this.hud.emitCompassYaw();
  }

  // Puts the camera `distance` from (x, z) on the floor, `elevationDeg` above
  // the horizon along `yaw`, and re-applies the mesh's floor and pan limits.
  private placeDirectorCamera(x: number, z: number, distance: number, elevationDeg: number, yaw: number) {
    const floor = this.pivotFloor(x, z);
    this.pivotLift = 0;
    this.controls.target.set(x, floor, z);
    const offset = cameraOffset(yaw, (elevationDeg * Math.PI) / 180, distance);
    this.camera.position.set(x + offset.x, floor + offset.y, z + offset.z);
    this.controls.update();
    this.constrainCamera();
    this.updateUnitScale();
  }

  // One Director step (DirectorRig.update); returns whether the camera needs another frame.
  private updateDirector(now: number): boolean {
    return this.directorRig.update(now);
  }

  // Steps a double-click move (TweenRig); returns whether it needs another frame.
  private updateCameraMove(now: number): boolean {
    return this.tween.updateMove(now);
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
    const unitHit = raycastUnits(this.raycaster, this.units);
    if (unitHit) {
      const guid = (unitHit.object.userData.guid as string | undefined) ?? null;
      const object = guid ? this.units.get(guid) : undefined;
      return { point: (object?.base ?? unitHit.point).clone(), guid };
    }
    const mesh = this.dungeonMesh;
    if (mesh) {
      const hit = this.world.intersectMesh(this.raycaster);
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
    if (this.walk) return;
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
    this.arbiter.take("tween", "double-click");
    this.tween.move = {
      from: target.clone(),
      to: hit.point.clone(),
      fromDistance: current,
      toDistance: Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, wanted)),
      direction: this.camera.position.clone().sub(target).normalize(),
      start: this.now(),
    };
    this.syncCameraOwner();
    this.requestRender();
  };

  dispose() {
    this.disposed = true;
    this.directorRig.dispose();
    this.unlockPointer();
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
    canvas.removeEventListener("pointercancel", this.handlePointerLoss);
    canvas.removeEventListener("lostpointercapture", this.handlePointerLoss);
    canvas.removeEventListener("wheel", this.handleWheel);
    canvas.removeEventListener("contextmenu", this.handleWalkContextMenu);
    if (this.walk) this.disposeAvatar(this.walk.avatar);
    this.walk = null;
    this.presence.dispose();
    this.unitLayer.dispose();
    this.planLayer.dispose();
    this.tokenTextures.dispose();
    clearTimeout(this.unitClickTimer);
    this.keyWindow.removeEventListener("keydown", this.handleKeyDown, { capture: true });
    this.keyWindow.removeEventListener("keyup", this.handleKeyUp);
    this.keyWindow.removeEventListener("blur", this.releaseKeys);
    this.debugLayer.clearDebugOverlays();
    this.hud.dispose();
    this.clearGround();
    this.dungeonMeshRequest = null;
    // The renderer's disposal frees this scene's GPU copy of the (shared) mesh.
    this.world.dungeonMesh = null;
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.effectsLayer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  // Applies the effects at the effect clock's current time (EffectsLayer).
  private updateEffects(now: number): boolean {
    return this.effectsLayer.updateEffects(now);
  }

  private updateWhelpAnimations(now: number): boolean {
    return this.unitLayer.updateWhelpAnimations(now);
  }

  /** Starts loading cast icons ahead of their first draw, through the same cache as iconTexture (HudLayer). */
  preloadIcons(urls: readonly string[]) {
    this.hud.preloadIcons(urls);
  }

  // Picks the effect under the pointer for the tooltip (EffectsLayer).
  private updateEffectHover() {
    this.effectsLayer.updateEffectHover();
  }

  // Health bars above the units (HudLayer).
  private updateBars() {
    this.hud.updateBars();
  }

  // Nameplates over the hovered and selected units (HudLayer).
  private updatePlates() {
    this.hud.updatePlates();
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

  private readonly handlePointerMove = (event: PointerEvent) => {
    const drag = this.input.drag;
    if (drag && !this.walk) {
      if (drag.engaged) {
        // Looks around the pivot exactly as walk mode looks around the head.
        drag.look(event, this.pointerLocked());
        this.free.lookFreeCam(drag.dx, drag.dy);
        return;
      }
      if (drag.pastSlop(event.clientX, event.clientY)) {
        drag.anchor(event.clientX, event.clientY);
        this.beginFreeCamDrag(drag);
      }
    }
    if (this.planInput && !this.walk) this.planInput.move(this.planPointAt(event), event, this.planPointer === event.pointerId);
    if (this.walk && drag) {
      // Drag looks around the character; right-drag also turns it to face the view.
      drag.look(event, this.pointerLocked());
      this.walkRig.look(this.walk, drag.dx, drag.dy, walkMouseControl(drag.buttons).steering);
      this.requestRender();
    }
    if (event.pointerType !== "mouse") {
      // Touch is camera input, not hover input. Avoid a full scene raycast and
      // label/effect picking on every finger move while OrbitControls rotates.
      this.pointerInside = true;
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = raycastUnits(this.raycaster, this.units);
    const guid = (hit?.object.userData.guid as string | undefined) ?? null;
    this.pointerInside = true;
    // The next frame re-picks the effect under the pointer.
    if (this.effectsLayer.effects) this.requestRender();
    if (guid === this.hoveredGuid) return;
    this.hoveredGuid = guid;
    this.updateCursor();
    this.updatePlates();
    this.requestRender();
  };

  // WoW's cursors: the sword over an enemy, the gauntlet elsewhere; a
  // drawing tool's crosshair wins over both.
  private updateCursor() {
    const kind = this.hoveredGuid ? this.units.get(this.hoveredGuid)?.kind : undefined;
    this.renderer.domElement.style.cursor = this.planInput
      ? "crosshair"
      : kind === "hostile" ? MAP_HOSTILE_CURSOR : kind ? MAP_UNIT_CURSOR : MAP_CURSOR;
  }

  /** Called with a unit's guid when it is clicked (not dragged, not double-clicked). */
  setOnUnitClick(callback: ((guid: string) => void) | null) {
    this.onUnitClick = callback;
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (this.planInput && event.button === 0 && !this.walk) {
      // A drawing tool has the left button (the camera keeps right-drag and the wheel).
      this.pointerDownAt = null;
      this.planPointer = event.pointerId;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      this.planInput.down(this.planPointAt(event), event);
      return;
    }
    // Touch is exclusively camera input on mobile. It should not turn the end
    // of a drag or pinch into a unit click.
    this.pointerDownAt = event.pointerType === "mouse" && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    if (!this.walk && event.pointerType === "mouse" && (event.button === 0 || event.button === 2)) {
      // OrbitControls owns touch gestures. The custom pointer-lock drag is only
      // for a mouse; trying to lock a touch pointer makes mobile orbiting jump.
      const drag = (this.input.drag ??= new MouseDrag());
      drag.press(event.button, event.clientX, event.clientY);
      // Both buttons move forward at once, as in walk mode, without waiting for a drag.
      if (walkMouseControl(drag.buttons).movingForward) this.beginFreeCamDrag(drag);
    }
    const walkButton = walkDragButton(event.pointerType, event.button);
    if (this.walk && (walkButton === 0 || walkButton === 2)) {
      // Walk mode looks from the press.
      const drag = (this.input.drag ??= new MouseDrag());
      drag.press(walkButton, event.clientX, event.clientY);
      drag.engaged = true;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      // Hide a mouse cursor while dragging; touch keeps its real coordinates.
      if (event.pointerType === "mouse") this.lockPointer();
    }
  };

  // A free-cam press became a drag (past a click, or both buttons): it takes
  // the camera from the Director and hides the cursor, as WoW does.
  private beginFreeCamDrag(drag: MouseDrag) {
    if (drag.engaged) return;
    drag.engaged = true;
    this.pointerDownAt = null;
    this.lockPointer();
    this.handleControlsStart();
    this.requestRender();
  }

  // A press and release without moving (a drag looks around) on a unit.
  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.planInput && this.planPointer === event.pointerId) {
      this.planPointer = null;
      this.planInput.up(this.planPointAt(event), event);
      return;
    }
    const walkButton = walkDragButton(event.pointerType, event.button);
    const drag = this.input.drag;
    if (this.walk && drag && (walkButton === 0 || walkButton === 2)) {
      if (drag.release(walkButton)) {
        drag.anchor(event.clientX, event.clientY);
      } else {
        this.input.drag = null;
        this.unlockPointer();
      }
    }
    if (!this.walk && drag && (event.button === 0 || event.button === 2)) {
      if (!drag.release(event.button)) {
        this.input.drag = null;
        this.unlockPointer();
        if (drag.engaged) this.handleControlsEnd();
      }
    }
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down || event.button !== 0 || !this.onUnitClick) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > UNIT_CLICK_SLOP_PX) return;
    const guid = this.pickScenePoint(event)?.guid;
    clearTimeout(this.unitClickTimer);
    if (!guid) return;
    this.unitClickTimer = window.setTimeout(() => this.onUnitClick?.(guid), UNIT_CLICK_DELAY_MS);
  };

  // A cancelled touch (a system gesture, an edge swipe) never sends its
  // pointerup: end the drag here as pointerup would, so the camera follows again.
  private readonly handlePointerLoss = (event: PointerEvent) => {
    if (!pointerLossEndsDrag(event.type, event.pointerType)) return;
    const drag = this.input.drag;
    if (this.walk && drag) {
      this.input.drag = null;
      this.unlockPointer();
    }
    if (!this.walk && drag) {
      this.input.drag = null;
      this.unlockPointer();
      if (drag.engaged) this.handleControlsEnd();
    }
  };

  private readonly handlePointerLeave = () => {
    this.pointerInside = false;
    this.requestRender();
    if (!this.hoveredGuid) return;
    this.hoveredGuid = null;
    this.updatePlates();
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
    this.arbiter.take("free", "gesture");
    this.gestureStart = this.cameraViewport();
    this.syncCameraOwner();
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

  // Map keys act while the pointer is over the map (or while walking), never
  // while typing. Modified presses (e.g. Shift+F for focus mode) belong to the
  // page, except Shift with a movement key: the free cam travels faster.
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    this.input.fast = event.shiftKey;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (event.code === WALK_TOGGLE_KEY && !event.shiftKey && (this.pointerInside || this.walk)) {
      event.preventDefault();
      if (!event.repeat) this.setWalking(!this.walk);
      return;
    }
    if (event.key === "Escape" && !event.shiftKey && this.walk) {
      // Handled here, so focus mode's Esc (which skips handled presses) stays put.
      event.preventDefault();
      this.setWalking(false);
      return;
    }
    if (!this.pointerInside && !this.walk) return;
    const action = actionForKey(event.code, this.adStrafe);
    if (!action) return;
    event.preventDefault();
    const held = this.input.held;
    if (held.has(action)) return;
    // The first orbit key takes the camera like a drag does: the Director pauses.
    if (!this.walk && held.size === 0) {
      this.handleControlsStart();
      this.free.restartClock();
    }
    held.add(action);
    this.requestRender();
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.input.fast = event.shiftKey;
    const action = actionForKey(event.code, this.adStrafe);
    if (!action || !this.input.held.delete(action)) return;
    if (!this.walk && this.input.held.size === 0) this.handleControlsEnd();
  };

  // Focus left the window mid-press: the keyup never arrives.
  private readonly releaseKeys = () => {
    this.input.fast = false;
    if (this.input.held.size === 0) return;
    this.input.held.clear();
    if (!this.walk) this.handleControlsEnd();
  };

  /** Continuous input from the fullscreen mobile d-pad and look joystick. */
  setMobileInput(input: MobileMapInput | null) {
    const mobile = input !== null;
    // Touch keeps its own inertia on the mobile layout; the mouse never coasts.
    this.controls.enableDamping = mobile;
    this.controls.rotateSpeed = mobile ? MOBILE_ORBIT_ROTATE_SPEED : ORBIT_ROTATE_SPEED;
    this.controls.zoomSpeed = mobile ? MOBILE_ORBIT_ZOOM_SPEED : ORBIT_ZOOM_SPEED;
    this.controls.panSpeed = mobile ? MOBILE_ORBIT_PAN_SPEED : ORBIT_PAN_SPEED;
    // Phone gestures should be predictable: one finger orbits, while two
    // fingers pinch and pan together. Zoom-to-finger stays off so the orbit
    // target does not lurch toward either touch point.
    this.controls.enablePan = true;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    const next = clampMobileMapInput(input ?? IDLE_MOBILE_MAP_INPUT);
    const wasActive = mobileInputActive(this.input.mobile);
    const active = mobileInputActive(next);
    if (!this.walk && !wasActive && active) {
      this.handleControlsStart();
      this.free.restartClock();
    }
    this.input.mobile = next;
    if (!this.walk && wasActive && !active) this.handleControlsEnd();
    if (active) this.requestRender();
  }

  // The free-cam mover's frame step (FreeRig.update).
  private updateKeyboardCamera(now: number, input: InputFrame): boolean {
    return this.free.update(now, input, this.walk !== null);
  }

  /** Scales units and their attached markers relative to the map's normal size. */
  setChipScale(scale: number) {
    if (scale === this.chipScale) return;
    this.chipScale = scale;
    this.updateUnitScale(true);
    this.requestRender();
  }

  /** The target frames' units: halos for the selected chain and pins, and the chain's target lines. */
  setUnitRoles(roles: MapUnitRoles) {
    this.unitLayer.setUnitRoles(roles);
  }

  /** Called with where you are on the mesh (throttled), for a live session; null once you are not (LivePresence). */
  setOnPresence(callback: ((presence: LiveMapPresence | null) => void) | null) {
    this.presence.setOnPresence(callback);
  }

  // Your camera, or your character while walking; null off the mesh.
  private currentPresence(): LiveMapPresence | null {
    const mesh = this.dungeonMesh;
    if (!mesh) return null;
    const round = (value: number) => Math.round(value * 1000) / 1000;
    const vector = (value: THREE.Vector3): [number, number, number] => [round(value.x), round(value.y), round(value.z)];
    const walk = this.walk;
    if (walk) {
      const ahead = walk.position.clone().add(new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw)).multiplyScalar(mesh.scale));
      return { ground: mesh.url, mode: "walk", position: vector(walk.position), target: vector(ahead) };
    }
    return { ground: mesh.url, mode: "camera", position: vector(this.camera.position), target: vector(this.controls.target) };
  }

  /** Sends your presence when it changed (throttled), or regardless with `force` (the heartbeat; LivePresence). */
  emitPresence(force = false) {
    this.presence.emitPresence(force);
  }

  /** Everyone else's presence in the live session, drawn where it is on the same mesh (LivePresence). */
  setRemotePresences(presences: ReadonlyMap<string, LiveMapPresence>) {
    this.presence.setRemotePresences(presences);
  }

  // Eases others' presences toward their latest update; true while any moves.
  private updateRemotePresences(now: number): boolean {
    return this.presence.updateRemotePresences(now, this.dungeonMesh, this.unitScale);
  }

  // The token parts that follow the replay (UnitLayer.updateTokens).
  private updateTokens(now: number) {
    this.unitLayer.updateTokens(now);
  }

  /** The plan items to draw (the current step's, plus any being drawn), and the selected one. */
  setPlanItems(items: readonly PlanItem[], selectedId: string | null) {
    this.planItems = items;
    this.planSelected = selectedId;
    this.planLayer.setItems(items, selectedId, this.planSurface);
    this.requestRender();
  }

  /**
   * A drawing tool's pointer handlers (null: none). While set, the left
   * button draws instead of looking around; points are world plan points on the
   * dungeon floor (null off the mesh).
   */
  setPlanInput(input: PlanInput | null) {
    this.planInput = input;
    this.planPointer = null;
    this.updateCursor();
  }

  /** Whether plans can be drawn: they need the dungeon mesh's floor. */
  canPlan(): boolean {
    return this.planSurface !== null;
  }

  // The dungeon floor under the pointer, as a world plan point.
  private planPointAt(event: MouseEvent): PlanPoint | null {
    const mesh = this.dungeonMesh;
    if (!mesh) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.world.intersectMesh(this.raycaster);
    return hit ? this.sceneToPlan(hit.point) : null;
  }

  // World (yards) <-> scene on the mesh: the projection markers use there
  // (renderedDungeonMapPoint), with heights in yards above the mesh origin.
  private sceneToPlan(point: THREE.Vector3): PlanPoint {
    const { bounds, scale } = this.dungeonMesh!;
    const left = point.x / GROUND_WIDTH + 0.5;
    const top = point.z / (GROUND_WIDTH * this.aspect) + 0.5;
    return {
      x: bounds.maxX - top * (bounds.maxX - bounds.minX),
      y: bounds.maxY - left * (bounds.maxY - bounds.minY),
      z: point.y / scale,
    };
  }

  private planToScene(point: PlanPoint): { x: number; z: number } {
    const { bounds } = this.dungeonMesh!;
    return mapPointToScene({
      leftPercent: ((bounds.maxY - point.y) / (bounds.maxY - bounds.minY)) * 100,
      topPercent: ((bounds.maxX - point.x) / (bounds.maxX - bounds.minX)) * 100,
    }, this.aspect, GROUND_WIDTH);
  }

  // The plan layer's surface for the loaded mesh (rebuilt per mesh), or null without one.
  private updatePlanSurface() {
    const mesh = this.dungeonMesh;
    this.planSurface = mesh ? {
      scale: mesh.scale,
      toScene: (point) => this.planToScene(point),
      floorAt: (x, z, hintY) => this.world.castFloor(x, z, (hintY ?? this.cameraCeiling() ?? 1e4) + WALK_STEP_YARDS * mesh.scale) ?? hintY ?? 0,
    } : null;
    this.planLayer.setItems(this.planItems, this.planSelected, this.planSurface);
  }

  /**
   * Who owns the camera now (cameraArbiter.ts): "director" is the follow
   * camera (the Director for the group or a followed unit, or the host's
   * follow framing on the tiles); "free", "walk" and "tween" are the viewer's
   * camera while the follow camera is on; "scripted" an applied pose.
   */
  cameraOwner(): CameraOwner {
    return this.arbiter.owner();
  }

  /** Whether the viewer took the camera from the follow camera and has not handed it back (cameraArbiter.ts: taken). */
  cameraTaken(): boolean {
    return this.arbiter.taken;
  }

  /**
   * Called with the camera owner and cameraTaken() now, then whenever either
   * changes (once a change settles, and at the end of a frame). It may act on
   * the scene: a change it causes is reported after it returns, never from
   * inside it.
   */
  setOnCameraOwnerChange(callback: ((owner: CameraOwner, taken: boolean) => void) | null) {
    this.arbiter.setOnChange(callback);
  }

  // Reports the camera owner if it changed (once a change has settled).
  private syncCameraOwner() {
    this.arbiter.sync();
  }

  /** Called when the followed unit changes: Follow, a double-click, or the user taking the camera (null). */
  setOnFollowChange(callback: ((guid: string | null) => void) | null) {
    this.onFollowChange = callback ?? (() => {});
  }

  /**
   * The cinematic camera follows `guid` (null: back to the group). Needs the
   * dungeon mesh and the Director; leaves walk mode.
   */
  followUnit(guid: string | null) {
    if (guid === this.subject) return;
    if (guid && (!this.director || !this.dungeonMesh || !this.units.has(guid))) {
      this.onFollowChange(this.subject);
      return;
    }
    if (guid && this.walk) this.stopWalk();
    this.directorSubject = guid;
    this.engageDirector();
    this.requestRender();
  }

  /** Use A/D to strafe instead of turning. */
  setAdStrafe(on: boolean) {
    if (on === this.adStrafe) return;
    // A held key would be released as the other action.
    this.releaseKeys();
    this.adStrafe = on;
  }

  /** Called when walk mode starts or ends (G, Esc, the button, or losing the mesh). */
  setOnWalkChange(callback: ((walking: boolean) => void) | null) {
    this.onWalkChange = callback ?? (() => {});
  }

  /** Walk mode needs yards: the dungeon mesh's, or the flat artwork's (setFlatYards). */
  canWalk(): boolean {
    return this.world.yardScale(this.aspect) !== null;
  }

  /**
   * The flat artwork's scale for walking on it: the map-percent step of one
   * yard along world x and along world y, from the same projection as the
   * units; null when the artwork has no world mapping.
   */
  setFlatYards(perYard: { x: MapPoint; y: MapPoint } | null) {
    this.world.flatYards = perYard;
    this.updateUnitScale();
  }

  setWalking(on: boolean) {
    this.walkCaptureActive = false;
    this.walkCaptureElapsedMs = null;
    if (on === (this.walk !== null)) return;
    if (on) this.startWalk();
    else this.stopWalk();
    this.syncCameraOwner();
  }

  // The character starts where the camera looks, facing away from it.
  private startWalk() {
    const scale = this.world.yardScale(this.aspect);
    if (scale === null) {
      this.onWalkChange(false);
      return;
    }
    this.releaseKeys();
    // A free-cam drag in progress ends here; walk mode starts its own on the next press.
    if (this.input.drag) {
      this.input.drag = null;
      this.unlockPointer();
    }
    this.arbiter.take("walk", "walk");
    const target = this.controls.target;
    const offset = new THREE.Vector3().copy(this.camera.position).sub(target);
    const position = target.clone();
    position.y = this.world.castFloor(position.x, position.z, position.y + WALK_STEP_YARDS * scale) ?? position.y;
    const camYaw = cameraAngles(offset).yaw;
    const avatar = createAvatar(this.geometries);
    avatar.scale.setScalar((MESH_PLAYER_HEIGHT_YARDS * scale) / PLAYER_GEOMETRY_HEIGHT);
    this.scene.add(avatar);
    this.walk = {
      position,
      yaw: camYaw,
      vy: 0,
      grounded: true,
      camYaw,
      camSettling: false,
      camPitch: WALK_START_PITCH_RADIANS,
      camDistance: WALK_START_DISTANCE_YARDS,
      camShown: WALK_START_DISTANCE_YARDS,
      lastMs: 0,
      avatar,
      capsule: avatar.children[0] as THREE.Mesh,
      model: null,
      bodyTurn: 0,
    };
    this.dressAvatar(this.walk);
    this.controls.enabled = false;
    this.camera.near = WALK_NEAR_YARDS * scale;
    this.camera.far = WALK_FAR_YARDS * scale;
    this.camera.updateProjectionMatrix();
    this.onWalkChange(true);
    this.requestRender();
  }

  // Puts the character down at the centre of `viewport` (the new fight's
  // framing), on the floor there, keeping the camera's angle and zoom.
  private moveWalkTo(viewport: MapViewport) {
    const walk = this.walk;
    if (!walk || this.world.yardScale(this.aspect) === null) return;
    // The full map's centre is nowhere in particular: then the fight's focus.
    const whole = viewport.zoom <= FULL_MAP_VIEWPORT.zoom && this.focus;
    const point = whole && this.focus ? this.focus.centre : { leftPercent: viewport.centerX * 100, topPercent: viewport.centerY * 100 };
    const { x, z } = mapPointToScene(point, this.aspect, GROUND_WIDTH);
    walk.position.set(x, this.world.floorHeights.heightAt("walk", x, z, this.cameraCeiling()), z);
    walk.vy = 0;
    walk.grounded = true;
    this.requestRender();
  }

  // Back to the orbit camera, centred where the character stood.
  private stopWalk() {
    const walk = this.walk;
    if (!walk) return;
    this.walk = null;
    this.input.held.clear();
    // Walk mode's drag ends with it.
    this.input.drag = null;
    this.unlockPointer();
    walk.model?.mixer.stopAllAction();
    this.disposeAvatar(walk.avatar);
    // The free cam picks up behind and above where the character stood, its
    // pivot at the character's feet (still in the air if they were flying).
    const distance = Math.max(walk.camDistance, WALK_EXIT_DISTANCE_YARDS) * (this.world.yardScale(this.aspect) ?? 1);
    const pitch = Math.max(walk.camPitch, WALK_START_PITCH_RADIANS);
    this.controls.target.copy(walk.position);
    this.pivotLift = Math.max(0, walk.position.y - this.pivotFloor(walk.position.x, walk.position.z));
    const offset = cameraOffset(walk.camYaw, pitch, distance);
    this.camera.position.set(walk.position.x + offset.x, walk.position.y + offset.y, walk.position.z + offset.z);
    this.controls.enabled = true;
    this.camera.near = ORBIT_NEAR;
    this.camera.far = ORBIT_FAR;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.constrainCamera();
    this.updateUnitScale();
    this.onWalkChange(false);
    this.requestRender();
  }

  /** Deterministically advances first-person walking for frame-by-frame capture. */
  setWalkCaptureFrame(elapsedMs: number, input: MobileMapInput, startGuid?: string, lookAtGuid?: string, preRollMs = 0, preRollInput: MobileMapInput = IDLE_MOBILE_MAP_INPUT) {
    const restart = this.walk === null || this.walkCaptureElapsedMs === null || elapsedMs < this.walkCaptureElapsedMs;
    if (restart) {
      if (this.walk) this.stopWalk();
      this.startWalk();
      const walk = this.walk;
      const start = startGuid ? this.units.get(startGuid) : null;
      const lookAt = lookAtGuid ? this.units.get(lookAtGuid) : null;
      const scale = this.world.yardScale(this.aspect);
      if (walk && start && lookAt && scale !== null) {
        const away = new THREE.Vector3().copy(start.base).sub(lookAt.base).setY(0);
        if (away.lengthSq() > 1e-6) away.normalize().multiplyScalar(1.5 * scale);
        walk.position.copy(start.base).add(away);
        walk.position.y = this.world.floorHeights.heightAt("walk-capture", walk.position.x, walk.position.z, this.cameraCeiling());
        const dx = lookAt.base.x - walk.position.x;
        const dz = lookAt.base.z - walk.position.z;
        walk.yaw = Math.atan2(-dx, -dz);
        walk.camYaw = walk.yaw;
      }
      this.walkCaptureElapsedMs = 0;
      if (this.walk) {
        this.input.mobile = clampMobileMapInput(preRollInput);
        this.walk.lastMs = 1;
        for (let at = 101; at <= preRollMs + 1; at += 100) this.updateWalk(at, this.input.frame());
        this.walk.lastMs = elapsedMs + 1;
      }
    }
    const walk = this.walk;
    if (!walk) return;
    this.walkCaptureActive = true;
    this.input.mobile = clampMobileMapInput(input);
    walk.camDistance = 0;
    walk.camPitch = 0;
    this.updateWalk(elapsedMs + 1, this.input.frame());
    this.walkCaptureElapsedMs = elapsedMs;
    this.syncCameraOwner();
    this.requestRender();
  }

  /** The character to walk as: "capsule" or a monster from walkAvatars. */
  setWalkAvatar(id: string) {
    if (id === this.walkAvatarId) return;
    this.walkAvatarId = id;
    if (this.walk) this.dressAvatar(this.walk);
  }

  // Swaps the walking character's model for the chosen one. The capsule
  // stands in while it loads, and stays if it fails to.
  private dressAvatar(walk: WalkState) {
    if (walk.model) {
      walk.model.mixer.stopAllAction();
      walk.avatar.remove(walk.model.root);
      walk.model = null;
    }
    walk.capsule.visible = true;
    const id = this.walkAvatarId;
    const url = walkAvatarUrl(id);
    if (!url) return;
    loadWalkAvatar(url).then((template) => {
      if (this.disposed || this.walk !== walk || this.walkAvatarId !== id || walk.model) return;
      walk.model = createWalkAvatarModel(template);
      walk.avatar.add(walk.model.root);
      walk.capsule.visible = false;
      this.requestRender();
    }).catch(() => {});
  }

  private disposeAvatar(avatar: THREE.Group) {
    this.scene.remove(avatar);
    avatar.traverse((child) => {
      if (child.userData.sharedAsset) return;
      const material = (child as THREE.Mesh).material as THREE.Material | undefined;
      material?.dispose();
    });
  }

  // Moves the character for the held keys, applies gravity or flight and the
  // floor, and eases the camera behind it while moving forward; true while walking.
  private updateWalk(now: number, input: InputFrame): boolean {
    const walk = this.walk;
    if (!walk) return false;
    const scale = this.world.yardScale(this.aspect);
    if (scale === null) {
      this.stopWalk();
      return false;
    }
    const dt = frameStepSeconds(now, walk.lastMs);
    walk.lastMs = now;

    // Right-click owns facing in WoW: the character faces away from the camera,
    // and every movement axis is therefore relative to the camera direction.
    walk.yaw = walkMovementYaw(walk.yaw, walk.camYaw, input.steering);
    const { turn, strafe, forward } = input;
    if (turn) {
      walk.yaw = turnYaw(walk.yaw, turn, dt);
    }
    // The camera trails behind (WalkRig.trail).
    this.walkRig.trail(walk, input, dt);
    if (forward || strafe) {
      // Facing (yaw) points along -z turned by yaw, as a unit's facing cone does.
      const step = planarStep(walk.yaw, forward, strafe, (forward < 0 ? WALK_BACK_YPS : WALK_RUN_YPS) * scale * dt);
      walk.position.x += step.x;
      walk.position.z += step.z;
    }

    // Space jumps from the ground and, held, keeps flying up; Z flies down.
    if (input.jump) {
      walk.vy = walk.grounded ? WALK_JUMP_YPS * scale : Math.max(walk.vy, WALK_FLY_YPS * scale);
      walk.grounded = false;
    } else if (input.descend && !walk.grounded) {
      walk.vy = Math.min(walk.vy, -WALK_FLY_YPS * scale);
    }
    if (!walk.grounded) walk.vy -= WALK_GRAVITY_YPS2 * scale * dt;
    const ceiling = walk.position.y + WALK_STEP_YARDS * scale;
    walk.position.y += walk.vy * dt;
    const floor = this.world.castFloor(walk.position.x, walk.position.z, ceiling);
    if (floor !== null) {
      const stepping = walk.grounded && walk.vy <= 0 && walk.position.y - floor <= WALK_STEP_YARDS * scale;
      if (walk.position.y <= floor || stepping) {
        walk.position.y = floor;
        walk.vy = 0;
        walk.grounded = true;
      } else {
        walk.grounded = false;
      }
    } else if (walk.grounded) {
      // Off the mesh: stay level rather than fall forever.
      walk.vy = 0;
    }

    if (walk.model) {
      playWalkAvatarState(walk.model, !walk.grounded ? "air" : !forward && !strafe ? "idle" : forward < 0 ? "walk" : "run");
      walk.model.mixer.update(dt);
    }
    // Strafing turns the body toward where it goes, as in WoW: 45° running
    // diagonally, 90° sideways, and backing away diagonally while backpedalling.
    // Only the model turns; movement and the camera keep the facing.
    const bodyTurn = !strafe ? 0 : forward < 0 ? Math.atan2(strafe, -forward) : -Math.atan2(strafe, forward);
    walk.bodyTurn += (bodyTurn - walk.bodyTurn) * (1 - Math.exp(-WALK_BODY_TURN_RATE_PER_S * dt));
    walk.avatar.position.copy(walk.position);
    walk.avatar.rotation.y = walk.yaw + walk.bodyTurn;
    // The camera behind the head (WalkRig.place); in first person the body hides.
    walk.avatar.visible = !this.walkRig.place(walk, walk.position, scale, dt);
    this.updateUnitScale();
    return true;
  }

  // The wheel zooms the camera toward its pivot, the same in both modes:
  // walking, down to first person; on the free cam, down to the closest the
  // orbit camera goes. Registered before OrbitControls, which never sees it.
  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const walk = this.walk;
    if (!walk) {
      if (!this.controls.enabled) return;
      // From the distance the user chose, not where a wall pulled the camera in.
      const { yaw, pitch, distance } = this.free.freeCamAngles();
      const next = wheelZoomDistance(this.collision.wantDistance ?? distance, event.deltaY, this.controls.minDistance, this.controls.maxDistance);
      this.handleControlsStart();
      this.free.placeFreeCam(yaw, pitch, next);
      this.handleControlsEnd();
      this.requestRender();
      return;
    }
    this.walkRig.zoom(walk, event.deltaY);
    this.requestRender();
  };

  // Right-drag turns the character, so no context menu while walking.
  private lockPointer() {
    const canvas = this.renderer.domElement;
    if (this.pointerLocked() || !canvas.requestPointerLock) return;
    // A refused lock (no user gesture, unsupported) just leaves the cursor shown.
    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  }

  // Whether the canvas holds the pointer lock (then drags report movementX/Y).
  private pointerLocked(): boolean {
    return document.pointerLockElement === this.renderer.domElement;
  }

  private unlockPointer() {
    if (this.pointerLocked()) document.exitPointerLock();
  }

  private readonly handleWalkContextMenu = (event: MouseEvent) => {
    if (this.walk) event.preventDefault();
  };

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.onContextLost();
  };

  private readonly resize = () => {
    const viewport = this.alignmentOverlay ? this.cameraViewport() : null;
    const width = this.capture?.width ?? Math.max(1, this.container.clientWidth);
    const height = this.capture?.height ?? Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (viewport) this.placeCamera(viewport, TOP_DOWN_OFFSET);
    else this.requestRender();
  };

  // A capture scene draws only when asked (captureFrame), at the frame's own time.
  private readonly requestRender = () => {
    if (this.disposed || this.frame || this.capture) return;
    this.frame = requestAnimationFrame((now) => {
      this.frame = 0;
      if (this.disposed) return;
      // Only keeps a frame loop running while something moves (playback
      // effects, a re-framing, the Director, coasting damping); otherwise
      // rendering stays on demand.
      if (this.renderFrame(now)) this.requestRender();
      else this.restartFrameClocks();
    });
  };

  // The loop is going to sleep: the clocks that step from their last frame
  // start again, so the first frame after the next wake takes a first-frame
  // step (FIRST_FRAME_STEP_S), not one 0.1 s step for the whole sleep. The
  // free-cam mover and the collision ease-out already restart whenever they
  // stop; walk mode never lets the loop sleep. Capture scenes (stepped by
  // captureFrame) never get here.
  private restartFrameClocks() {
    this.directorRig.restartClock();
    this.unitLayer.restartClock();
    this.presence.restartClock();
  }

  // One frame of the render loop at `now` (ms). Returns whether something is
  // still moving and needs another frame.
  private renderFrame(now: number): boolean {
    const reframing = this.updateViewAnimation(now);
    const moving = this.updateCameraMove(now);
    const directing = this.updateDirector(now);
    const input = this.input.frame();
    const keyMoving = this.updateKeyboardCamera(now, input);
    const walking = this.walkCaptureActive ? this.walk !== null : this.updateWalk(now, input);
    const presencesMoving = this.updateRemotePresences(now);
    // Damping coasts the camera to a stop after a gesture; update() reports
    // whether it is still moving, so the loop idles again once it settles.
    // Walking, the character places the camera; OrbitControls would clamp it back.
    const damping = !walking && this.controls.update();
    const collisionDt = this.collision.step(now);
    // A camera pulled in by a wall eases back out once the wall is gone.
    const uncolliding = !walking && this.constrainCamera(collisionDt);
    if (!uncolliding && !damping) this.collision.rest();
    const effectsAnimating = this.updateEffects(now);
    const whelpsAnimating = this.updateWhelpAnimations(now);
    const animating = effectsAnimating || whelpsAnimating || reframing || moving || directing || keyMoving || (!this.walkCaptureActive && walking) || presencesMoving || damping || uncolliding;
    this.updateTokens(now);
    this.updateBars();
    this.updateEffectHover();
    this.emitCompassYaw();
    // Nameplates keep their screen size as the camera moves.
    this.updatePlates();
    this.renderer.render(this.scene, this.camera);
    this.emitPresence();
    // A tween or move that ended this frame hands the camera on.
    this.syncCameraOwner();
    return animating;
  }
}

