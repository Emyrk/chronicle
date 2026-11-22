#!/usr/bin/env node
// Import the production solver directly. Node 22 needs --experimental-strip-types.
import { readFileSync, writeFileSync } from 'node:fs';
import { startFloorTrackBuild } from '../../src/pages/Instance/EventsPanels/Map/walkableFloors.ts';

if (process.argv.includes('--help')) {
  console.log('tracks.mjs queries FIXTURE QUERIES | solve FIXTURE CANDIDATES CALIBRATION TRACKS');
  process.exit(0);
}
const [command, fixturePath, inputPath, calibrationPath, outputPath] = process.argv.slice(2);
if (!['queries', 'solve'].includes(command)) throw new Error('Expected queries or solve; see --help.');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const units = new Map();
for (const row of fixture.events) {
  if (row[0] !== 'p') continue;
  const guid = fixture.guids[row[2]];
  if (!units.has(guid)) units.set(guid, { guid, samples: [] });
  units.get(guid).samples.push({ ms: row[1], x: -row[3], z: row[4] });
}
const queries = new Map();
const candidates = command === 'solve' ? JSON.parse(readFileSync(inputPath, 'utf8')) : null;
function run(referenceY) {
  const build = startFloorTrackBuild({
    units: [...units.values()], scale: 1, referenceY,
    candidatesAt(x, z) {
      const key = `${x},${z}`;
      if (!candidates) {
        queries.set(key, { key, x: -x, y: z });
        return [0];
      }
      if (!Object.hasOwn(candidates, key)) throw new Error('Missing candidate query. Regenerate candidates.');
      return candidates[key];
    },
  }, () => 0);
  while (!build.step(Infinity)) { /* synchronous offline build */ }
  if (!build.result) throw new Error('Floor solver did not complete.');
  return build.result;
}
if (command === 'queries') {
  run(undefined);
  writeFileSync(inputPath, JSON.stringify([...queries.values()]));
} else {
  const calibration = JSON.parse(readFileSync(calibrationPath, 'utf8'));
  if (!Number.isFinite(calibration.referenceZ)) throw new Error('Calibration referenceZ must be finite.');
  const references = [...new Set([calibration.referenceZ, 60, 80, 100, 110])].sort((a, b) => a - b);
  const tracks = {};
  const resolvedReferences = {};
  const diagnostics = {};
  for (const reference of ['auto', ...references]) {
    const result = run(reference === 'auto' ? undefined : reference);
    resolvedReferences[reference] = result.reference ?? null;
    tracks[reference] = {};
    let totalNodes = 0;
    let missingNodes = 0;
    for (const [guid, track] of result.units) {
      tracks[reference][guid] = [];
      for (let i = 0; i < track.y.length; i++) {
        totalNodes++;
        if (!Number.isFinite(track.y[i])) missingNodes++;
        if (Number.isFinite(track.y[i])) tracks[reference][guid].push({
          timestampMs: track.ms[i], x: -track.x[i], y: track.z[i], z: track.y[i],
        });
      }
    }
    diagnostics[reference] = { totalNodes, missingNodes };
    if (reference === calibration.referenceZ && missingNodes > 0) {
      throw new Error('Reviewed calibration has unresolved nodes; refusing tracks that could bridge gaps.');
    }
    if (missingNodes > 0) console.warn(`Exploratory reference ${reference}: ${missingNodes}/${totalNodes} unresolved nodes; do not treat gaps as inferred paths.`);
  }
  writeFileSync(outputPath, JSON.stringify({ references, tracks, resolvedReferences, diagnostics }));
}
