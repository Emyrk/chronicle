import type { WowMapFloorBounds } from "@/pages/Technical/mapGallery";
import type { MapPoint } from "../mapModel";

/**
 * A small dungeon built in code: a GLB the scene loads through its normal
 * path (fetch -> GLTFLoader -> BVH), so floor probes, raycasts and camera
 * collision run for real with no network or CDN asset.
 *
 * The bounds below make one scene unit one yard, centred on the origin, with
 * the 100-unit ground (GROUND_WIDTH) spanning 100 yards. Boxes are given in
 * scene coordinates (x right, y up, z toward the viewer at yaw 0):
 *
 *   ground   x -40..40  y -1..0   z -40..40   the floor everywhere
 *   balcony  x -40..-10 y  9..10  z -40..40   a second floor above the west part
 *   wall     x  15..17  y  0..25  z -15..15   a wall standing on the floor
 *
 * Everything else (|x| or |z| beyond 40) is off the mesh.
 */
export const DUNGEON_URL = "https://assets.test/synthetic-dungeon.glb";

export const DUNGEON_BOUNDS: WowMapFloorBounds = { minX: -50, maxX: 50, minY: -50, maxY: 50 };

export const ROOM = {
  ground: { min: [-40, -1, -40], max: [40, 0, 40] },
  balcony: { min: [-40, 9, -40], max: [-10, 10, 40] },
  wall: { min: [15, 0, -15], max: [17, 25, 15] },
} as const;

/** Floor heights the tests expect, in scene units (= yards). */
export const GROUND_Y = 0;
export const BALCONY_Y = 10;
export const WALL_TOP_Y = 25;

/** The artwork point (map percent) over scene (x, z), for units and viewports on this ground (aspect 1). */
export function mapPointAt(x: number, z: number): MapPoint {
  return { leftPercent: x + 50, topPercent: z + 50 };
}

type Vec3 = readonly [number, number, number];

// The 12 outward-facing (counter-clockwise from outside) triangles of a box.
function boxTriangles(min: Vec3, max: Vec3): Vec3[] {
  const corner = (ix: number, iy: number, iz: number): Vec3 => [ix ? max[0] : min[0], iy ? max[1] : min[1], iz ? max[2] : min[2]];
  const faces: { normal: Vec3; quad: Vec3[] }[] = [
    { normal: [1, 0, 0], quad: [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)] },
    { normal: [-1, 0, 0], quad: [corner(0, 0, 0), corner(0, 0, 1), corner(0, 1, 1), corner(0, 1, 0)] },
    { normal: [0, 1, 0], quad: [corner(0, 1, 0), corner(0, 1, 1), corner(1, 1, 1), corner(1, 1, 0)] },
    { normal: [0, -1, 0], quad: [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)] },
    { normal: [0, 0, 1], quad: [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)] },
    { normal: [0, 0, -1], quad: [corner(0, 0, 0), corner(0, 1, 0), corner(1, 1, 0), corner(1, 0, 0)] },
  ];
  const triangles: Vec3[] = [];
  for (const { normal, quad } of faces) {
    const [a, b, c, d] = quad;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const outward = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] > 0;
    triangles.push(...(outward ? [a, b, c, a, c, d] : [a, c, b, a, d, c]));
  }
  return triangles;
}

// The mesh's own frame (dungeonMeshPlacement turns it a quarter about y):
// scene (x, y, z) is mesh (z, y, -x) with these bounds.
function toMeshFrame([x, y, z]: Vec3): Vec3 {
  return [z, y, -x];
}

/** The synthetic dungeon as GLB bytes: one node (and mesh) per box, named as in ROOM. */
export function buildSyntheticDungeonGlb(): ArrayBuffer {
  const chunks: Float32Array[] = [];
  const json = {
    asset: { version: "2.0", generator: "chronicle scene harness" },
    scene: 0,
    scenes: [{ nodes: [] as number[] }],
    nodes: [] as { name: string; mesh: number }[],
    meshes: [] as { name: string; primitives: { attributes: { POSITION: number } }[] }[],
    accessors: [] as object[],
    bufferViews: [] as object[],
    buffers: [{ byteLength: 0 }],
  };
  let byteOffset = 0;
  for (const [name, box] of Object.entries(ROOM)) {
    const vertices = boxTriangles(box.min, box.max).map(toMeshFrame);
    const positions = new Float32Array(vertices.flat());
    const min = [0, 1, 2].map((axis) => Math.min(...vertices.map((vertex) => vertex[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...vertices.map((vertex) => vertex[axis])));
    const index = json.meshes.length;
    json.bufferViews.push({ buffer: 0, byteOffset, byteLength: positions.byteLength, target: 34962 });
    json.accessors.push({ bufferView: index, componentType: 5126, count: vertices.length, type: "VEC3", min, max });
    json.meshes.push({ name, primitives: [{ attributes: { POSITION: index } }] });
    json.nodes.push({ name, mesh: index });
    json.scenes[0].nodes.push(index);
    chunks.push(positions);
    byteOffset += positions.byteLength;
  }
  json.buffers[0].byteLength = byteOffset;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const binLength = Math.ceil(byteOffset / 4) * 4;
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const binStart = 20 + jsonLength;
  view.setUint32(binStart, binLength, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // "BIN\0"
  let at = binStart + 8;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk.buffer), at);
    at += chunk.byteLength;
  }
  return out;
}
