/** Texture-free indexed geometry. The bytes retain the GLB's float32 vertices. */
export interface FloorSupportDescriptor {
  version: 1;
  path: string;
  sha256: string;
  datasetID: string;
  mapID: number;
  frame: "wow-yup-mirrored-x";
  floorIDs: number[];
  sources: { floor: number; path: string; sha256: string }[];
  validated: boolean;
}
export interface FloorSupportArtifact {
  version: 1;
  datasetID: string;
  mapID: number;
  frame: "wow-yup-mirrored-x";
  floorIDs: number[];
  sources: FloorSupportDescriptor["sources"];
  encoding: "indexed-f32-le-u32-le";
  floors: { floor: number; positions: string; indices: string }[];
}
const MAX_BYTES = 24 * 1024 * 1024;
const CELL = 32;
const MAX_GRID_ENTRIES = 2_000_000;
const HASH = /^[a-f0-9]{64}$/;

export function usableFloorSupport(
  descriptor: FloorSupportDescriptor | undefined,
  datasetID: string | undefined,
  mapID: number,
  floors: readonly { floor: number; mesh?: { path: string } }[],
): descriptor is FloorSupportDescriptor {
  return Boolean(descriptor && descriptor.version === 1 && descriptor.frame === "wow-yup-mirrored-x"
    && descriptor.datasetID === datasetID && descriptor.mapID === mapID
    && typeof descriptor.validated === "boolean" && HASH.test(descriptor.sha256)
    && /^support\/[a-zA-Z0-9_./-]+\.json$/.test(descriptor.path) && !descriptor.path.includes("..")
    && Array.isArray(descriptor.floorIDs) && descriptor.floorIDs.length === floors.length
    && new Set(descriptor.floorIDs).size === floors.length
    && Array.isArray(descriptor.sources) && descriptor.sources.length === floors.length
    && floors.every(floor => descriptor.floorIDs.includes(floor.floor)
      && descriptor.sources.filter(source => source && source.floor === floor.floor && source.path === floor.mesh?.path && HASH.test(source.sha256)).length === 1));
}

function decode(text: string, float: boolean): number[] {
  if (typeof text !== "string" || text.length > MAX_BYTES * 4 / 3 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new Error("Invalid support buffer");
  const bytes = Uint8Array.from(atob(text), char => char.charCodeAt(0));
  if (bytes.length % 12) throw new Error("Invalid support triples");
  const view = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 4 }, (_, i) => float ? view.getFloat32(i * 4, true) : view.getUint32(i * 4, true));
}

export interface FloorSupportIndex {
  candidates(x: number, y: number, z?: number): number[];
}

/** Validates before indexing. Grid acceleration stores triangle references, not raster guesses. */
export function indexFloorSupport(value: unknown, descriptor: FloorSupportDescriptor): FloorSupportIndex {
  const artifact = value as FloorSupportArtifact;
  if (!artifact || artifact.version !== 1 || artifact.encoding !== "indexed-f32-le-u32-le"
    || artifact.datasetID !== descriptor.datasetID || artifact.mapID !== descriptor.mapID || artifact.frame !== descriptor.frame
    || JSON.stringify(artifact.floorIDs) !== JSON.stringify(descriptor.floorIDs)
    || JSON.stringify(artifact.sources) !== JSON.stringify(descriptor.sources)
    || !Array.isArray(artifact.floors) || artifact.floors.length !== descriptor.floorIDs.length
    || new Set(artifact.floors.map(f => f.floor)).size !== descriptor.floorIDs.length) throw new Error("Floor support provenance mismatch");
  let entries = 0;
  const floors = artifact.floors.map(floor => {
    if (!descriptor.floorIDs.includes(floor.floor)) throw new Error("Unexpected support floor");
    const positions = decode(floor.positions, true);
    const indices = decode(floor.indices, false);
    if (!positions.every(Number.isFinite) || indices.some(index => index * 3 >= positions.length)) throw new Error("Invalid support geometry");
    const grid = new Map<string, number[]>();
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const xs = [positions[a], positions[b], positions[c]];
      const ys = [positions[a + 2], positions[b + 2], positions[c + 2]];
      const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
      if (Math.abs(area) < 1e-10) continue;
      const minX = Math.floor(Math.min(...xs) / CELL), maxX = Math.floor(Math.max(...xs) / CELL);
      const minY = Math.floor(Math.min(...ys) / CELL), maxY = Math.floor(Math.max(...ys) / CELL);
      entries += (maxX - minX + 1) * (maxY - minY + 1);
      if (entries > MAX_GRID_ENTRIES) throw new Error("Support index too large");
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        const bucket = grid.get(key) ?? [];
        bucket.push(i); grid.set(key, bucket);
      }
    }
    return { floor: floor.floor, positions, indices, grid };
  });
  return {
    candidates(x, y, z) {
      if (![x, y].every(Number.isFinite) || (z !== undefined && !Number.isFinite(z))) return [];
      const px = -x, py = y;
      const key = `${Math.floor(px / CELL)},${Math.floor(py / CELL)}`;
      return floors.filter(({ positions: p, indices, grid }) => (grid.get(key) ?? []).some(i => {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const den = (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
        const u = ((p[b + 2] - p[c + 2]) * (px - p[c]) + (p[c] - p[b]) * (py - p[c + 2])) / den;
        const v = ((p[c + 2] - p[a + 2]) * (px - p[c]) + (p[a] - p[c]) * (py - p[c + 2])) / den;
        const w = 1 - u - v;
        return u >= 0 && v >= 0 && w >= 0 && (z === undefined || Math.abs(z - (u * p[a + 1] + v * p[b + 1] + w * p[c + 1])) <= 3);
      })).map(floor => floor.floor);
    },
  };
}

export async function fetchFloorSupport(url: string, descriptor: FloorSupportDescriptor, signal?: AbortSignal): Promise<FloorSupportIndex> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Floor support ${response.status}`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Support artifact too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing floor support body");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) throw new Error("Support artifact too large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  if (hash !== descriptor.sha256) throw new Error("Floor support checksum mismatch");
  return indexFloorSupport(JSON.parse(new TextDecoder().decode(bytes)), descriptor);
}
