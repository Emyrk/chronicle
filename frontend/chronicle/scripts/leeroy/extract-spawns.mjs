/**
 * Pulls the Rookery's spawns (Upper Blackrock Spire, map 229) out of a
 * CMaNGOS classic-db full dump into the small JSON build-fixture.mjs reads.
 *
 *   curl -L -o "$WORK/spawn/classicdb.sql.gz" \
 *     https://github.com/cmangos/classic-db/raw/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz
 *   gunzip -k "$WORK/spawn/classicdb.sql.gz"
 *   node scripts/leeroy/extract-spawns.mjs "$WORK/spawn/classicdb.sql" > scripts/leeroy/rookery-spawns.json
 *
 * Only the `creature`, `creature_template`, `gameobject` and
 * `gameobject_template` INSERTs are read. The dump is treated as data: rows
 * are split by a tiny tuple parser, never evaluated.
 */
import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"

const [dumpPath] = process.argv.slice(2)
if (!dumpPath) {
  console.error("usage: node scripts/leeroy/extract-spawns.mjs <classicdb.sql>")
  process.exit(2)
}

const MAP_ID = 229
// The Rookery and the corridor the raid stands in before the charge, in world
// yards (generous; trimmed again by build-fixture.mjs).
const ROOKERY = { minX: 40, maxX: 150, minY: -345, maxY: -235 }
const CREATURES = new Set([
  10161, // Rookery Whelp
  10258, // Rookery Guardian
  10683, // Rookery Hatcher
  10264, // Solakar Flamewreath
])
// Rookery Egg (and any other gameobject template whose name says egg).
const EGG_NAME = /rookery egg/i

/** Splits `VALUES (..),(..);` into rows of raw field strings. */
function* tuples(line) {
  let i = line.indexOf("VALUES ") + 7
  while (i < line.length) {
    if (line[i] !== "(") { i++; continue }
    const fields = []
    let field = ""
    let quoted = false
    i++
    for (; i < line.length; i++) {
      const c = line[i]
      if (quoted) {
        if (c === "\\") { field += line[++i]; continue }
        if (c === "'") { quoted = false; continue }
        field += c
      } else if (c === "'") quoted = true
      else if (c === ",") { fields.push(field); field = "" }
      else if (c === ")") { fields.push(field); break }
      else field += c
    }
    yield fields
    i++
  }
}

const creatureNames = new Map()
const objectNames = new Map()
const creatures = []
const objects = []

const lines = createInterface({ input: createReadStream(dumpPath, { encoding: "utf8" }), crlfDelay: Infinity })
for await (const line of lines) {
  if (line.startsWith("INSERT INTO `creature_template` VALUES")) {
    // Entry, then Name.
    for (const f of tuples(line)) creatureNames.set(Number(f[0]), f[1])
  } else if (line.startsWith("INSERT INTO `gameobject_template` VALUES")) {
    // entry, type, displayId, name.
    for (const f of tuples(line)) objectNames.set(Number(f[0]), f[3])
  } else if (line.startsWith("INSERT INTO `creature` VALUES")) {
    // guid, id, map, spawnMask, x, y, z, orientation, ...
    for (const f of tuples(line)) if (Number(f[2]) === MAP_ID) creatures.push(f)
  } else if (line.startsWith("INSERT INTO `gameobject` VALUES")) {
    // guid, id, map, spawnMask, x, y, z, orientation, ...
    for (const f of tuples(line)) if (Number(f[2]) === MAP_ID) objects.push(f)
  }
}

const inRookery = (x, y) => x >= ROOKERY.minX && x <= ROOKERY.maxX && y >= ROOKERY.minY && y <= ROOKERY.maxY
const round = (value) => Math.round(value * 100) / 100
const spawn = (f, name) => ({ guid: Number(f[0]), entry: Number(f[1]), name, x: round(Number(f[4])), y: round(Number(f[5])), z: round(Number(f[6])), o: round(Number(f[7])) })

const out = {
  source: "cmangos/classic-db Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
  mapId: MAP_ID,
  creatures: creatures
    .filter((f) => CREATURES.has(Number(f[1])) && inRookery(Number(f[4]), Number(f[5])))
    .map((f) => spawn(f, creatureNames.get(Number(f[1])) ?? ""))
    .sort((a, b) => a.entry - b.entry || a.guid - b.guid),
  eggs: objects
    .filter((f) => EGG_NAME.test(objectNames.get(Number(f[1])) ?? "") && inRookery(Number(f[4]), Number(f[5])))
    .map((f) => spawn(f, objectNames.get(Number(f[1]))))
    .sort((a, b) => a.guid - b.guid),
}
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`)
