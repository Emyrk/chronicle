// Offline validation only. Assets, observations and derived geometry stay outside Git.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { estimateEncounterFloor } from '../../src/pages/Instance/EventsPanels/Map/encounterFloor.ts';
import { indexFloorSupport } from '../../src/pages/Instance/EventsPanels/Map/floorSupport.ts';
import { inferFloorTrack, inferredFloorAt } from '../../src/pages/Instance/EventsPanels/Map/floorInference.ts';

const [directory, fixturePath] = process.argv.slice(2);
if (!directory || !fixturePath) throw new Error('Usage: node --experimental-strip-types scripts/floor-inference/validate.mjs EXTERNAL_DIRECTORY FIXTURE.json');
const root = resolve(directory);
if (spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel']).status === 0) throw new Error('Derived assets must stay outside Git repositories');
const read = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const manifest = await read('manifest.json');
const instance = await read('instance.json');
if (instance.dataset_id !== fixture.datasetID || instance.position_coordinate_space !== 'world') throw new Error('Dataset or world-coordinate contract mismatch');
const map = manifest.instances.find(map => map.mapID === fixture.mapID);
if (!map) throw new Error('Map missing');
if (map.floors.length !== fixture.geometry.length || new Set(map.floors.map(f => f.floor)).size !== map.floors.length) throw new Error('Floor set changed');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const support = [];
for (const floor of map.floors) {
  if (floor.mesh?.frame !== 'wow-yup-mirrored-x') throw new Error('Missing/unsupported floor mesh');
  const bytes = await readFile(resolve(root, `floor-${floor.floor}.glb`));
  const expected = fixture.geometry.find(item => item.floor === floor.floor);
  if (!expected || expected.path !== floor.mesh.path || expected.sha256 !== sha(bytes)) throw new Error('Geometry revision mismatch; recalibrate explicitly');
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  if (gltf.extensionsRequired?.some(x => x !== 'EXT_texture_webp')) throw new Error('Unsupported required GLB extension');
  const binOffset = 20 + jsonLength;
  const bin = bytes.subarray(binOffset + 8, binOffset + 8 + bytes.readUInt32LE(binOffset));
  // Parse geometry without fetching textures or requiring a browser Image API.
  delete gltf.images; delete gltf.textures; delete gltf.materials;
  delete gltf.extensionsRequired; delete gltf.extensionsUsed;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  gltf.buffers = [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` }];
  globalThis.ProgressEvent ??= class ProgressEvent {};
  const parsed = await new GLTFLoader().parseAsync(JSON.stringify(gltf), '');
  // Same centering removal as MapScene3D.parsedDungeonMesh.
  for (const node of parsed.scene.children) node.position.set(0, 0, 0);
  parsed.scene.updateMatrixWorld(true);
  const geometries = [];
  parsed.scene.traverse(node => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    geometries.push({ geometry, bvh: new MeshBVH(geometry) });
  });
  support.push({ floor: floor.floor, path: floor.mesh.path, sha256: sha(bytes), geometries });
}

// Strict wire decoder preserving timestamps, unit IDs and explicit floor presence.
function varint(bytes, state) {
  let value = 0n;
  for (let shift = 0n; shift < 70n; shift += 7n) {
    if (state.offset >= bytes.length) throw new Error('Truncated varint');
    const byte = bytes[state.offset++]; value |= BigInt(byte & 127) << shift;
    if (!(byte & 128)) return value;
  }
  throw new Error('Oversized varint');
}
function fields(bytes) {
  const result = new Map(); const state = { offset: 0 };
  while (state.offset < bytes.length) {
    const key = Number(varint(bytes, state)); const wire = key & 7;
    let value;
    if (wire === 0) value = varint(bytes, state);
    else if (wire === 1) { value = bytes.readDoubleLE(state.offset); state.offset += 8; }
    else if (wire === 5) { value = bytes.readFloatLE(state.offset); state.offset += 4; }
    else if (wire === 2) {
      const length = Number(varint(bytes, state));
      if (state.offset + length > bytes.length) throw new Error('Truncated field');
      value = bytes.subarray(state.offset, state.offset + length); state.offset += length;
    } else throw new Error(`Unsupported wire type ${wire}`);
    result.set(key >>> 3, value);
  }
  return result;
}
let bytes = await readFile(resolve(root, 'positions.bin'));
if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
const observations = [];
const telemetry = { totalSamples: 0, partySamplesWithZ: 0, partySamplesWithMap: 0, partySamplesWithFloor: 0 };
const encounters = new Map(instance.encounters.map(e => [e.id, e]));
const players = new Set(Object.keys(instance.players));
const state = { offset: 0 };
const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
while (state.offset < bytes.length) {
  const length = Number(varint(bytes, state));
  const encounterID = bytes.subarray(state.offset, state.offset + length).toString(); state.offset += length;
  const firstMs = Number(varint(bytes, state));
  const count = Number(varint(bytes, state));
  const dataLength = Number(varint(bytes, state));
  const end = state.offset + dataLength;
  if (end > bytes.length) throw new Error('Truncated encounter');
  const encounter = encounters.get(encounterID);
  if (!encounter || encounter.map_id !== fixture.mapID) throw new Error('Unexpected encounter map');
  let decoded = 0;
  while (state.offset < end) {
    const length = Number(varint(bytes, state));
    const f = fields(bytes.subarray(state.offset, state.offset + length)); state.offset += length; decoded++;
    const unit = f.get(2)?.toString();
    telemetry.totalSamples++;
    if (!players.has(unit)) continue;
    if (f.has(7)) telemetry.partySamplesWithZ++;
    if (f.get(5)) telemetry.partySamplesWithMap++;
    if (f.has(8)) telemetry.partySamplesWithFloor++;
    if (f.get(5) && Number(f.get(5)) !== fixture.mapID) throw new Error('Conflicting sample map');
    const meta = fields(f.get(1));
    const timestampMs = firstMs + Number(BigInt.asIntN(64, meta.get(2) ?? 0n));
    const x = f.get(3) ?? 0; const y = f.get(4) ?? 0;
    if (![timestampMs, x, y].every(Number.isFinite)) throw new Error('Nonfinite position');
    ray.origin.set(-x, 10000, y);
    const candidates = support.filter(floor => floor.geometries.some(({ bvh }) => {
      const hits = bvh.raycast(ray, THREE.DoubleSide);
      return hits.some(hit => f.get(7) === undefined || Math.abs(hit.point.y - f.get(7)) <= fixture.zToleranceYards);
    })).map(floor => floor.floor);
    observations.push({ timestampMs, unit, x, y, z: f.get(7), candidates, synthetic: Boolean(meta.get(4)), floor: f.has(8) ? Number(f.get(8)) : undefined, encounterID });
  }
  if (state.offset !== end || decoded !== count) throw new Error('Encounter framing mismatch');
}
// External diagnostic data only: includes player identifiers and must never enter Git.
await writeFile(resolve(root, 'floor-observations.json'), JSON.stringify(observations));
const track = [...encounters.keys()].flatMap(id => inferFloorTrack(observations.filter(row => row.encounterID === id), fixture.options)).sort((a, b) => a.timestampMs - b.timestampMs);
await writeFile(resolve(root, 'floor-track.json'), JSON.stringify(track));
const firstMs = Math.min(...instance.encounters.map(e => Date.parse(e.start_time)));
const labels = fixture.labels.map(label => {
  const encounter = instance.encounters.find(e => e.id === label.encounterID);
  if (!encounter) throw new Error('Labeled encounter absent');
  const offsetSeconds = (Date.parse(encounter.start_time) - firstMs) / 1000;
  if (Math.floor(offsetSeconds) !== label.startOffsetSeconds
    || Math.abs(offsetSeconds - label.verifiedStartOffsetSeconds) > 0.001) throw new Error('Encounter start label mismatch');
  const estimates = track.filter(e => e.timestampMs >= Date.parse(encounter.start_time) && e.timestampMs <= Date.parse(encounter.end_time));
  const counts = {};
  for (const estimate of estimates) counts[estimate.floor ?? 'unknown'] = (counts[estimate.floor ?? 'unknown'] ?? 0) + 1;
  return { ...label, verifiedOffsetSeconds: offsetSeconds, estimates: counts, atStart: inferredFloorAt(track, Date.parse(encounter.start_time), fixture.options.evidenceWindowMs) };
});
// Compact indexed float32 geometry, no textures and no lossy rasterization.
const encode = (values, floating) => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => floating ? bytes.writeFloatLE(value, index * 4) : bytes.writeUInt32LE(value, index * 4));
  return bytes.toString('base64');
};
const artifact = {
  version: 1, datasetID: fixture.datasetID, mapID: fixture.mapID,
  frame: 'wow-yup-mirrored-x', floorIDs: support.map(floor => floor.floor),
  sources: support.map(({ floor, path, sha256 }) => ({ floor, path, sha256 })),
  encoding: 'indexed-f32-le-u32-le',
  floors: support.map(floor => {
    const positions = []; const indices = [];
    for (const { geometry } of floor.geometries) {
      const offset = positions.length / 3;
      for (const value of geometry.index.array) indices.push(value + offset);
      for (const value of geometry.attributes.position.array) positions.push(value);
    }
    return { floor: floor.floor, positions: encode(positions, true), indices: encode(indices, false) };
  }),
};
const artifactBytes = Buffer.from(JSON.stringify(artifact));
const descriptor = {
  version: 1, path: `support/${fixture.mapID}-${sha(artifactBytes)}.json`, sha256: sha(artifactBytes),
  datasetID: fixture.datasetID, mapID: fixture.mapID, frame: artifact.frame,
  floorIDs: artifact.floorIDs, sources: artifact.sources, validated: false,
};
await mkdir(resolve(root, 'support'), { recursive: true });
await writeFile(resolve(root, descriptor.path), artifactBytes);
await writeFile(resolve(root, 'floor-support-descriptor.json'), JSON.stringify(descriptor, null, 2));
const index = indexFloorSupport(artifact, descriptor);
let candidateMismatches = 0;
for (const observation of observations) {
  const actual = index.candidates(observation.x, observation.y, observation.z);
  if (JSON.stringify(actual) !== JSON.stringify(observation.candidates)) candidateMismatches++;
}
const encounterEstimates = [];
let previousFloor = null;
for (const encounter of [...encounters.values()].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))) {
  const positionsByUnit = new Map();
  for (const observation of observations.filter(row => row.encounterID === encounter.id)) {
    const samples = positionsByUnit.get(observation.unit) ?? [];
    samples.push({ ...observation, mapId: fixture.mapID }); positionsByUnit.set(observation.unit, samples);
  }
  const estimate = estimateEncounterFloor({ positionsByUnit }, fixture.mapID, artifact.floorIDs, players, index, previousFloor);
  previousFloor = estimate.floor;
  encounterEstimates.push({ encounterID: encounter.id, ...estimate });
}
for (const label of labels) label.encounterEstimate = encounterEstimates.find(value => value.encounterID === label.encounterID);
const measurements = {
  sourceGLBBytes: (await Promise.all(support.map(floor => readFile(resolve(root, `floor-${floor.floor}.glb`))))).reduce((sum, bytes) => sum + bytes.length, 0),
  supportJSONBytes: artifactBytes.length, supportGzipBytes: gzipSync(artifactBytes).length, candidateMismatches,
};
const passed = labels.length > 0 && observations.every(row => row.candidates.length > 0) && candidateMismatches === 0 && labels.every(label => label.atStart?.floor === label.floor);
const report = { passed, measurements, evaluationScope: fixture.provenance?.evaluationScope ?? "Unspecified evaluation scope", heldOutValidated: false, version: 1, datasetID: fixture.datasetID, mapID: fixture.mapID, options: fixture.options, geometry: support.map(({ floor, path, sha256 }) => ({ floor, path, sha256 })), telemetry, samples: observations.length, uncovered: observations.filter(o => !o.candidates.length).length, ambiguous: observations.filter(o => o.candidates.length > 1).length, labels };
await writeFile(resolve(root, 'floor-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

// Incorrect or unknown annotated starts block activation. A report still exists for diagnosis.
if (!passed) process.exitCode = 2;
