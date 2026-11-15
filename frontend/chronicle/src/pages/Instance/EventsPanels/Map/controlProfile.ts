/**
 * The control profile (chronicle-1982): every control tunable of the 3D
 * replay in one place, with its unit in its name. World of Warcraft's own
 * controls are the baseline, and walk mode is the reference implementation
 * (chronicle-1179); the free cam is walk mode with a hidden character
 * (chronicle-1514, chronicle-1530) and reads the same values, except for the
 * deliberate differences marked "differs" below. Walk mode, the free cam,
 * OrbitControls (touch and the middle-drag pan) and the mobile stick all read
 * this module; nothing else defines a control tunable.
 *
 * Yards are world yards (scaled by the mesh's scene units per yard); scene
 * units are the free cam's own; rates "per s" are exponential approach rates
 * unless said otherwise.
 */
import { ORBIT_NEAR } from "./sceneConstants";

// --- Both modes (the WoW baseline) ---

/** Mouse look: radians per pixel dragged, whatever the window size. */
export const LOOK_RADIANS_PER_PX = 0.006;
/** A/D (or the stick) turn this fast: the character in walk mode, the camera about its pivot in free cam. */
export const TURN_RADIANS_PER_S = Math.PI;
/** The mobile look stick's pitch rate at full deflection; up raises the camera. */
export const STICK_PITCH_RADIANS_PER_S = 1.6;
/** The wheel scales the camera distance by e^(deltaY × this). */
export const WHEEL_ZOOM_RATE = 0.0015;
/** A wall pulls the camera in at once; once clear it eases back out at this rate. */
export const COLLISION_RETURN_RATE_PER_S = 6;
/** No frame steps the controls (or any per-frame clock) further than this, so a dropped frame never jumps. */
export const FRAME_STEP_MAX_S = 0.1;
/** A press that moves further than this is a drag, not a click (and starts the free cam's look). */
export const UNIT_CLICK_SLOP_PX = 5;
/** A click inspects a unit after this long, unless a double-click follows. */
export const UNIT_CLICK_DELAY_MS = 250;
/** A double-click eases the camera to what was clicked over this long... */
export const DOUBLE_CLICK_MS = 450;
/** ...halving the distance, but never diving closer than this (mesh mode)... */
export const MIN_DOUBLE_CLICK_DISTANCE_YARDS = 10;
/** ...and Shift+double-click pulls back by this factor instead. */
export const DOUBLE_CLICK_OUT_FACTOR = 2;
/** A/D strafe (instead of turning) out of the box. */
export const DEFAULT_AD_STRAFE = false;
/** The mobile look stick ignores deflections up to this fraction of its radius. */
export const MOBILE_STICK_DEAD_ZONE = 0.14;

// --- Walk mode ("join the fight": the WoW baseline) ---

export const WALK_RUN_YPS = 14;
export const WALK_BACK_YPS = 9;
export const WALK_JUMP_YPS = 8;
/** Space held in the air keeps flying up at this speed; Z flies down at it. */
export const WALK_FLY_YPS = 14;
export const WALK_GRAVITY_YPS2 = 19.3;
/** The floor is looked for from this far above the feet, so steps and ramps are climbed and walls walked through. */
export const WALK_STEP_YARDS = 1.2;
export const WALK_EYE_YARDS = 1.7;
/** Camera follow strength during ordinary movement (~95% aligned after two seconds). */
export const WALK_CAMERA_FOLLOW_RATE_PER_S = 1.5;
/** Keyboard turns keep the camera much tighter behind the character (~95% in 0.4 s). */
export const WALK_CAMERA_TURN_FOLLOW_RATE_PER_S = 8;
/** Within this the camera has settled behind the character after a turn. */
export const WALK_CAMERA_SETTLED_RADIANS = 0.002;
/** How fast the body turns into and out of a strafe (~95% of the way in 0.25 s). */
export const WALK_BODY_TURN_RATE_PER_S = 12;
export const WALK_START_DISTANCE_YARDS = 10;
/** Zoom range, differs from the free cam's: from first person (0) out to this. */
export const WALK_MAX_DISTANCE_YARDS = 45;
/** Zoomed in closer than this, the camera is the character's eyes (the wheel snaps to 0)... */
export const WALK_FIRST_PERSON_YARDS = 0.8;
/** ...and the first wheel step out of first person lands here. */
export const WALK_FIRST_PERSON_EXIT_YARDS = WALK_FIRST_PERSON_YARDS * 1.5;
/** Pitch range, differs from the free cam's: this far above or below the horizon. */
export const WALK_PITCH_LIMIT_RADIANS = 1.35;
export const WALK_START_PITCH_RADIANS = 0.35;
/** Leaving walk mode, the free cam picks up at least this far out and at least WALK_START_PITCH_RADIANS up. */
export const WALK_EXIT_DISTANCE_YARDS = 30;
/** Collision padding, differs from the free cam's: the walk camera stops this short of a wall. */
export const WALK_COLLISION_PADDING_YARDS = 0.3;

// --- Free cam (walk mode with a hidden character) ---
// Its four deliberate differences (chronicle-1514): no gravity; Space/Z move
// the pivot; travel speed scales with the zoom distance (and Shift); the
// middle-drag pans (OrbitControls, below).

/** Free-cam travel (W/S, strafes, Space/Z) per second, as a fraction of the camera distance: the same feel zoomed in or out. */
export const FREE_CAM_TRAVEL_DISTANCES_PER_S = 0.6;
/** Shift multiplies the free cam's travel speed by this. */
export const FREE_CAM_FAST_FACTOR = 3;
/** Pitch range, differs from walk mode's: the free cam looks no closer to straight down than this... */
export const FREE_CAM_MAX_PITCH_RADIANS = Math.PI / 2 - 0.01;
/** ...and no lower than OrbitControls' polar limit allows: 30° above the horizon on flat artwork (token faces still show)... */
export const TILES_MAX_POLAR_RADIANS = Math.PI / 3;
/** ...down to the floor on the mesh. */
export const MESH_MAX_POLAR_RADIANS = Math.PI / 2 - 0.05;
/** Zoom range, differs from walk mode's: never closer than this to the pivot... */
export const FREE_CAM_MIN_DISTANCE_SCENE_UNITS = 1;
/** ...and out to this on flat artwork... */
export const TILES_MAX_DISTANCE_SCENE_UNITS = 400;
/** ...to this multiple of the Fit distance with a fight focused on the mesh... */
export const MESH_MAX_DISTANCE_FACTOR = 2.5;
/** ...or of the mesh's bounding radius without one. */
export const MESH_FULL_MAP_DISTANCE_FACTOR = 3;
/** Collision padding, differs from walk mode's: 1.5 × the orbit camera's near plane, past its reach. */
export const FREE_CAM_COLLISION_PADDING_SCENE_UNITS = ORBIT_NEAR * 1.5;

// --- OrbitControls: touch gestures, and the middle-drag pan (speed multipliers) ---
// The mouse and keys move the free cam 1:1 with no inertia, as walk mode
// does; touch keeps its own inertia on the mobile layout.

export const ORBIT_ROTATE_SPEED = 0.6;
export const ORBIT_ZOOM_SPEED = 0.9;
export const ORBIT_PAN_SPEED = 0.8;
export const MOBILE_ORBIT_DAMPING = 0.22;
export const MOBILE_ORBIT_ROTATE_SPEED = 0.35;
export const MOBILE_ORBIT_ZOOM_SPEED = 0.5;
/** A short two-finger swipe should cover useful ground on a small screen. */
export const MOBILE_ORBIT_PAN_SPEED = 1;
