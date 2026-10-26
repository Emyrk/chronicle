export interface FoundryZipEntry {
  name: string;
  bytes: Uint8Array;
}

export interface FoundryBundleAssetPlan {
  kind: "renders" | "meshes";
  mapID: number;
  floor: number | null;
  name: string;
  file: string;
  bytes: Uint8Array;
  metadata: Record<string, unknown>;
}

export interface FoundryBundlePlan {
  namespace: string;
  maps: { mapID: number; firstFloor: number | null; floors: { floor: number; preferred2D: "renders" | "art" }[] }[];
  assets: FoundryBundleAssetPlan[];
}

export interface FoundryUploadResult {
  path: string;
  width?: number;
  height?: number;
}

export interface MapBundleTools {
  parseStoredZip(bytes: Uint8Array | ArrayBuffer): Map<string, Uint8Array>;
  validateMapFoundryBundle(
    value: unknown,
    files: Map<string, Uint8Array>,
    namespace: string,
    instances: unknown[],
  ): Promise<FoundryBundlePlan>;
  mergeMapFoundryBundle(
    draft: unknown,
    plan: FoundryBundlePlan,
    uploads: FoundryUploadResult[],
  ): { renders: Record<string, unknown>; meshes: Record<string, unknown> };
}

/**
 * Kept as one self-contained function so the exact helpers tested here can be
 * serialized into the Map Foundry's embedded browser script.
 */
export function createMapBundleTools(): MapBundleTools {
  const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  const bundleFormat = "chronicle-map-foundry-bundle-v1";

  function fail(message: string): never {
    throw new TypeError(message);
  }

  function uint16(view: DataView, offset: number): number {
    return view.getUint16(offset, true);
  }

  function uint32(view: DataView, offset: number): number {
    return view.getUint32(offset, true);
  }

  function decodeName(bytes: Uint8Array, context: string): string {
    try {
      return textDecoder.decode(bytes);
    } catch {
      return fail(`${context} is not valid UTF-8`);
    }
  }

  function safeArchiveName(name: string): boolean {
    if (name === "" || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
    const parts = name.split("/");
    const directory = parts.at(-1) === "";
    if (directory) parts.pop();
    return parts.length > 0 && parts.every((part) => part !== "" && part !== "." && part !== "..");
  }

  function hasZip64Extra(bytes: Uint8Array): boolean {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    while (offset < bytes.length) {
      if (offset + 4 > bytes.length) fail("ZIP extra field is truncated");
      const id = uint16(view, offset);
      const size = uint16(view, offset + 2);
      offset += 4;
      if (offset + size > bytes.length) fail("ZIP extra field is truncated");
      if (id === 0x0001) return true;
      offset += size;
    }
    return false;
  }

  function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function parseStoredZip(input: Uint8Array | ArrayBuffer): Map<string, Uint8Array> {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < 22) fail("ZIP archive is truncated");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const searchStart = Math.max(0, bytes.length - 22 - 0xffff);
    let eocd = -1;
    for (let offset = bytes.length - 22; offset >= searchStart; offset--) {
      if (uint32(view, offset) === 0x06054b50 && offset + 22 + uint16(view, offset + 20) === bytes.length) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) fail("ZIP end-of-central-directory record is missing or malformed");

    const disk = uint16(view, eocd + 4);
    const centralDisk = uint16(view, eocd + 6);
    const diskEntries = uint16(view, eocd + 8);
    const totalEntries = uint16(view, eocd + 10);
    const centralSize = uint32(view, eocd + 12);
    const centralOffset = uint32(view, eocd + 16);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) fail("multi-disk ZIP archives are not supported");
    if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail("ZIP64 archives are not supported");
    if (centralOffset + centralSize !== eocd || centralOffset > bytes.length) fail("ZIP central directory is malformed");

    const entries = new Map<string, Uint8Array>();
    const ranges: { start: number; end: number; name: string }[] = [];
    let offset = centralOffset;
    for (let index = 0; index < totalEntries; index++) {
      if (offset + 46 > eocd || uint32(view, offset) !== 0x02014b50) fail("ZIP central directory is malformed");
      const flags = uint16(view, offset + 8);
      const method = uint16(view, offset + 10);
      const checksum = uint32(view, offset + 16);
      const compressedSize = uint32(view, offset + 20);
      const uncompressedSize = uint32(view, offset + 24);
      const nameLength = uint16(view, offset + 28);
      const extraLength = uint16(view, offset + 30);
      const commentLength = uint16(view, offset + 32);
      const diskStart = uint16(view, offset + 34);
      const localOffset = uint32(view, offset + 42);
      const end = offset + 46 + nameLength + extraLength + commentLength;
      if (end > eocd) fail("ZIP central directory entry is truncated");
      if ((flags & 0x0001) !== 0) fail("encrypted ZIP entries are not supported");
      if (method !== 0) fail("ZIP entries must use the STORED compression method");
      if (diskStart !== 0) fail("multi-disk ZIP archives are not supported");
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) fail("ZIP64 archives are not supported");
      if (compressedSize !== uncompressedSize) fail("STORED ZIP entry sizes do not match");
      const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
      const extra = bytes.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
      if (hasZip64Extra(extra)) fail("ZIP64 archives are not supported");
      const name = decodeName(nameBytes, `ZIP entry ${index + 1} name`);
      if (!safeArchiveName(name)) fail(`unsafe ZIP entry name ${JSON.stringify(name)}`);
      if (entries.has(name)) fail(`duplicate ZIP entry name ${JSON.stringify(name)}`);

      if (localOffset + 30 > centralOffset || uint32(view, localOffset) !== 0x04034b50) fail(`ZIP local header for ${JSON.stringify(name)} is malformed`);
      const localFlags = uint16(view, localOffset + 6);
      const localMethod = uint16(view, localOffset + 8);
      const localNameLength = uint16(view, localOffset + 26);
      const localExtraLength = uint16(view, localOffset + 28);
      const localHeaderEnd = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = localHeaderEnd + compressedSize;
      if (localFlags !== flags || localMethod !== method || dataEnd > centralOffset) fail(`ZIP local header for ${JSON.stringify(name)} does not match its central entry`);
      const localName = decodeName(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength), `ZIP local entry ${name}`);
      if (localName !== name) fail(`ZIP local header name for ${JSON.stringify(name)} does not match`);
      if (hasZip64Extra(bytes.subarray(localOffset + 30 + localNameLength, localHeaderEnd))) fail("ZIP64 archives are not supported");
      if ((flags & 0x0008) === 0) {
        if (uint32(view, localOffset + 14) !== checksum || uint32(view, localOffset + 18) !== compressedSize || uint32(view, localOffset + 22) !== uncompressedSize) {
          fail(`ZIP local header sizes for ${JSON.stringify(name)} do not match`);
        }
      }
      const data = bytes.subarray(localHeaderEnd, dataEnd);
      if (crc32(data) !== checksum) fail(`ZIP entry ${JSON.stringify(name)} failed its CRC-32 check`);
      ranges.push({ start: localOffset, end: dataEnd, name });
      entries.set(name, data);
      offset = end;
    }
    if (offset !== eocd) fail("ZIP central directory entry count or size is malformed");
    ranges.sort((a, b) => a.start - b.start);
    for (let index = 1; index < ranges.length; index++) {
      if (ranges[index]!.start < ranges[index - 1]!.end) fail(`ZIP entries ${JSON.stringify(ranges[index - 1]!.name)} and ${JSON.stringify(ranges[index]!.name)} overlap`);
    }
    if (!entries.has("foundry.json")) fail("ZIP archive is missing root foundry.json");
    return entries;
  }

  function object(value: unknown, context: string, fields: string[]): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${context} must be an object`);
    const result = value as Record<string, unknown>;
    for (const key of Object.keys(result)) if (!fields.includes(key)) fail(`${context} has unknown field ${JSON.stringify(key)}`);
    return result;
  }

  function array(value: unknown, context: string): unknown[] {
    if (!Array.isArray(value)) fail(`${context} must be an array`);
    return value;
  }

  function string(value: unknown, context: string): string {
    if (typeof value !== "string" || value === "") fail(`${context} must be a non-empty string`);
    return value;
  }

  function integer(value: unknown, context: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) fail(`${context} must be an integer`);
    return value;
  }

  function finite(value: unknown, context: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(`${context} must be a finite number`);
    return value;
  }

  function bounds(value: unknown, context: string): Record<string, number> {
    const input = object(value, context, ["minX", "maxX", "minY", "maxY"]);
    const result = {
      minX: finite(input.minX, `${context}.minX`),
      maxX: finite(input.maxX, `${context}.maxX`),
      minY: finite(input.minY, `${context}.minY`),
      maxY: finite(input.maxY, `${context}.maxY`),
    };
    if (result.minX >= result.maxX || result.minY >= result.maxY) fail(`${context} must have minX < maxX and minY < maxY`);
    return result;
  }

  function assetMetadata(value: unknown, context: string, kind: "renders" | "meshes"): Record<string, unknown> {
    const fields = kind === "renders"
      ? ["file", "bounds", "sha256", "bytes"]
      : ["file", "bounds", "zMin", "zMax", "frame", "liquid", "sha256", "bytes"];
    const input = object(value, context, fields);
    const file = string(input.file, `${context}.file`);
    if (!safeArchiveName(file) || file.endsWith("/")) fail(`${context}.file is unsafe`);
    if (kind === "renders" && !/\.(png|webp)$/i.test(file)) fail(`${context}.file must be a PNG or WebP`);
    if (kind === "meshes" && !/\.glb$/i.test(file)) fail(`${context}.file must be a GLB`);
    const result: Record<string, unknown> = { file };
    if (input.bounds !== undefined) result.bounds = bounds(input.bounds, `${context}.bounds`);
    if (kind === "meshes") {
      if (input.bounds === undefined) fail(`${context}.bounds is required`);
      result.zMin = finite(input.zMin, `${context}.zMin`);
      result.zMax = finite(input.zMax, `${context}.zMax`);
      result.frame = string(input.frame, `${context}.frame`);
      if ((result.zMin as number) >= (result.zMax as number) || result.frame !== "wow-yup-mirrored-x") fail(`${context} requires zMin < zMax and frame wow-yup-mirrored-x`);
      if (input.liquid !== undefined) {
        const liquid = object(input.liquid, `${context}.liquid`, ["color", "opacity"]);
        const color = string(liquid.color, `${context}.liquid.color`);
        const opacity = finite(liquid.opacity, `${context}.liquid.opacity`);
        if (!/^#[0-9a-fA-F]{6}$/.test(color) || opacity <= 0 || opacity > 1) fail(`${context}.liquid requires a hex color and opacity in (0, 1]`);
        result.liquid = { color, opacity };
      }
    }
    if (input.sha256 !== undefined) {
      const sha256 = string(input.sha256, `${context}.sha256`).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sha256)) fail(`${context}.sha256 must be 64 hexadecimal characters`);
      result.sha256 = sha256;
    }
    if (input.bytes !== undefined) {
      const byteLength = integer(input.bytes, `${context}.bytes`);
      if (byteLength < 0) fail(`${context}.bytes must not be negative`);
      result.bytes = byteLength;
    }
    return result;
  }

  async function sha256(bytes: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  async function validateMapFoundryBundle(
    value: unknown,
    files: Map<string, Uint8Array>,
    namespace: string,
    instances: unknown[],
  ): Promise<FoundryBundlePlan> {
    const root = object(value, "foundry.json", ["format", "namespace", "maps"]);
    if (root.format !== bundleFormat) fail(`unsupported foundry.json format ${JSON.stringify(root.format)}`);
    if (root.namespace !== namespace) fail(`bundle namespace ${JSON.stringify(root.namespace)} does not match selected namespace ${JSON.stringify(namespace)}`);
    const existing = new Map<number, { name: string; floors: Set<number> }>();
    for (const raw of instances) {
      const instance = raw as { mapID?: unknown; name?: unknown; floors?: unknown };
      if (typeof instance.mapID !== "number" || typeof instance.name !== "string" || !Array.isArray(instance.floors)) continue;
      existing.set(instance.mapID, {
        name: instance.name,
        floors: new Set(instance.floors.flatMap((floor) => floor && typeof floor === "object" && typeof (floor as { floor?: unknown }).floor === "number" ? [(floor as { floor: number }).floor] : [])),
      });
    }
    const assets: FoundryBundleAssetPlan[] = [];
    const maps: { mapID: number; firstFloor: number | null; floors: { floor: number; preferred2D: "renders" | "art" }[] }[] = [];
    const seenMaps = new Set<number>();
    for (const [mapIndex, rawMap] of array(root.maps, "foundry.json.maps").entries()) {
      const context = `foundry.json.maps[${mapIndex}]`;
      const map = object(rawMap, context, ["mapID", "name", "render", "mesh", "floors"]);
      const mapID = integer(map.mapID, `${context}.mapID`);
      if (mapID <= 0) fail(`${context}.mapID must be positive`);
      if (seenMaps.has(mapID)) fail(`duplicate bundle mapID ${mapID}`);
      seenMaps.add(mapID);
      const base = existing.get(mapID);
      if (!base) fail(`bundle references unknown mapID ${mapID}`);
      const name = map.name === undefined ? base.name : string(map.name, `${context}.name`);
      const floors = array(map.floors, `${context}.floors`);
      const seenFloors = new Set<number>();
      const plannedFloors: { floor: number; preferred2D: "renders" | "art" }[] = [];
      let firstFloor: number | null = null;
      const addAsset = (rawAsset: unknown, kind: "renders" | "meshes", floor: number | null, assetContext: string) => {
        const metadata = assetMetadata(rawAsset, assetContext, kind);
        const file = metadata.file as string;
        const bytes = files.get(file);
        if (!bytes) fail(`${assetContext} references missing ZIP file ${JSON.stringify(file)}`);
        assets.push({ kind, mapID, floor, name, file, bytes, metadata });
      };
      if (map.render !== undefined) addAsset(map.render, "renders", null, `${context}.render`);
      if (map.mesh !== undefined) addAsset(map.mesh, "meshes", null, `${context}.mesh`);
      for (const [floorIndex, rawFloor] of floors.entries()) {
        const floorContext = `${context}.floors[${floorIndex}]`;
        const floorEntry = object(rawFloor, floorContext, ["floor", "preferred2D", "render", "mesh"]);
        const floor = integer(floorEntry.floor, `${floorContext}.floor`);
        if (seenFloors.has(floor)) fail(`duplicate bundle mapID ${mapID} floor ${floor}`);
        seenFloors.add(floor);
        if (!base.floors.has(floor)) fail(`bundle references unknown mapID ${mapID} floor ${floor}`);
        if (floorEntry.render === undefined && floorEntry.mesh === undefined) fail(`${floorContext} must contain render or mesh`);
        const preferred2D = floorEntry.preferred2D === undefined ? "renders" : string(floorEntry.preferred2D, `${floorContext}.preferred2D`);
        if (preferred2D !== "renders" && preferred2D !== "art") fail(`${floorContext}.preferred2D must be "renders" or "art"`);
        plannedFloors.push({ floor, preferred2D });
        if (firstFloor === null) firstFloor = floor;
        if (floorEntry.render !== undefined) addAsset(floorEntry.render, "renders", floor, `${floorContext}.render`);
        if (floorEntry.mesh !== undefined) addAsset(floorEntry.mesh, "meshes", floor, `${floorContext}.mesh`);
      }
      if (map.render === undefined && map.mesh === undefined && floors.length === 0) fail(`${context} must contain artwork`);
      maps.push({ mapID, firstFloor, floors: plannedFloors });
    }
    if (maps.length === 0) fail("foundry.json.maps must contain at least one map");
    for (const asset of assets) {
      if (asset.bytes.byteLength === 0 || asset.bytes.byteLength > 100 * 1024 * 1024) fail(`${asset.file} must be between 1 byte and 100 MB`);
      if (asset.metadata.bytes !== undefined && asset.metadata.bytes !== asset.bytes.byteLength) {
        fail(`${asset.file} has ${asset.bytes.byteLength} bytes, expected ${asset.metadata.bytes}`);
      }
      if (asset.metadata.sha256 !== undefined && await sha256(asset.bytes) !== asset.metadata.sha256) {
        fail(`${asset.file} does not match its sha256 metadata`);
      }
    }
    return { namespace, maps, assets };
  }

  function mergeMapFoundryBundle(
    draft: unknown,
    plan: FoundryBundlePlan,
    uploads: FoundryUploadResult[],
  ): { renders: Record<string, unknown>; meshes: Record<string, unknown> } {
    if (uploads.length !== plan.assets.length) fail("bundle upload result count does not match its asset plan");
    const cloned = JSON.parse(JSON.stringify(draft)) as { renders?: { instances?: unknown[] }; meshes?: { instances?: unknown[] } };
    if (!cloned.renders || !Array.isArray(cloned.renders.instances) || !cloned.meshes || !Array.isArray(cloned.meshes.instances)) {
      fail("map draft is malformed");
    }
    function ensureLayerEntry(layer: { instances?: unknown[] }, mapID: number, name: string): Record<string, unknown> {
      let entry = layer.instances!.find((candidate) => candidate && typeof candidate === "object" && (candidate as { mapID?: unknown }).mapID === mapID) as Record<string, unknown> | undefined;
      if (!entry) {
        entry = { mapID, name };
        layer.instances!.push(entry);
      }
      return entry;
    }
    function ensureLayerFloor(entry: Record<string, unknown>, floor: number): Record<string, unknown> {
      const floors = Array.isArray(entry.floors) ? entry.floors : (entry.floors = []);
      let floorEntry = floors.find((candidate: unknown) => candidate && typeof candidate === "object" && (candidate as { floor?: unknown }).floor === floor) as Record<string, unknown> | undefined;
      if (!floorEntry) {
        floorEntry = { floor };
        floors.push(floorEntry);
        floors.sort((a: unknown, b: unknown) => (a as { floor: number }).floor - (b as { floor: number }).floor);
      }
      return floorEntry;
    }
    for (let index = 0; index < plan.assets.length; index++) {
      const asset = plan.assets[index]!;
      const upload = uploads[index]!;
      if (typeof upload.path !== "string" || upload.path === "") fail(`upload result ${index + 1} has no path`);
      const layer = asset.kind === "renders" ? cloned.renders : cloned.meshes;
      const entry = ensureLayerEntry(layer, asset.mapID, asset.name);
      const field = asset.kind === "renders" ? "renders" : "mesh";
      let target = entry;
      if (asset.floor !== null) target = ensureLayerFloor(entry, asset.floor);
      if (asset.kind === "renders") {
        if (!Number.isSafeInteger(upload.width) || !Number.isSafeInteger(upload.height) || upload.width! <= 0 || upload.height! <= 0) fail(`render upload result ${index + 1} has invalid dimensions`);
        target[field] = {
          path: upload.path,
          width: upload.width,
          height: upload.height,
          ...(asset.metadata.bounds === undefined ? {} : { bounds: asset.metadata.bounds }),
        };
      } else {
        target[field] = {
          path: upload.path,
          bounds: asset.metadata.bounds,
          zMin: asset.metadata.zMin,
          zMax: asset.metadata.zMax,
          frame: asset.metadata.frame,
          ...(asset.metadata.liquid === undefined ? {} : { liquid: asset.metadata.liquid }),
        };
      }
    }
    for (const map of plan.maps) {
      if (map.floors.length === 0) continue;
      const name = plan.assets.find((asset) => asset.mapID === map.mapID)?.name ?? "";
      const entry = ensureLayerEntry(cloned.renders, map.mapID, name);
      for (const floor of map.floors) ensureLayerFloor(entry, floor.floor).preferred2D = floor.preferred2D;
    }
    return { renders: cloned.renders as Record<string, unknown>, meshes: cloned.meshes as Record<string, unknown> };
  }

  return { parseStoredZip, validateMapFoundryBundle, mergeMapFoundryBundle };
}
