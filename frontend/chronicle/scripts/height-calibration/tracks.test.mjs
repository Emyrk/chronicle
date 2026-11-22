import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./tracks.mjs', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'height-tracks-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = Object.fromEntries(['fixture', 'queries', 'candidates', 'calibration', 'tracks'].map((name) => [name, join(dir, `${name}.json`)]));
  writeFileSync(paths.fixture, JSON.stringify({ guids: ['synthetic'], events: [['p', 0, 0, 0, 0, null, 2959, 0], ['p', 1000, 0, 2, 0, null, 2959, 0]] }));
  writeFileSync(paths.calibration, JSON.stringify({ referenceZ: 60 }));
  execFileSync(process.execPath, ['--experimental-strip-types', script, 'queries', paths.fixture, paths.queries]);
  return paths;
}
function solve(paths) {
  return spawnSync(process.execPath, ['--experimental-strip-types', script, 'solve', paths.fixture, paths.candidates, paths.calibration, paths.tracks], { encoding: 'utf8' });
}

test('query and solve use stepped production tracks and emit coverage diagnostics', (t) => {
  const paths = fixture(t);
  const queries = JSON.parse(readFileSync(paths.queries, 'utf8'));
  assert.equal(queries.length, 3);
  writeFileSync(paths.candidates, JSON.stringify(Object.fromEntries(queries.map(({ key }) => [key, [60, 100]]))));
  const result = solve(paths);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(readFileSync(paths.tracks, 'utf8'));
  assert.deepEqual(output.diagnostics['60'], { totalNodes: 3, missingNodes: 0 });
  assert.equal(output.tracks['60'].synthetic[0].z, 60);
  assert.equal(output.tracks['100'].synthetic[0].z, 100);
  assert.equal(output.tracks.auto.synthetic.length, 3);
});

test('uncovered reviewed-reference nodes fail instead of publishing bridged tracks', (t) => {
  const paths = fixture(t);
  const queries = JSON.parse(readFileSync(paths.queries, 'utf8'));
  writeFileSync(paths.candidates, JSON.stringify(Object.fromEntries(queries.map(({ key }) => [key, []]))));
  const result = solve(paths);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Reviewed calibration has unresolved nodes/);
});

test('invalid calibrated reference and incomplete candidate tables fail closed', (t) => {
  const paths = fixture(t);
  writeFileSync(paths.candidates, '{}');
  writeFileSync(paths.calibration, JSON.stringify({ referenceZ: null }));
  assert.match(solve(paths).stderr, /referenceZ must be finite/);
  writeFileSync(paths.calibration, JSON.stringify({ referenceZ: 60 }));
  assert.match(solve(paths).stderr, /Missing candidate query/);
});
