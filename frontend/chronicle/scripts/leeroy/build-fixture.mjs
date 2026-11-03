/**
 * Builds the Leeroy Jenkins replay fixture (a `MapFixture`, see
 * src/pages/Instance/EventsPanels/Map/fixtures/mapFixture.ts). Deterministic:
 * the same inputs give the same bytes.
 *
 *   node scripts/leeroy/build-fixture.mjs [scripts/leeroy] [outFile]
 *
 * Reads, from the first directory: annotations.json (roster, clip, fear,
 * egg trigger radius, level changes), rookery-spawns.json (real eggs), ih-tracks.json (the player
 * dots tracked on Internet Historian's map, track-ih-map.py),
 * ih-map-fit.json (his map to world X/Y, fit-ih-map.py) and rookery-floor.json
 * (walkable floor heights from the mesh, floor-heights.py).
 *
 * Player positions are per Internet Historian's map (2017), fan
 * approximation: tracked, mapped to world, smoothed. Deaths are the dots he
 * draws dithered. Whelps hatch from the real egg nearest each wave and chase
 * a player. Health, whelp swings and the fear's flee are illustrative (see
 * annotations.json). See scripts/leeroy/README.md.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../..")
const [inputArg, outArg] = process.argv.slice(2)
const input = (name) => JSON.parse(readFileSync(resolve(inputArg ?? here, name), "utf8"))
const annotations = input("annotations.json")
const spawns = input("rookery-spawns.json")
const ihTracks = input("ih-tracks.json")
const ihFit = input("ih-map-fit.json")
const floor = input("rookery-floor.json")
const outFile = resolve(outArg ?? resolve(root, "src/pages/Instance/EventsPanels/Map/fixtures/leeroyRookery.json"))

const MAP_ID = 229
const FLOOR_Z = 91.5
// Levels. His map is flat, and the footage shows the fight on the egg floor,
// which the raid enters through the west door at floor level (z 91.5). The
// egg floor includes the low rubble the eggs also lie on (spawns up to z 97);
// the west ramp and the ledges above z 97.5 are another level. The one climb
// in the clip is annotated (annotations.levelChanges: Anfrony up the west
// ramp) and takes its height from the ramp. Everywhere else a player stays on
// the egg floor: a tracked point on the ramp, a ledge or a prop moves to the
// nearest egg-floor cell, its height follows the egg floor under it, and it
// changes by at most 2.5 yd/s, so nobody jumps a level mid-room.
const EGG_FLOOR_MAX = 97.5
const cellIndex = (x, y) => [Math.round((x - floor.x0) / floor.step), Math.round((y - floor.y0) / floor.step)]
const CLIMB_RATE = 2.5 / 1000 // yd per ms
/** The egg floor's height near a point: the median of the egg-floor cells around it. */
function eggFloorAt(x, y) {
  const [i0, j0] = cellIndex(x, y)
  for (const r of [1, 2]) {
    const zs = []
    for (let i = i0 - r; i <= i0 + r; i++) {
      for (let j = j0 - r; j <= j0 + r; j++) {
        const z = floor.heights[i]?.[j]
        if (z != null && z <= EGG_FLOOR_MAX) zs.push(z)
      }
    }
    if (zs.length > 0) return zs.sort((p, q) => p - q)[Math.floor(zs.length / 2)]
  }
  return FLOOR_Z
}
function floorAt(x, y) {
  const [i0, j0] = cellIndex(x, y)
  // The median of the walkable cells around it (3x3, widening to 5x5 near
  // walls): broad slopes count, a lone prop under one cell does not.
  for (const r of [1, 2]) {
    const zs = []
    for (let i = i0 - r; i <= i0 + r; i++) {
      for (let j = j0 - r; j <= j0 + r; j++) {
        const z = floor.heights[i]?.[j]
        if (z != null) zs.push(z)
      }
    }
    if (zs.length > 0) return zs.sort((p, q) => p - q)[Math.floor(zs.length / 2)]
  }
  return FLOOR_Z
}
const moved = { count: 0, total: 0, max: 0 }
/** The point, or the nearest egg-floor cell centre when it stands on anything else. */
function toEggFloor(point, stats = null) {
  const [i0, j0] = cellIndex(point.x, point.y)
  const here = floor.heights[i0]?.[j0]
  if (here != null && here <= EGG_FLOOR_MAX) return point
  let best = null
  for (let r = 1; r <= 5 && !best; r++) {
    for (let i = i0 - r; i <= i0 + r; i++) {
      for (let j = j0 - r; j <= j0 + r; j++) {
        const z = floor.heights[i]?.[j]
        if (z == null || z > EGG_FLOOR_MAX) continue
        const cell = { x: floor.x0 + i * floor.step, y: floor.y0 + j * floor.step }
        const d = Math.hypot(cell.x - point.x, cell.y - point.y)
        if (!best || d < best.d) best = { ...cell, d }
      }
    }
  }
  if (!best) return point
  if (stats) {
    stats.count++
    stats.total += best.d
    stats.max = Math.max(stats.max, best.d)
  }
  return { x: best.x, y: best.y }
}
const SAMPLE_MS = 200
const ICON_BASE_URL = "https://icons.chronicleclassic.com/turtle"
const WHELP = { entry: 10161, name: "Rookery Whelp" }
const EGG = { entry: 175124, name: "Rookery Egg" }
// The Rookery (x 46..110, y -341..-233 on the map 229 mesh) and the Hall of
// Binding behind its west door, in world yards: the placeholder floor until
// the mesh is published.
const FLOOR_BOUNDS = { minX: 40, maxX: 135, minY: -345, maxY: -230 }
// The west door between the Hall of Binding and the Rookery (mesh: a gap in
// the north wall at x 109..112, y -262..-254), and where players wait in the
// hall before his map shows them.
const DOOR = { x: 111, minY: -260, maxY: -256 } // walk-through band, inside the gap
const HALL = { x: 121, y: -258 }

const { clip, whelps, fear } = annotations
const clipStartS = clip.fromVideoSeconds
const durationMs = (clip.toVideoSeconds - clipStartS) * 1000
const logStartMs = Date.parse(clip.logStart)
const ms = (videoSeconds) => Math.round((videoSeconds - clipStartS) * 1000)
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))

// Seeded PRNG (mulberry32) so jitter is stable across runs.
let seed = 1543
function random() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const facingTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x)
const normalizeFacing = (angle) => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

// --- Units and GUIDs (vanilla format, entry in the creature GUID). ---
const guids = []
const guidIndex = new Map()
const g = (guid) => {
  if (!guidIndex.has(guid)) {
    guidIndex.set(guid, guids.length)
    guids.push(guid)
  }
  return guidIndex.get(guid)
}
const hex = (value, width) => value.toString(16).toUpperCase().padStart(width, "0")
const playerGuid = (index) => `0x0000000000${hex(0x0a0001 + index, 6)}`
const creatureGuid = (entry, low) => `0xF130${hex(entry, 6)}${hex(low, 6)}`
const objectGuid = (entry, low) => `0xF110${hex(entry, 6)}${hex(low, 6)}`

const players = {}
const playerByName = new Map()
annotations.roster.forEach((member, index) => {
  const guid = playerGuid(index)
  players[guid] = { name: member.name, class: member.class }
  playerByName.set(member.name, guid)
})
const units = {}

// --- Player tracks from Internet Historian's map. ---
// His clock: original video second = map second + offset (sync-ih-inset.py).
const { offsetSeconds } = annotations.ihSync
const [[a00, a01], [a10, a11], [b0, b1]] = ihFit.affine
const toWorld = (px, py) => ({ x: px * a00 + py * a10 + b0, y: px * a01 + py * a11 + b1 })
// His door notch sits ~10 yd west of the real gap: walk players through the gap.
function throughDoor(point) {
  const w = clamp((point.x - (DOOR.x - 5)) / 4, 0, 1)
  return { x: point.x, y: point.y + w * (clamp(point.y, DOOR.minY, DOOR.maxY) - point.y) }
}

// A dot he draws dithered from some moment on, and never solid again, is a
// death (85% of later samples dithered tolerates the odd missed frame).
const ihDeaths = new Map()
for (const name of playerByName.keys()) {
  const flags = ihTracks.samples.map((sample) => sample.dithered.includes(name))
  const index = flags.findIndex((flag, i) => flag && flags.slice(i).filter(Boolean).length / (flags.length - i) >= 0.85)
  if (index >= 0) ihDeaths.set(name, ihTracks.samples[index].t + offsetSeconds)
}

/** Tracked, smoothed positions on SAMPLE_MS steps of clip time, or null before his map shows the player. */
function ihTrack(name, slot) {
  const raw = ihTracks.samples
    .filter((sample) => sample.dots[name])
    .map((sample) => ({ t: ms(sample.t + offsetSeconds), ...toWorld(sample.dots[name][0], sample.dots[name][1]) }))
  // Centred moving average over +-2 samples (0.8 s) against tracking jitter.
  const smoothed = raw.map((point, i) => {
    const near = raw.slice(Math.max(0, i - 2), i + 3).filter((other) => Math.abs(other.t - point.t) <= 2 * 1000 / ihTracks.fps + 1)
    return { t: point.t, x: near.reduce((sum, p) => sum + p.x, 0) / near.length, y: near.reduce((sum, p) => sum + p.y, 0) / near.length }
  }).map((point) => ({ ...point, ...throughDoor(point) }))
  // Before his map shows them, players wait in the hall and walk in through the door.
  const first = smoothed[0]
  const offset = { x: (slot % 3) * 1.6, y: (Math.floor(slot / 3) - 2) * 1.6 }
  const keys = [
    { t: 0, x: HALL.x + offset.x, y: HALL.y + offset.y },
    { t: Math.max(1, first.t - 1600), x: HALL.x + offset.x, y: HALL.y + offset.y },
    { t: Math.max(2, first.t - 600), x: DOOR.x + 1, y: (DOOR.minY + DOOR.maxY) / 2 + offset.y / 3 },
    ...smoothed,
  ]
  return (t) => {
    if (t <= keys[0].t) return { x: keys[0].x, y: keys[0].y }
    for (let i = 0; i < keys.length - 1; i++) {
      const from = keys[i]
      const to = keys[i + 1]
      if (t <= to.t) {
        const f = to.t === from.t ? 1 : (t - from.t) / (to.t - from.t)
        return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }
      }
    }
    const last = keys[keys.length - 1]
    return { x: last.x, y: last.y }
  }
}

const tracks = new Map()
let slot = 0
for (const [name, guid] of playerByName) tracks.set(guid, ihTrack(name, slot++))
const deathMs = new Map([...ihDeaths].map(([name, seconds]) => [playerByName.get(name), ms(seconds)]))
// Annotated climbs: [from, to] clip ms per player, on the surface under them.
const climbs = new Map()
for (const change of annotations.levelChanges ?? []) {
  const guid = playerByName.get(change.name)
  climbs.set(guid, [...(climbs.get(guid) ?? []), [ms(change.from), ms(change.to)]])
}
const climbing = (guid, t) => (climbs.get(guid) ?? []).some(([from, to]) => t >= from && t <= to)
const placeCache = new Map()
function playerAt(guid, t) {
  const dead = deathMs.get(guid)
  const at = dead !== undefined ? Math.min(t, dead) : t
  const key = `${guid}@${at}`
  let placed = placeCache.get(key)
  if (!placed) {
    const point = tracks.get(guid)(at)
    placed = climbing(guid, at)
      ? { ...point, z: floorAt(point.x, point.y), climbing: true }
      : (() => {
        const onFloor = toEggFloor(point, at % SAMPLE_MS === 0 ? moved : null)
        return { ...onFloor, z: eggFloorAt(onFloor.x, onFloor.y) }
      })()
    placeCache.set(key, placed)
  }
  return placed
}

const events = []
const push = (row) => events.push(row)

// --- Eggs: the real spawns on the Rookery floor. ---
const eggs = spawns.eggs
  .filter((egg) => egg.z < 100 && egg.x >= FLOOR_BOUNDS.minX && egg.x <= FLOOR_BOUNDS.maxX && egg.y >= FLOOR_BOUNDS.minY && egg.y <= FLOOR_BOUNDS.maxY)
  .map((egg, index) => ({ ...egg, guid: objectGuid(EGG.entry, index + 1), hatchMs: null }))

// --- Whelps: an egg hatches the moment a living player on the egg floor
// comes within its trigger radius, and its whelp attacks that player. ---
// The real trigger radius, plus his map's placement error (the pillar fit's
// RMS): with the bare radius a tracked player who really walked over an egg
// misses it about as often as not.
const HATCH_RADIUS = whelps.trigger.radiusYards + Number(process.env.LEEROY_HATCH_MARGIN ?? whelps.trigger.placementMarginYards)
const whelpList = []
const pileGuids = [...playerByName.values()]
for (let t = 0; t <= durationMs; t += SAMPLE_MS) {
  for (const guid of pileGuids) {
    if (deathMs.get(guid) <= t) continue
    const at = playerAt(guid, t)
    if (at.climbing) continue
    for (const egg of eggs) {
      if (egg.hatchMs !== null || Math.hypot(egg.x - at.x, egg.y - at.y) > HATCH_RADIUS) continue
      egg.hatchMs = t
      const whelpGuid = creatureGuid(WHELP.entry, whelpList.length + 1)
      units[whelpGuid] = { name: WHELP.name, entry: WHELP.entry }
      whelpList.push({ guid: whelpGuid, egg, target: guid, phase: random() * Math.PI * 2, radius: 1.4 + random() * 1.4 })
    }
  }
}

// Fear: every whelp within 10 yd of the caster runs out for 4 s, then returns.
const fearMs = ms(fear.t)
const fearCaster = playerByName.get(fear.caster)
const FEAR_MS = 4000
const FEAR_RADIUS = 10 // Intimidating Shout's radius
const WHELP_SPEED = 7 / 1000 // yd per ms

function whelpAt(whelp, t) {
  const { egg } = whelp
  if (t <= whelp.egg.hatchMs) return { x: egg.x, y: egg.y, z: egg.z }
  let target = playerAt(whelp.target, t)
  // Retarget once the chased player is dead: the nearest living player.
  const dead = deathMs.get(whelp.target)
  if (dead !== undefined && t > dead) {
    const living = pileGuids.filter((guid) => !(deathMs.get(guid) <= t))
    target = playerAt(living.sort((a, b) => Math.hypot(playerAt(a, t).x - target.x, playerAt(a, t).y - target.y) - Math.hypot(playerAt(b, t).x - target.x, playerAt(b, t).y - target.y))[0], t)
  }
  const orbit = whelp.phase + t / 1400
  const goal = { x: target.x + Math.cos(orbit) * whelp.radius, y: target.y + Math.sin(orbit) * whelp.radius }
  const travelled = (t - egg.hatchMs) * WHELP_SPEED
  const span = Math.hypot(goal.x - egg.x, goal.y - egg.y)
  let point = travelled >= span ? goal : { x: egg.x + ((goal.x - egg.x) * travelled) / span, y: egg.y + ((goal.y - egg.y) * travelled) / span }
  const caster = playerAt(fearCaster, fearMs)
  if (t > fearMs && t < fearMs + FEAR_MS && egg.hatchMs < fearMs && Math.hypot(whelpAt(whelp, fearMs).x - caster.x, whelpAt(whelp, fearMs).y - caster.y) <= FEAR_RADIUS) {
    const away = Math.atan2(point.y - caster.y, point.x - caster.x)
    const f = Math.sin(((t - fearMs) / FEAR_MS) * Math.PI)
    point = { x: point.x + Math.cos(away) * 9 * f, y: point.y + Math.sin(away) * 9 * f }
  }
  const onFloor = toEggFloor(point)
  return { ...onFloor, z: eggFloorAt(onFloor.x, onFloor.y) }
}

// --- Position rows. ---
const positionRow = (guid, t, point, facing) => push(["p", t, g(guid), round(point.x), round(point.y), round(point.z ?? FLOOR_Z), MAP_ID, round(normalizeFacing(facing), 3)])
const lastFacing = new Map()
const lastZ = new Map()
for (let t = 0; t <= durationMs; t += SAMPLE_MS) {
  for (const guid of playerByName.values()) {
    const dead = deathMs.get(guid)
    if (dead !== undefined && t > dead + SAMPLE_MS) continue
    const now = playerAt(guid, t)
    const next = playerAt(guid, t + SAMPLE_MS)
    const moving = Math.hypot(next.x - now.x, next.y - now.y) > 0.05
    // Players face where they walk; standing, they keep their last heading.
    const heading = moving ? facingTo(now, next) : lastFacing.get(guid) ?? Math.PI
    lastFacing.set(guid, heading)
    // Height is continuous: it follows the floor at no more than CLIMB_RATE.
    const previous = lastZ.get(guid)
    const z = previous === undefined ? now.z : previous + Math.max(-CLIMB_RATE * SAMPLE_MS, Math.min(CLIMB_RATE * SAMPLE_MS, now.z - previous))
    lastZ.set(guid, z)
    positionRow(guid, t, { ...now, z }, heading)
  }
  for (const egg of eggs) {
    // An unhatched egg's single sample at the pull keeps it on the floor.
    if (t === 0 && egg.hatchMs === null) positionRow(egg.guid, t, egg, egg.o)
  }
  for (const whelp of whelpList) {
    // A hatching egg is its whelp: it sits on the egg's spot until it hatches
    // (no egg corpse is left behind), then chases its player.
    if (t < whelp.egg.hatchMs && t > 0) continue
    const now = whelpAt(whelp, t)
    positionRow(whelp.guid, t, now, facingTo(now, playerAt(whelp.target, t)))
  }
}

// --- Illustrative combat: each whelp swings at whoever hatched it (or, once
// they are dead, the nearest living player). ---
const swings = []
for (const whelp of whelpList) {
  for (let t = whelp.egg.hatchMs + 1200 + Math.round(random() * 600); t < durationMs; t += 1600 + Math.round(random() * 600)) {
    if (t > fearMs && t < fearMs + FEAR_MS && whelp.egg.hatchMs < fearMs) continue
    const near = whelpAt(whelp, t)
    const living = pileGuids.filter((guid) => !(deathMs.get(guid) <= t))
    if (living.length === 0) break
    const target = !(deathMs.get(whelp.target) <= t) ? whelp.target
      : living.sort((a, b) => Math.hypot(playerAt(a, t).x - near.x, playerAt(a, t).y - near.y) - Math.hypot(playerAt(b, t).x - near.x, playerAt(b, t).y - near.y))[0]
    const at = playerAt(target, t)
    // Only once it has reached its target.
    if (Math.hypot(at.x - near.x, at.y - near.y) > 4) continue
    const amount = 90 + Math.round(random() * 70)
    swings.push({ t, whelp: whelp.guid, target, amount })
    push(["d", t, g(whelp.guid), g(target), amount, 2, 2, 6603, "Auto Attack"])
  }
}

// --- Health: follows the swings (damage over the last 8 s, as if healers
// top players up over that long; illustrative), and his death times. ---
const PLAYER_HEALTH = { WARRIOR: 5200, PALADIN: 4800, ROGUE: 3600, HUNTER: 3800, DRUID: 3700, PRIEST: 3300, MAGE: 3200, WARLOCK: 3600 }
const HEAL_WINDOW_MS = 8000
const swingsOn = new Map()
for (const swing of swings) swingsOn.set(swing.target, [...(swingsOn.get(swing.target) ?? []), swing])
for (let t = 0; t <= durationMs; t += 1000) {
  for (const guid of playerByName.values()) {
    const max = PLAYER_HEALTH[players[guid].class]
    const dead = deathMs.get(guid)
    if (dead !== undefined && t > dead + 1000) continue
    const recent = (swingsOn.get(guid) ?? []).filter((swing) => swing.t <= t && swing.t > t - HEAL_WINDOW_MS).reduce((sum, swing) => sum + swing.amount, 0)
    let fraction = Math.max(0.12, 1 - recent / max)
    if (dead !== undefined) fraction = t >= dead ? 0 : Math.min(fraction, Math.max(0, (dead - t) / 4000))
    push(["r", t, g(guid), Math.round(max * fraction), max, 0])
  }
}
for (const [guid, t] of deathMs) {
  push(["r", t, g(guid), 0, PLAYER_HEALTH[players[guid].class], 0])
  const killer = whelpList.find((whelp) => whelp.target === guid) ?? whelpList[0]
  push(["k", t, g(killer.guid), g(guid)])
}

for (const egg of eggs) if (egg.hatchMs === null) units[egg.guid] = { name: EGG.name, entry: EGG.entry }
// Whelps show a health bar from the moment they hatch; eggs never do.
const WHELP_HEALTH = 1650
for (const whelp of whelpList) {
  for (let t = whelp.egg.hatchMs; t <= durationMs; t += 2000) push(["r", t, g(whelp.guid), WHELP_HEALTH, WHELP_HEALTH, 0])
}

push(["g", fearMs, g(fearCaster), g(fearCaster), 0, fear.spellId, fear.spellName])

// Stream-index order is time order here.
const STREAM_ORDER = { p: 0, r: 1, d: 2, h: 3, s: 4, g: 5, i: 6, k: 7, z: 8 }
events.sort((a, b) => a[1] - b[1] || STREAM_ORDER[a[0]] - STREAM_ORDER[b[0]])

const startTime = new Date(logStartMs).toISOString()
const endTime = new Date(logStartMs + durationMs).toISOString()
const fixture = {
  source: { host: `https://www.youtube.com/watch?v=${annotations.video.youtubeId}`, instanceId: "leeroy-jenkins", encounterId: "leeroy-rookery" },
  instance: { name: "Blackrock Spire", iconBaseUrl: ICON_BASE_URL, capabilities: ["unit-position", "unit-resources"] },
  encounter: {
    id: "leeroy-rookery",
    name: "The Rookery",
    boss: false,
    mapId: MAP_ID,
    killType: "wipe",
    startTime,
    endTime,
    enemies: [],
  },
  firstTimestamp: startTime,
  manifest: {
    format: "chronicle-wow-map-art-v1",
    target: { product: "wow_classic_beta", build: "", region: "us", locale: "enUS" },
    maps: [],
    instances: [{
      mapID: MAP_ID,
      name: "Blackrock Spire",
      instanceType: 1,
      directory: "blackrockspire",
      // Placeholder until map 229's mesh is published: the mesh-only path
      // makes the ground this extent (the Rookery and the stairs above it),
      // flat. The story never loads this path; it swaps in the published
      // mesh entry from the live manifest when there is one.
      floors: [],
      mesh: {
        path: "3d/229-placeholder-unpublished.glb",
        bounds: FLOOR_BOUNDS,
        zMin: FLOOR_Z,
        zMax: 120,
        frame: "wow-yup-mirrored-x",
      },
    }],
  },
  players,
  units,
  guids,
  events,
}
writeFileSync(outFile, `${JSON.stringify(fixture)}\n`)
console.error(`${outFile}: ${Object.keys(players).length} players, ${eggs.length} eggs (${eggs.filter((egg) => egg.hatchMs !== null).length} hatched), ${whelpList.length} whelps, ${events.length} rows`)
console.error(`moved onto the egg floor: ${moved.count} player samples, mean ${(moved.total / Math.max(1, moved.count)).toFixed(2)} yd, max ${moved.max.toFixed(2)} yd`)
const firstRaid = Math.min(...pileGuids.filter((guid) => players[guid].name !== "Leeroy").map((guid) => Math.min(...whelpList.filter((w) => w.target === guid).map((w) => w.egg.hatchMs), Infinity)))
const leeroy = playerByName.get("Leeroy")
console.error(`whelps hatched by Leeroy before anyone else hatches one: ${whelpList.filter((w) => w.target === leeroy && w.egg.hatchMs < firstRaid).length}; Leeroy hit ${swings.filter((sw) => sw.target === leeroy && sw.t < firstRaid).length} times by then (first raid hatch at video ${(clipStartS + firstRaid / 1000).toFixed(1)} s)`)
for (const v of [90, 93, 95, 97, 99, 101, 103, 105, 108, 112, 120, 130, 150, 170]) console.error(`  by ${v} s: ${whelpList.filter((w) => w.egg.hatchMs <= ms(v)).length} whelps hatched`)
