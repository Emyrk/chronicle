import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mapAssetUrl, type WowMapFloorBounds, type WowMapLayer, type WowMapMeshLiquid } from "@/pages/Technical/mapGallery";
import type { MapCameraPose } from "./cameraPath";
import type { DroneProbe } from "./droneCamera";
import { CAPSULE_AVATAR, walkAvatarUrl } from "./walkAvatars";
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
import type { LiveMapPresence } from "../../liveSessionProtocol";
import { actionForKey, cameraAngles, cameraCollisionDistance, cameraOffset, clampMobileMapInput, easeAngleToward, frameStepSeconds, freeCamTravelSpeed, IDLE_MOBILE_MAP_INPUT, lookDrag, type MobileMapInput, planarStep, pointerLossEndsDrag, shouldFollowWalkCamera, stickPitch, turnYaw, WALK_TOGGLE_KEY, walkCameraSettling, walkDragButton, walkMouseControl, walkMovementYaw, wheelZoomDistance } from "./mapControls";
import { climbElevations, createShotHold, directorPullIn, fallbackShot, FOLLOW_CENTRE_WINDOW_MS, FOLLOW_SHOT_CHECK_MS, FOLLOW_STEEP_ELEVATION_DEG, releaseSteepShot, shotCheckDue, steepPullIn, FOLLOW_SIGHT_STRIDE, FOLLOW_STEEP_MIN_DISTANCE_YARDS, seesFraming, sightPicks, type ShotAnswer, FOLLOW_SLICE_MS, followSprings, followYawStep, handOverFollowSpring, handOverFollowYaw, startFollowTrackBuild, wrapAngle, type FollowTrackBuild, followKeyAt, glideDurationMs, glidePoseAt, glideTurnMs, unwrapNear, holdShot, isReplayJump, type FollowKey, type FollowTrack, type FollowYawProbe, type GlidePose } from "./followCamera";
import { type DispelKind } from "./unitTokenArt";
import { UnitTokenTextures } from "./unitTokens";
import type { PlanInput, PlanItem, PlanMarkerIcon, PlanPoint } from "./plan/mapPlan";
import { PlanLayer, type PlanSurface } from "./plan/planLayer";
import {
  clampToRadius,
  medianHeight,
} from "./dungeonMeshes";
import { MAP_CURSOR, MAP_HOSTILE_CURSOR, MAP_UNIT_CURSOR } from "./mapCursors";
import { FLOOR_TRACK_TOLERANCE_YARDS, floorTrackAt, type FloorTracks } from "./walkableFloors";
import { flatArtworkUnitScale, FOCUS_RADIUS_YARDS, FULL_MAP_VIEWPORT, interpolateViewport, mapPointToScene, topDownMapDistance, type MapPoint, type MapViewport } from "./mapModel";
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
  COLLISION_RETURN_RATE_PER_S,
  DEFAULT_AD_STRAFE,
  DOUBLE_CLICK_MS,
  DOUBLE_CLICK_OUT_FACTOR,
  FRAME_STEP_MAX_S,
  FREE_CAM_COLLISION_PADDING_SCENE_UNITS,
  FREE_CAM_MAX_PITCH_RADIANS,
  FREE_CAM_MIN_DISTANCE_SCENE_UNITS,
  FREE_CAM_TRAVEL_DISTANCES_PER_S,
  MESH_FULL_MAP_DISTANCE_FACTOR,
  MESH_MAX_DISTANCE_FACTOR,
  MESH_MAX_POLAR_RADIANS,
  MIN_DOUBLE_CLICK_DISTANCE_YARDS,
  MOBILE_ORBIT_DAMPING,
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
  WALK_CAMERA_FOLLOW_RATE_PER_S,
  WALK_CAMERA_TURN_FOLLOW_RATE_PER_S,
  WALK_COLLISION_PADDING_YARDS,
  WALK_EXIT_DISTANCE_YARDS,
  WALK_EYE_YARDS,
  WALK_FIRST_PERSON_EXIT_YARDS,
  WALK_FIRST_PERSON_YARDS,
  WALK_FLY_YPS,
  WALK_GRAVITY_YPS2,
  WALK_JUMP_YPS,
  WALK_MAX_DISTANCE_YARDS,
  WALK_PITCH_LIMIT_RADIANS,
  WALK_RUN_YPS,
  WALK_START_DISTANCE_YARDS,
  WALK_START_PITCH_RADIANS,
  WALK_STEP_YARDS,
} from "./controlProfile";
import { LivePresence } from "./livePresence";
import { DungeonWorld, type DungeonMesh } from "./dungeonWorld";
import { DebugOverlayLayer } from "./debugOverlays";
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
// The camera stays at least this far (scene units) above the floor beneath it.
const MESH_CAMERA_CLEARANCE = 0.3;
// The camera direction the mesh starts from: steeper than ANGLED_OFFSET so
// the rock between the camera and a sunken chamber hides less of the fight.
const MESH_ANGLED_OFFSET = new THREE.Vector3(0, 1.6, 0.75);

// --- Navigation: every control tunable is in controlProfile.ts ---
// The orbit camera's near plane (0.5 scene units, several yards on the mesh)
// would clip the floor at your feet, leaving the bottom of the view black, so
// walking pulls it in close and the far plane with it, for depth precision.
const WALK_NEAR_YARDS = 0.1;
const WALK_FAR_YARDS = 3000;

// A Director spring is settled once it is within this fraction of its goal.
const DIRECTOR_SETTLED = 1e-3;
// The yaw counts as settled within this (radians).
const DIRECTOR_SETTLED_YAW = 1e-3;
// With even the highest elevation blocked, the shot comes this much closer.
const CLEAR_SHOT_SHORTEN = 0.75;
// The elevations the Director's line of sight climbs through.
const DIRECTOR_CLIMB = climbElevations(CINEMATIC_ELEVATION_DEG, CINEMATIC_ELEVATION_STEP_DEG, MAX_CINEMATIC_ELEVATION_DEG);
// A wall pulls the Director's camera in over about this long (seconds) instead
// of in one frame; it eases back out at the distance spring's pace.
const DIRECTOR_COLLISION_IN_SECONDS = 0.25;
// A user's jump (cutDirector) cuts when the replay jumps within this long of it.
const DIRECTOR_CUT_WINDOW_MS = 1_000;

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

/** What a follow track was built for. */
interface FollowTrackInputs {
  key: string;
  subject: string | null;
  aspect: number;
  scale: number;
  speed: number;
  endMs: number;
  /** The no-Z floor tracks the yaw probe read units' heights from (null before they land: their arrival rebuilds the track). */
  floors: FloorTracks | null;
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
  private readonly controls: OrbitControls;
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
  // The free cam's pivot (controls.target) rides this far (scene units)
  // above the floor below it: Space/Z fly it up and down.
  private pivotLift = 0;
  private unitClickTimer = 0;
  private groundKey = "";
  private aspect = 1;
  private viewport: MapViewport = FULL_MAP_VIEWPORT;
  // A re-framing easing the camera from `from` to `this.viewport`.
  private viewAnimation: { from: MapViewport; direction: THREE.Vector3; start: number; duration: number } | null = null;
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
  // The user took the camera; a viewport request (Follow, encounter jump,
  // selection) hands it back.
  private directorPaused = false;
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
  private readonly directorAim = new THREE.Vector3();
  private readonly directorEye = new THREE.Vector3();
  // Camera collision scratch, and the orbit distance the user wants (the
  // camera may sit closer while a wall is in the way) and the one last set.
  private readonly collisionEye = new THREE.Vector3();
  private readonly collisionBefore = new THREE.Vector3();
  private readonly collisionFrom = new THREE.Vector3();
  private readonly collisionDirection = new THREE.Vector3();
  private orbitWantDistance: number | null = null;
  private orbitShownDistance: number | null = null;
  private collisionLastMs = 0;
  // Who the last frame held, for the straggler hysteresis.
  private readonly directorInFrame = new Set<string>();
  // The look-ahead (chronicle-1579): the recorded replay, the framing track
  // built from it off the frame loop, and what that track was built for.
  private followSource: MapSceneFollowSource | null = null;
  // The last finished build and what it was for; its track is null when
  // nobody (or the followed unit) was ever there to frame, which is cached
  // too, so an empty floor is not rebuilt every frame.
  private followTrack: FollowTrack | null = null;
  private followTrackFor: FollowTrackInputs | null = null;
  // The build in flight, a slice per timer tick so a long run never blocks a frame.
  private followBuild: { build: FollowTrackBuild; inputs: FollowTrackInputs; timer: ReturnType<typeof setTimeout> } | null = null;
  // How far past the pan radius the Director left the camera: the user's
  // pan limit grows by this on handover (and only shrinks), so grabbing the
  // camera never snaps it back toward the focus in one step.
  private panSlack = 0;
  // Whether the replay was playing at the Director's last frame: a pause or
  // resume re-anchors the jump check rather than reading as a jump.
  private directorReplayPlaying = false;
  // The track where the group is, and the position and distance springs' goals (sampled ahead by their trails).
  private readonly followKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  private readonly followLedKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  private readonly followSizedKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  private readonly followYawKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  // The replay time the Director last framed, and when, to spot a jump.
  private directorReplayMs: number | null = null;
  private directorReplayAt = 0;
  // Until when a replay jump cuts instead of gliding (a jump the user asked for).
  private directorCutUntil = 0;
  // Line-of-sight hysteresis, so the shot cannot flip frame to frame.
  private readonly shotHold = createShotHold();
  // The last line-of-sight answer, and when it may be asked again (FOLLOW_SHOT_CHECK_MS).
  private shotRaw: ShotAnswer | null = null;
  private shotCheckAt = 0;
  // A wall pulled the steep camera in close: the next answer that is not steep replaces the held one.
  private shotRelease = false;
  // The last answer that was not steep: a release falls back to it when the answer is steep.
  private shotShallow: ShotAnswer | null = null;
  // The camera's actual target for the steep check (clearShot), and scratch vectors for it.
  private readonly shotPose = { x: 0, z: 0, floor: 0 };
  private readonly directorPoseAim = new THREE.Vector3();
  private readonly directorPoseEye = new THREE.Vector3();
  // The framed units the line-of-sight answer keeps in sight (sightPicks), at player height.
  private readonly sightFramed: string[] = [];
  private readonly sightPicked: number[] = [];
  private readonly sightTargets: THREE.Vector3[] = [];
  private readonly sightBoss: boolean[] = [];
  private sightCount = 0;
  // The glide across a replay jump, from the pose the camera had.
  // The yaw turns on its own clock, `turn` ms, when a big turn needs longer than the move.
  private directorGlide: { start: number; duration: number; turn: number } | null = null;
  private readonly glideFrom: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
  private readonly glideTo: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
  private readonly glidePose: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
  // The yaw the Director shoots from while it follows a track (chronicle-1724),
  // unwrapped; without a track it keeps the camera's yaw.
  private readonly directorYaw: DampedValue = { value: 0, velocity: 0 };
  // The Director's collision: the distance it wants (the collision ray's
  // length), what the last ray allowed, and the eased reach between them.
  private directorWant: number | null = null;
  private directorAllowed: number | null = null;
  private readonly directorReach: DampedValue = { value: 0, velocity: 0 };
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
  private keyMoveLastMs = 0;
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
        followSource: () => this.followSource,
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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = TILES_MAX_POLAR_RADIANS;
    this.controls.minDistance = FREE_CAM_MIN_DISTANCE_SCENE_UNITS;
    this.controls.maxDistance = TILES_MAX_DISTANCE_SCENE_UNITS;
    // The free cam's left/right drags, keys and wheel are our own, walk
    // mode's (chronicle-1514); OrbitControls keeps touch and the middle-drag
    // pan. No inertia, except on the mobile layout (setMobileInput).
    this.controls.enableDamping = false;
    this.controls.dampingFactor = MOBILE_ORBIT_DAMPING;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
    this.controls.rotateSpeed = ORBIT_ROTATE_SPEED;
    this.controls.zoomSpeed = ORBIT_ZOOM_SPEED;
    this.controls.panSpeed = ORBIT_PAN_SPEED;
    this.controls.addEventListener("change", this.handleControlsChange);
    this.controls.addEventListener("start", this.handleControlsStart);
    this.controls.addEventListener("end", this.handleControlsEnd);
    if (this.capture) {
      this.controls.enabled = false;
      this.controls.enableDamping = false;
    }

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
    this.directorRunning = false;
    this.directorSubject = null;
    if (this.dungeonMesh) {
      // The parsed mesh is shared with other scenes (see parsedDungeonMesh): just let go of this copy.
      this.scene.remove(this.dungeonMesh.group);
      this.world.dungeonMesh = null;
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
      this.viewAnimation = null;
      this.placeCamera(this.viewport, (this.alignmentOverlay ? TOP_DOWN_OFFSET : MESH_ANGLED_OFFSET).clone().normalize());
      // Start on the first valid cinematic shot immediately. The mesh already
      // had an asynchronous load; making the camera spend another few seconds
      // springing in from the overview makes the replay feel unnecessarily slow.
      this.directorRunning = false;
      if (this.director && !this.alignmentOverlay) this.engageDirector(true);
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
    if (!director || this.alignmentOverlay) {
      this.directorRunning = false;
      this.directorSnapPending = false;
      return;
    }
    this.engageDirector();
    this.requestRender();
  }

  /** Cuts the Director straight to its next shot (the replay jumped), instead of springing there from the old one. */
  cutDirector() {
    if (!this.director) return;
    // A replay jump that lands a frame or two later still cuts, not glides.
    this.directorCutUntil = this.now() + DIRECTOR_CUT_WINDOW_MS;
    this.directorGoal.seeded = false;
    this.directorInFrame.clear();
    this.engageDirector(true);
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
    this.directorYaw.value = this.cameraYaw();
    this.directorYaw.velocity = 0;
    this.directorReach.value = this.directorDistance.value;
    this.directorReach.velocity = 0;
    this.directorWant = null;
    this.directorAllowed = null;
    this.directorReplayMs = null;
    this.directorGlide = null;
    Object.assign(this.shotHold, createShotHold());
    this.shotRaw = null;
    this.shotRelease = false;
    this.shotShallow = null;
  }

  /**
   * The recorded replay the Director looks ahead in (null: it frames each
   * frame as it comes). The framing track is built from it off the frame loop.
   */
  setFollowSource(source: MapSceneFollowSource | null) {
    if (source === this.followSource) return;
    this.followSource = source;
    this.unitLayer.ensureFloorTracks();
    this.requestRender();
  }

  // The framing track for the current source and followed unit, or null
  // while none fits (or the last build found nobody to frame: the per-frame
  // path then frames). A missing track is built in slices off the frame loop;
  // one for another speed, or one the data has grown past, still serves until
  // its replacement is ready. Growth only rebuilds once the replay nears the
  // old track's end, so a streaming result does not rebuild on every chunk.
  private currentFollowTrack(replayMs: number): FollowTrack | null {
    const mesh = this.dungeonMesh;
    const source = this.followSource;
    if (!mesh || !source) return null;
    const subject = this.directorSubject;
    const speed = Math.max(1, this.effectsLayer.clock.speed);
    const built = this.followTrackFor;
    const fits = this.followInputsMatch(built, source.key, subject, mesh.scale);
    const stale = !fits
      || built!.speed !== speed
      // Not the (capped) centre window: the margin stays 3 s of real time at any speed, longer than a sliced rebuild takes.
      || (source.endMs > built!.endMs && replayMs > built!.endMs - FOLLOW_CENTRE_WINDOW_MS * speed)
      // Built before the no-Z floor tracks landed (a slower build): the yaw
      // probe reads units' heights from them. Later changes to them (growth)
      // are picked up by the next rebuild.
      || (built!.floors === null && this.unitLayer.floorTracks !== null);
    const pending = this.followBuild?.inputs ?? null;
    if (stale && !(this.followInputsMatch(pending, source.key, subject, mesh.scale) && pending!.speed === speed && (pending!.floors !== null || this.unitLayer.floorTracks === null))) {
      this.startFollowBuild(source, { key: source.key, subject, aspect: this.aspect, scale: mesh.scale, speed, endMs: source.endMs, floors: this.unitLayer.floorTracks });
    }
    return fits ? this.followTrack : null;
  }

  // Whether `inputs` is a build of the same data, followed unit and placement.
  private followInputsMatch(inputs: FollowTrackInputs | null, key: string, subject: string | null, scale: number): boolean {
    return inputs !== null && inputs.key === key && inputs.subject === subject && inputs.aspect === this.aspect && inputs.scale === scale;
  }

  // Starts (or restarts) the sliced follow-track build for `inputs`.
  private startFollowBuild(source: MapSceneFollowSource, inputs: FollowTrackInputs) {
    if (this.followBuild) clearTimeout(this.followBuild.timer);
    const { aspect } = inputs;
    const build = startFollowTrackBuild({
      startMs: source.startMs,
      endMs: inputs.endMs,
      scale: inputs.scale,
      subjectGuid: inputs.subject,
      speed: inputs.speed,
      initialYaw: this.cameraYaw(),
      probe: this.followYawProbe(inputs.scale),
      unitsAt: (ms) => source.unitsAt(ms).map((unit): DirectorUnit => {
        const { x, z } = mapPointToScene(unit.point, aspect, GROUND_WIDTH);
        // The sample's own height: logged, or the unit's floor track then (no-Z logs).
        const track = unit.z === undefined ? inputs.floors?.units.get(unit.guid) : undefined;
        const floor = track ? floorTrackAt(track, ms, x, z, FLOOR_TRACK_TOLERANCE_YARDS * inputs.scale) : null;
        const height = unit.z ?? (floor === null ? undefined : floor / inputs.scale);
        return { guid: unit.guid, x, z, player: unit.player, boss: unit.boss, dead: unit.dead, height };
      }),
    }, this.now);
    const slice = () => {
      const current = this.followBuild;
      if (this.disposed || !current || current.build !== build) return;
      if (!build.step(FOLLOW_SLICE_MS)) {
        current.timer = setTimeout(slice, 0);
        return;
      }
      this.followBuild = null;
      this.followTrack = build.result;
      this.followTrackFor = inputs;
      this.requestRender();
    };
    this.followBuild = { build, inputs, timer: setTimeout(slice, 0) };
  }

  /** Whether the Director is the one moving the camera right now. */
  private directing(): boolean {
    return this.director !== null && this.dungeonMesh !== null && !this.directorPaused && this.cameraMove === null && this.walk === null;
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
        clearShot: (x, z, distance, yaw) => this.droneClearShot(x, z, distance, yaw),
      },
    };
  }

  /** Applies an authored orbit-camera pose and takes control from automated camera modes. */
  applyCameraPose(pose: MapCameraPose, options: { pauseDirector?: boolean; constrain?: boolean } = {}) {
    if (this.walk) this.stopWalk();
    if (options.pauseDirector !== false) {
      this.directorPaused = true;
      this.directorRunning = false;
    }
    this.cameraMove = null;
    this.viewAnimation = null;
    this.camera.position.fromArray(pose.position);
    this.controls.target.fromArray(pose.target);
    this.pivotLift = Math.max(0, pose.target[1] - this.pivotFloor(pose.target[0], pose.target[2]));
    if (pose.fov !== undefined) this.camera.fov = pose.fov;
    if (pose.near !== undefined) this.camera.near = pose.near;
    if (pose.far !== undefined) this.camera.far = pose.far;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    if (options.constrain !== false) this.constrainCamera();
    this.updateUnitScale();
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
      this.viewAnimation = { from, direction, start: this.now(), duration: durationMs };
      this.requestRender();
      return;
    }
    this.viewAnimation = null;
    this.placeCamera(viewport, direction);
  }

  /** Re-frames the current viewport straight down (`topDown`) or angled. */
  resetCamera(topDown: boolean) {
    if (this.walk) this.stopWalk();
    this.viewAnimation = null;
    // Asking for top-down takes the camera from the Director, as a drag does;
    // Follow (a new viewport request) hands it back.
    if (topDown) {
      this.directorPaused = true;
      this.directorRunning = false;
      this.cameraMove = null;
    }
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
    const framed = this.directing() && this.directorInFrame.size > 0 ? this.directorInFrame : null;
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
      this.orbitWantDistance = this.orbitShownDistance = null;
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
    // Only the floor below the camera lifts it: the highest surface over its
    // spot may be a wall top, a ledge or a roof, and lifting the camera onto
    // that tips the view straight down. Walls between the camera and the
    // target are the collision pass's job.
    const below = this.world.castFloor(position.x, position.z, position.y + MESH_CAMERA_CLEARANCE);
    if (below !== null && position.y < below + MESH_CAMERA_CLEARANCE) {
      position.y = below + MESH_CAMERA_CLEARANCE;
      moved = true;
    }
    const before = this.collisionBefore.copy(position);
    const easing = this.collideOrbitCamera(dt, arrived);
    if (!position.equals(before)) moved = true;
    if (moved) {
      this.constraining = true;
      this.controls.update();
      this.constraining = false;
    }
    this.orbitShownDistance = position.distanceTo(target);
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

  // Keeps the cave from standing between the orbit target and the camera: a
  // wall pulls the camera in along its line of sight, and once clear it eases
  // back out to the distance the user (or the Director) chose. `arrived` is
  // the distance before this constrain pass: when it differs from the one the
  // last pass left, something else moved the camera (a zoom, a new shot) and
  // that becomes the new choice. True while it is still easing out.
  private collideOrbitCamera(dt: number, arrived: number): boolean {
    const { target } = this.controls;
    const { position } = this.camera;
    const shown = position.distanceTo(target);
    const mesh = this.dungeonMesh;
    if (!mesh || shown <= 1e-6) return false;
    // From the fight's height, as clearShot does: the target sits on the
    // floor, which a ray from it would graze at once.
    const from = this.collisionFrom.copy(target);
    from.y += MESH_PLAYER_HEIGHT_YARDS * mesh.scale;
    const direction = this.collisionDirection.copy(position).sub(target).divideScalar(shown);
    // The Director eases its own camera in from a wall (updateDirector reads
    // what this ray allows), so a cave wall is not a one-frame pull-in.
    if (this.directing() && this.directorWant !== null) {
      const want = this.directorWant;
      const hit = want > 0 ? this.world.meshHitDistance(from, this.collisionEye.copy(direction).multiplyScalar(want).add(from)) : null;
      this.directorAllowed = directorPullIn(want, hit, FREE_CAM_COLLISION_PADDING_SCENE_UNITS, this.controls.minDistance);
      this.orbitWantDistance = shown;
      return false;
    }
    const last = this.orbitShownDistance;
    if (last === null || this.orbitWantDistance === null || Math.abs(arrived - last) > 1e-4 * Math.max(1, arrived)) this.orbitWantDistance = arrived;
    const want = this.orbitWantDistance;
    const { distance: next, easing } = this.collideCamera(from, direction, shown, want, FREE_CAM_COLLISION_PADDING_SCENE_UNITS, Math.min(want, this.controls.minDistance), dt);
    if (next !== shown) position.sub(target).multiplyScalar(next / shown).add(target);
    return easing;
  }

  // Camera collision for both modes (chronicle-1513): how far out from
  // `from` along `direction` (a unit vector) the camera may sit this frame,
  // having been `shown` away and wanting to be `want` away (scene units).
  // `easing` is true while it is still easing back out from a wall that is gone.
  private collideCamera(from: THREE.Vector3, direction: THREE.Vector3, shown: number, want: number, padding: number, min: number, dt: number): { distance: number; easing: boolean } {
    const hit = want > 0 ? this.world.meshHitDistance(from, this.collisionEye.copy(direction).multiplyScalar(want).add(from)) : null;
    const distance = cameraCollisionDistance(shown, want, hit, padding, min, COLLISION_RETURN_RATE_PER_S, dt);
    return { distance, easing: distance < want && (hit === null || hit - padding > distance) };
  }

  // The line-of-sight answer at `yaw` (the track has already turned it to a
  // clear side where it could): the lowest cinematic elevation whose camera
  // is clear of the cave toward the aim point and sees the framed units,
  // climbing in steps; the shot shortens only if no climb does (fallbackShot).
  // `floor` is the floor below (x, z).
  // With a `pose` (where the camera's spring actually holds its target, and
  // the floor there), a steep shot must also stay clear of a wall closer than
  // FOLLOW_STEEP_MIN_DISTANCE_YARDS from there: its line from the goal can be
  // clear while the camera's own is not (the led spring, floor differences),
  // and a wall that pulls a steep camera in shows only the floor.
  private clearShot(x: number, floor: number, z: number, distance: number, yaw: number, pose: { x: number; z: number; floor: number } | null = null): ShotAnswer {
    const lift = MESH_PLAYER_HEIGHT_YARDS * (this.dungeonMesh?.scale ?? 1);
    const steepMin = FOLLOW_STEEP_MIN_DISTANCE_YARDS * (this.dungeonMesh?.scale ?? 1);
    return fallbackShot(DIRECTOR_CLIMB, (elevationDeg, shortened) => {
      // From the fight's own height, not the floor the ray would graze.
      const aim = this.directorAim.set(x, floor + lift, z);
      const out = shortened ? this.shortenedShot(distance) : distance;
      const elevation = (elevationDeg * Math.PI) / 180;
      const eye = this.directorEye.set(
        x + Math.sin(yaw) * Math.cos(elevation) * out,
        floor + Math.sin(elevation) * out,
        z + Math.cos(yaw) * Math.cos(elevation) * out,
      );
      // A wall on the aim line would pull the camera in: not this shot.
      if (this.world.meshBlocks(aim, eye)) return false;
      if (pose && elevationDeg > FOLLOW_STEEP_ELEVATION_DEG) {
        const from = this.directorPoseAim.set(pose.x, pose.floor + lift, pose.z);
        const to = this.directorPoseEye.set(
          pose.x + Math.sin(yaw) * Math.cos(elevation) * out,
          pose.floor + Math.sin(elevation) * out,
          pose.z + Math.cos(yaw) * Math.cos(elevation) * out,
        );
        const hit = this.world.meshHitDistance(from, to);
        if (hit !== null && hit - FREE_CAM_COLLISION_PADDING_SCENE_UNITS < steepMin) return false;
      }
      return seesFraming(this.sightCount, (k) => this.sightBoss[k]!, (k) => !this.world.meshBlocks(eye, this.sightTargets[k]!)) || "aim";
    });
  }

  // The video drone's line of sight (unchanged by chronicle-1725): the lowest
  // cinematic elevation with a clear line to the aim point, climbing in steps;
  // the shot shortens only if even the highest one is blocked.
  private droneClearShot(x: number, z: number, distance: number, yaw: number): { elevation: number; distance: number } {
    const floor = this.world.floorHeights.heightAt("director-shot", x, z, this.cameraCeiling());
    const aim = this.directorAim.set(x, floor + MESH_PLAYER_HEIGHT_YARDS * (this.dungeonMesh?.scale ?? 1), z);
    for (const elevationDeg of DIRECTOR_CLIMB) {
      const elevation = (elevationDeg * Math.PI) / 180;
      const eye = this.directorEye.set(
        x + Math.sin(yaw) * Math.cos(elevation) * distance,
        floor + Math.sin(elevation) * distance,
        z + Math.cos(yaw) * Math.cos(elevation) * distance,
      );
      if (!this.world.meshBlocks(aim, eye)) return { elevation: elevationDeg, distance };
    }
    // Still blocked overhead: come in closer instead.
    return { elevation: MAX_CINEMATIC_ELEVATION_DEG, distance: this.shortenedShot(distance) };
  }

  // Re-reads the framed units the line of sight checks: the boss and up to
  // FOLLOW_SIGHT_MAX_PLAYERS players, at player height above where they stand.
  private readSightTargets(bossGuids: ReadonlySet<string>, scale: number) {
    const framed = this.sightFramed;
    framed.length = 0;
    for (const guid of this.directorInFrame) if (this.units.has(guid)) framed.push(guid);
    const picked = sightPicks(framed.length, (k) => bossGuids.has(framed[k]!), this.sightPicked);
    for (let j = 0; j < picked.length; j++) {
      const guid = framed[picked[j]!]!;
      const { base } = this.units.get(guid)!;
      (this.sightTargets[j] ??= new THREE.Vector3()).set(base.x, base.y + MESH_PLAYER_HEIGHT_YARDS * scale, base.z);
      this.sightBoss[j] = bossGuids.has(guid);
    }
    this.sightCount = picked.length;
  }

  // The follow track's yaw probe: per sample, the floor below the framing
  // (found once, below that sample's units) and the base shot's distance;
  // per yaw, the line from the framing to where updateDirector puts the
  // camera at the base elevation (the aim point sits AIM_AHEAD_FRACTION of
  // the radius past the framing, away from it).
  private followYawProbe(scale: number): FollowYawProbe {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const elevation = (CINEMATIC_ELEVATION_DEG * Math.PI) / 180;
    const lift = MESH_PLAYER_HEIGHT_YARDS * scale;
    const targets: THREE.Vector3[] = [];
    const boss: boolean[] = [];
    let count = 0;
    let out = 0;
    let up = 0;
    return {
      sample: (x, z, radius, height, framed) => {
        if (!this.dungeonMesh) return false;
        // No floor below (a chasm, off the mesh): skip the sample rather than cast from y = 0.
        const floor = this.world.sampleFloor(x, z, this.unitLayer.probeCeiling(height, scale));
        if (floor === null) return false;
        from.set(x, floor + lift, z);
        // The framed units at player height: over their own logged or tracked
        // height, else over the framing's floor (no extra floor rays).
        count = framed.length / FOLLOW_SIGHT_STRIDE;
        for (let k = 0; k < count; k++) {
          const at = k * FOLLOW_SIGHT_STRIDE;
          const own = framed[at + 2]!;
          (targets[k] ??= new THREE.Vector3()).set(framed[at]!, (Number.isNaN(own) ? floor : own * scale) + lift, framed[at + 1]!);
          boss[k] = framed[at + 3] === 1;
        }
        const distance = frameDistance(radius, {
          verticalFov: (this.camera.fov * Math.PI) / 180,
          aspect: this.camera.aspect,
          elevationDeg: CINEMATIC_ELEVATION_DEG,
          scale,
        });
        out = Math.cos(elevation) * distance - AIM_AHEAD_FRACTION * Math.max(radius, MIN_FRAME_RADIUS_YARDS * scale);
        up = floor + Math.sin(elevation) * distance;
        return true;
      },
      clearYaw: (yaw) => {
        if (!this.dungeonMesh) return true;
        to.set(from.x + Math.sin(yaw) * out, up, from.z + Math.cos(yaw) * out);
        if (this.world.meshBlocks(from, to)) return false;
        return seesFraming(count, (k) => boss[k]!, (k) => !this.world.meshBlocks(to, targets[k]!)) || "aim";
      },
    };
  }

  // How close a shot blocked even from overhead comes in.
  private shortenedShot(distance: number): number {
    return Math.max(MIN_DOUBLE_CLICK_DISTANCE_YARDS * (this.dungeonMesh?.scale ?? 1), distance * CLEAR_SHOT_SHORTEN);
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
   * One Director step: works out the shot that holds the boss and the group
   * and springs the camera toward it. With a follow source the shot comes
   * from the look-ahead track at the replay time (continuous, so the springs
   * only smooth what is left); without one, from this frame's framing, moved
   * only when it leaves the dead zones. A replay jump glides (or cuts, when
   * the user asked for it). Returns whether the camera needs another frame.
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
    const dt = this.directorAt === 0 ? 1 / 60 : Math.min(FRAME_STEP_MAX_S, (now - this.directorAt) / 1000);
    this.directorAt = now;
    this.directorInFrame.clear();
    if (frame) for (const guid of frame.guids) this.directorInFrame.add(guid);
    const replayMs = this.effectsLayer.replayNow(now);
    const track = this.currentFollowTrack(replayMs);
    if (!frame && !track) return false;

    // A replay jump: the clock moved by more than playback explains. A pause
    // or resume since the last frame re-anchors instead (the paused time is
    // not playback it missed).
    const previousMs = this.effectsLayer.clock.playing === this.directorReplayPlaying ? this.directorReplayMs : null;
    const expectedMs = this.effectsLayer.clock.playing ? (now - this.directorReplayAt) * this.effectsLayer.clock.speed : 0;
    const jumped = previousMs !== null && isReplayJump(previousMs, replayMs, expectedMs, this.effectsLayer.clock.speed, this.effectsLayer.clock.playing);
    this.directorReplayMs = replayMs;
    this.directorReplayAt = now;
    this.directorReplayPlaying = this.effectsLayer.clock.playing;

    // Where the group is, and the springs' goals: sampled ahead by each
    // spring's trail, which the spring then takes back.
    const springs = track ? followSprings(this.effectsLayer.clock.speed, this.effectsLayer.clock.playing) : null;
    const key = track ? followKeyAt(track, replayMs, this.followKey) : null;
    const led = track ? followKeyAt(track, replayMs + springs!.leadMs, this.followLedKey) : null;
    const sized = track ? followKeyAt(track, replayMs + springs!.distanceLeadMs, this.followSizedKey) : null;
    const centreX = key ? key.x : frame!.x;
    const centreZ = key ? key.z : frame!.z;
    const frameRadius = sized ? sized.radius : frame!.radius;
    const radius = Math.max(frameRadius, MIN_FRAME_RADIUS_YARDS * mesh.scale);
    // The yaw: the track's where it has one (where the group is, and led for
    // the spring, as the position); otherwise whatever the user last orbited to.
    const yawLed = track ? followKeyAt(track, replayMs + springs!.yawLeadMs, this.followYawKey).yaw : null;
    const yaw = key ? key.yaw : this.cameraYaw();
    // The yaw the camera actually sits at: the spring's (rate-capped, so up to
    // half a turn off the track's for a few seconds after Follow or a new
    // track), or the track's on a cut. The aim offset and the line of sight
    // use it; glide and cut targets use the track's.
    const cutting = this.directorSnapPending || (jumped && now < this.directorCutUntil);
    const placedYaw = key && !cutting ? this.directorYaw.value : yaw;
    // The aim point sits past the fight, away from the camera, so the fight
    // reads below the centre line with the room above it.
    const ahead = AIM_AHEAD_FRACTION * radius;
    const aimX = centreX - Math.sin(placedYaw) * ahead;
    const aimZ = centreZ - Math.cos(placedYaw) * ahead;
    const fitted = frameDistance(frameRadius, {
      verticalFov: (this.camera.fov * Math.PI) / 180,
      aspect: this.camera.aspect,
      elevationDeg: this.directorElevation.value,
      scale: mesh.scale,
    });
    const goal = this.directorGoal;
    if (!goal.seeded || key) {
      // The track is already smooth: the goal follows it exactly.
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
    // The position spring chases the led aim point; the line of sight, a
    // glide and a cut use the goal (where the group is).
    const springX = led ? led.x - Math.sin(placedYaw) * ahead : goal.x;
    const springZ = led ? led.z - Math.cos(placedYaw) * ahead : goal.z;
    // While the held shot is steep, a wall that pulled the camera in close
    // (last frame's collision) releases it for the next answer that is not;
    // steep answers then cannot win straight back (releaseSteepShot).
    if (this.shotHold.elevationDeg <= FOLLOW_STEEP_ELEVATION_DEG) this.shotRelease = false;
    else if (steepPullIn(this.directorElevation.value, this.directorAllowed, FOLLOW_STEEP_MIN_DISTANCE_YARDS * mesh.scale)) this.shotRelease = true;
    // Asked again every FOLLOW_SHOT_CHECK_MS, and at once on a cut or a jump.
    if (shotCheckDue(now, this.shotCheckAt, this.shotRaw !== null, cutting || jumped)) {
      this.readSightTargets(director.bossGuids, mesh.scale);
      // Gliding (from the jump's frame on), the shot lands at the track's yaw
      // where the group is: check there, not at the yaw the camera turns
      // through. Otherwise, where the camera is headed, steep shots also
      // checked from where its spring actually holds it.
      const gliding = key !== null && (jumped || this.directorGlide !== null);
      const checkYaw = gliding ? yaw : placedYaw;
      const checkX = gliding ? centreX - Math.sin(yaw) * ahead : goal.x;
      const checkZ = gliding ? centreZ - Math.cos(yaw) * ahead : goal.z;
      const floor = this.world.floorHeights.heightAt("director-shot", checkX, checkZ, this.cameraCeiling());
      let pose: { x: number; z: number; floor: number } | null = null;
      if (!gliding && !cutting) {
        pose = this.shotPose;
        pose.x = this.directorX.value;
        pose.z = this.directorZ.value;
        pose.floor = this.pivotFloor(pose.x, pose.z);
      }
      this.shotRaw = this.clearShot(checkX, floor, checkZ, goal.distance, checkYaw, pose);
      this.shotCheckAt = now + FOLLOW_SHOT_CHECK_MS;
      if (this.shotRaw.elevationDeg <= FOLLOW_STEEP_ELEVATION_DEG) this.shotShallow = this.shotRaw;
      if (this.shotRelease && releaseSteepShot(this.shotHold, this.shotRaw, now, this.shotShallow)) this.shotRelease = false;
    }
    const hold = holdShot(this.shotHold, this.shotRaw!.elevationDeg, this.shotRaw!.shortened, now);
    const shotElevation = hold.elevationDeg;
    const shotDistance = hold.shortened ? this.shortenedShot(goal.distance) : goal.distance;

    if (jumped) {
      if (now < this.directorCutUntil) {
        this.directorCutUntil = 0;
        this.directorSnapPending = true;
      } else if (!this.directorSnapPending) {
        const from = this.glideFrom;
        from.x = this.directorX.value;
        from.z = this.directorZ.value;
        from.distance = this.directorDistance.value;
        from.elevationDeg = this.directorElevation.value;
        from.vx = this.directorX.velocity;
        from.vz = this.directorZ.velocity;
        from.yaw = this.directorYaw.value;
        from.vyaw = this.directorYaw.velocity;
        // The turn's direction is fixed here (the short way now), and a track
        // lost mid-glide keeps this target rather than swinging back.
        this.glideTo.yaw = key ? unwrapNear(yaw, from.yaw) : from.yaw;
        const duration = glideDurationMs(Math.hypot(goal.x - from.x, goal.z - from.z), mesh.scale);
        // Started a frame back, so this frame already moves (no one-frame stall).
        this.directorGlide = { start: now - dt * 1000, duration, turn: glideTurnMs(this.glideTo.yaw - from.yaw, duration) };
      }
    }

    if (this.directorSnapPending) {
      this.directorSnapPending = false;
      this.directorGlide = null;
      // On the group, already moving with it, so the led spring has nothing to take back.
      const x = springs ? handOverFollowSpring(this.directorX, goal.x, springX, springs).value : snapDampedValue(this.directorX, goal.x);
      const z = springs ? handOverFollowSpring(this.directorZ, goal.z, springZ, springs).value : snapDampedValue(this.directorZ, goal.z);
      const distance = snapDampedValue(this.directorDistance, shotDistance);
      const elevation = snapDampedValue(this.directorElevation, shotElevation);
      const shotYaw = springs ? handOverFollowYaw(this.directorYaw, yaw, yawLed!, springs).value : snapDampedValue(this.directorYaw, yaw);
      this.placeDirectorCamera(x, z, this.directorReachFor(distance, dt, true), elevation, shotYaw);
      return false;
    }

    const glide = this.directorGlide;
    if (glide) {
      const to = this.glideTo;
      // Landing where the group is, at the track's yaw (not the yaw the camera is still turning from).
      to.x = key ? centreX - Math.sin(yaw) * ahead : goal.x;
      to.z = key ? centreZ - Math.cos(yaw) * ahead : goal.z;
      to.distance = shotDistance;
      to.elevationDeg = shotElevation;
      // The target follows the track near where it was (never flipping the
      // turn); without a track it keeps the yaw it was heading for.
      if (key) to.yaw = unwrapNear(yaw, to.yaw!);
      const t = Math.min(1, (now - glide.start) / glide.duration);
      const turnT = Math.min(1, (now - glide.start) / glide.turn);
      const lastX = this.directorX.value;
      const lastZ = this.directorZ.value;
      const lastYaw = this.directorYaw.value;
      const pose = glidePoseAt(this.glideFrom, to, t, this.glidePose, glide.duration, turnT, glide.turn);
      // The springs ride along (velocity too), so the springs, or another
      // jump's glide, carry on from here without a corner.
      snapDampedValue(this.directorX, pose.x);
      snapDampedValue(this.directorZ, pose.z);
      this.directorX.velocity = (pose.x - lastX) / dt;
      this.directorZ.velocity = (pose.z - lastZ) / dt;
      snapDampedValue(this.directorDistance, pose.distance);
      snapDampedValue(this.directorElevation, pose.elevationDeg);
      snapDampedValue(this.directorYaw, pose.yaw!);
      this.directorYaw.velocity = (pose.yaw! - lastYaw) / dt;
      if (t >= 1 && turnT >= 1) this.directorGlide = null;
      this.placeDirectorCamera(pose.x, pose.z, this.directorReachFor(pose.distance, dt, false), pose.elevationDeg, pose.yaw!);
      return true;
    }

    const smooth = springs ? springs.position : TARGET_SMOOTH_SECONDS;
    const x = smoothDamp(this.directorX, springX, smooth, dt);
    const z = smoothDamp(this.directorZ, springZ, smooth, dt);
    const distance = smoothDamp(this.directorDistance, shotDistance, springs ? springs.distance : DISTANCE_SMOOTH_SECONDS, dt);
    const elevation = smoothDamp(this.directorElevation, shotElevation, TARGET_SMOOTH_SECONDS, dt);
    const shotYaw = springs ? followYawStep(this.directorYaw, yawLed!, springs.yaw, dt) : snapDampedValue(this.directorYaw, yaw);
    const reach = this.directorReachFor(distance, dt, false);
    this.placeDirectorCamera(x, z, reach, elevation, shotYaw);
    const settled = Math.hypot(x - goal.x, z - goal.z) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(distance - shotDistance) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(reach - Math.min(distance, this.directorAllowed ?? distance)) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(elevation - shotElevation) <= DIRECTOR_SETTLED
      && Math.abs(wrapAngle(shotYaw - yaw)) <= DIRECTOR_SETTLED_YAW;
    // Playing, the track keeps moving; paused, the line-of-sight hold may still release.
    return !settled || (key !== null && this.effectsLayer.clock.playing) || this.shotHold.lowerSinceMs !== null;
  }

  // The distance the Director's camera sits at: `distance`, or nearer while
  // the last collision ray found a wall, easing in over
  // DIRECTOR_COLLISION_IN_SECONDS rather than in one frame.
  private directorReachFor(distance: number, dt: number, snap: boolean): number {
    const previous = this.directorWant;
    // Not held in by a wall last frame: the reach is just the distance.
    const free = previous === null || this.directorReach.value >= previous - 1e-4 * Math.max(1, previous);
    this.directorWant = distance;
    const allowed = Math.min(distance, this.directorAllowed ?? distance);
    if (snap || (free && allowed >= distance)) return snapDampedValue(this.directorReach, allowed);
    const smooth = allowed < this.directorReach.value ? DIRECTOR_COLLISION_IN_SECONDS : DISTANCE_SMOOTH_SECONDS;
    return Math.min(distance, smoothDamp(this.directorReach, allowed, smooth, dt));
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
    this.directorPaused = true;
    this.directorRunning = false;
    this.viewAnimation = null;
    this.cameraMove = {
      from: target.clone(),
      to: hit.point.clone(),
      fromDistance: current,
      toDistance: Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, wanted)),
      direction: this.camera.position.clone().sub(target).normalize(),
      start: this.now(),
    };
    this.requestRender();
  };

  dispose() {
    this.disposed = true;
    if (this.followBuild) clearTimeout(this.followBuild.timer);
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
        this.lookFreeCam(drag.dx, drag.dy);
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
      const look = lookDrag(this.walk.camYaw, this.walk.camPitch, drag.dx, drag.dy, -WALK_PITCH_LIMIT_RADIANS, WALK_PITCH_LIMIT_RADIANS);
      this.walk.camYaw = look.yaw;
      this.walk.camPitch = look.pitch;
      if (walkMouseControl(drag.buttons).steering) this.walk.yaw = this.walk.camYaw;
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

  // The free cam's yaw and pitch around its pivot, as walk mode's
  // camYaw/camPitch around the head; the distance stays.
  private freeCamAngles(): { yaw: number; pitch: number; distance: number } {
    return cameraAngles(this.directorVector.copy(this.camera.position).sub(this.controls.target));
  }

  // Places the free cam at yaw/pitch/distance from its pivot, walk mode's way,
  // within the mode's tilt limit.
  private placeFreeCam(yaw: number, pitch: number, distance: number) {
    const clamped = Math.max(this.freeCamMinPitch(), Math.min(FREE_CAM_MAX_PITCH_RADIANS, pitch));
    const offset = cameraOffset(yaw, clamped, distance);
    this.camera.position.copy(this.controls.target).add(this.directorVector.set(offset.x, offset.y, offset.z));
    this.controls.update();
  }

  // The lowest the free cam may look from: OrbitControls' polar limit (on the
  // flat artwork the camera stays above the horizon so token faces show).
  private freeCamMinPitch(): number {
    return Math.PI / 2 - this.controls.maxPolarAngle;
  }

  // A mouse-look drag of (dx, dy) pixels on the free cam.
  private lookFreeCam(dx: number, dy: number) {
    if (!dx && !dy) return;
    const { yaw, pitch, distance } = this.freeCamAngles();
    const look = lookDrag(yaw, pitch, dx, dy, this.freeCamMinPitch(), FREE_CAM_MAX_PITCH_RADIANS);
    this.placeFreeCam(look.yaw, look.pitch, distance);
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
      this.keyMoveLastMs = 0;
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
      this.keyMoveLastMs = 0;
    }
    this.input.mobile = next;
    if (!this.walk && wasActive && !active) this.handleControlsEnd();
    if (active) this.requestRender();
  }

  // Moves the free cam for held keys, both mouse buttons or the mobile
  // controls, walk mode's way with a hidden character: W/S travel along the
  // camera's facing, A/D turn (strafe while right-dragging), Space/Z fly the
  // pivot up and down, with no gravity. True while any of them is active.
  private updateKeyboardCamera(now: number, input: InputFrame): boolean {
    if (this.walk || !input.active) {
      this.keyMoveLastMs = 0;
      return false;
    }
    const dt = frameStepSeconds(now, this.keyMoveLastMs);
    this.keyMoveLastMs = now;
    if (dt <= 0) return true;
    const target = this.controls.target;
    const angles = this.freeCamAngles();
    const distance = angles.distance;
    let { yaw, pitch } = angles;

    if (input.turn) yaw = turnYaw(yaw, input.turn, dt);
    // Stick up raises the camera, as walk mode's camPitch does.
    if (input.pitch) pitch = stickPitch(pitch, input.pitch, dt);

    // Travel scales with the zoom the user chose (not a wall's pull-in).
    const speed = freeCamTravelSpeed(this.orbitWantDistance ?? distance, FREE_CAM_TRAVEL_DISTANCES_PER_S, input.fast);
    const step = planarStep(yaw, input.forward, input.strafe, speed * dt);
    target.x += step.x;
    target.z += step.z;
    if (input.vertical) this.pivotLift = Math.max(0, this.pivotLift + input.vertical * speed * dt);
    // The pivot rides the floor below it, like walk mode's feet, plus the lift.
    target.y = this.pivotFloor(target.x, target.z) + this.pivotLift;

    this.placeFreeCam(yaw, pitch, distance);
    return true;
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
    this.viewAnimation = null;
    this.cameraMove = null;
    this.directorPaused = true;
    this.directorRunning = false;
    this.directorSubject = null;
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
    // Any planar movement brings a free-look camera back behind the character.
    // Turning (keys or the look stick) moves the target yaw first, so the camera
    // trails the turn, and keeps settling at the turn rate once the turn stops.
    walk.camSettling = walkCameraSettling(walk.camSettling, turn, input.dragging, walk.camYaw, walk.yaw);
    if (shouldFollowWalkCamera(forward, strafe, turn, input.dragging, walk.camSettling)) {
      const followRate = turn || walk.camSettling ? WALK_CAMERA_TURN_FOLLOW_RATE_PER_S : WALK_CAMERA_FOLLOW_RATE_PER_S;
      walk.camYaw = easeAngleToward(walk.camYaw, walk.yaw, followRate, dt);
    }
    if (input.pitch) {
      walk.camPitch = Math.max(-WALK_PITCH_LIMIT_RADIANS, Math.min(WALK_PITCH_LIMIT_RADIANS, stickPitch(walk.camPitch, input.pitch, dt)));
    }
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
    const head = this.walkHead.set(walk.position.x, walk.position.y + WALK_EYE_YARDS * scale, walk.position.z);
    // The camera sits as the free cam's does around its pivot (cameraOffset).
    const direction = cameraOffset(walk.camYaw, walk.camPitch, 1);
    // A wall between the head and the camera pulls the camera in front of it,
    // down to first person, so the character stays in view (chronicle-1513).
    const collision = this.collideCamera(
      head,
      this.collisionDirection.set(direction.x, direction.y, direction.z),
      walk.camShown * scale,
      walk.camDistance * scale,
      WALK_COLLISION_PADDING_YARDS * scale,
      0,
      dt,
    );
    walk.camShown = collision.distance / scale;
    const firstPerson = walk.camShown <= WALK_FIRST_PERSON_YARDS;
    walk.avatar.visible = !firstPerson;
    if (firstPerson) {
      this.camera.position.copy(head);
      this.camera.lookAt(head.x - direction.x, head.y - direction.y, head.z - direction.z);
    } else {
      const distance = walk.camShown * scale;
      this.camera.position.set(head.x + direction.x * distance, head.y + direction.y * distance, head.z + direction.z * distance);
      this.camera.lookAt(head);
    }
    this.controls.target.copy(head);
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
      const { yaw, pitch, distance } = this.freeCamAngles();
      const next = wheelZoomDistance(this.orbitWantDistance ?? distance, event.deltaY, this.controls.minDistance, this.controls.maxDistance);
      this.handleControlsStart();
      this.placeFreeCam(yaw, pitch, next);
      this.handleControlsEnd();
      this.requestRender();
      return;
    }
    const zoomingIn = event.deltaY < 0;
    if (walk.camDistance === 0 && !zoomingIn) {
      walk.camDistance = WALK_FIRST_PERSON_EXIT_YARDS;
    } else {
      const next = wheelZoomDistance(walk.camDistance, event.deltaY, 0, WALK_MAX_DISTANCE_YARDS);
      walk.camDistance = zoomingIn && next <= WALK_FIRST_PERSON_YARDS ? 0 : next;
    }
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
    });
  };

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
    const collisionDt = frameStepSeconds(now, this.collisionLastMs);
    this.collisionLastMs = now;
    // A camera pulled in by a wall eases back out once the wall is gone.
    const uncolliding = !walking && this.constrainCamera(collisionDt);
    if (!uncolliding && !damping) this.collisionLastMs = 0;
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
    return animating;
  }
}

