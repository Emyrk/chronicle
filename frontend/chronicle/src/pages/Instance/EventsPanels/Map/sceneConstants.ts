/**
 * Scene constants shared by MapScene3D and the modules split out of it
 * (chronicle-1970). Moved verbatim out of MapScene3D.ts; GROUND_WIDTH is
 * still exported from there too.
 */

/** Ground plane width in scene units; depth follows the artwork's aspect. */
export const GROUND_WIDTH = 100;
// On the mesh, units start from true scale: a player capsule stands this tall.
export const MESH_PLAYER_HEIGHT_YARDS = 2;
// The player capsule's geometry height (CapsuleGeometry radius 0.9, length 1.2).
export const PLAYER_GEOMETRY_HEIGHT = 3;
// A dropped frame never jumps the camera further than this.
export const KEY_MAX_STEP_S = 0.1;
export const DEEP_BREATH_GROUND_LIFT = 0.12;
