/**
 * Builds the Leeroy Jenkins replay fixture (a `MapFixture`, see
 * src/pages/Instance/EventsPanels/Map/fixtures/mapFixture.ts) from the frame
 * annotations and the Rookery's spawns. Deterministic: the same inputs give
 * the same bytes.
 *
 *   node scripts/leeroy/build-fixture.mjs \
 *     [scripts/leeroy/annotations.json] [scripts/leeroy/rookery-spawns.json] [outFile]
 *
 * Positions are the annotations' hand keyframes, eased between keys, with a
 * formation offset per player; whelps hatch from the real egg nearest each
 * wave and chase a player. Health, whelp swings and the fear's flee are
 * illustrative (see annotations.json `source` fields). See scripts/leeroy/README.md.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../..")
const [annotationsArg, spawnsArg, outArg] = process.argv.slice(2)
const annotations = JSON.parse(readFileSync(annotationsArg ?? resolve(here, "annotations.json"), "utf8"))
const spawns = JSON.parse(readFileSync(spawnsArg ?? resolve(here, "rookery-spawns.json"), "utf8"))
const outFile = resolve(outArg ?? resolve(root, "src/pages/Instance/EventsPanels/Map/fixtures/leeroyRookery.json"))

const MAP_ID = 229
const FLOOR_Z = 91.5
const SAMPLE_MS = 200
const ICON_BASE_URL = "https://icons.chronicleclassic.com/turtle"
const WHELP = { entry: 10161, name: "Rookery Whelp" }
const EGG = { entry: 175124, name: "Rookery Egg" }
// The Rookery (x 46..110, y -341..-233 on the map 229 mesh) and the upper
// Hall of Binding's stairs, in world yards: the placeholder floor until the
// mesh is published.
const FLOOR_BOUNDS = { minX: 40, maxX: 150, minY: -345, maxY: -230 }

const { clip, places, keyframes, whelps, deaths, fear } = annotations
const clipStartS = clip.fromVideoSeconds
const durationMs = (clip.toVideoSeconds - clipStartS) * 1000
const logStartMs = Date.parse(clip.logStart)
const ms = (videoSeconds) => Math.round((videoSeconds - clipStartS) * 1000)
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

// Seeded PRNG (mulberry32) so jitter is stable across runs.
let seed = 1543
function random() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const smooth = (t) => t * t * (3 - 2 * t)

/** A player's formation offset around a place: slot 0 is the spot itself. */
function slotOffset(slot, place) {
  if (slot === 0) return { x: 0, y: 0 }
  const spread = place === "pileIn" ? 2.2 : 1.3
  const angle = slot * 2.39996 // golden angle
  const radius = spread * Math.sqrt(slot)
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

function keyPoint([, place, slot]) {
  const base = places[place]
  if (!base) throw new Error(`unknown place ${place}`)
  const offset = slotOffset(slot, place)
  return { x: base.x + offset.x, y: base.y + offset.y, z: base.z }
}

/** Position on a keyframe track at clip time `t` (ms): eased between keys. */
function trackAt(track, t) {
  const keys = track.map((key) => ({ t: ms(key[0]), ...keyPoint(key) }))
  if (t <= keys[0].t) return keys[0]
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t <= b.t) {
      const f = b.t === a.t ? 1 : smooth((t - a.t) / (b.t - a.t))
      // Height follows the path linearly: stairs, and the drop off the terrace.
      const linear = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t)
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * linear }
    }
  }
  return keys[keys.length - 1]
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

// Player tracks; anyone without keyframes stands at the planning spot.
const tracks = new Map()
for (const [name, guid] of playerByName) {
  const track = keyframes[name]
  if (!track) throw new Error(`no keyframes for ${name}`)
  tracks.set(guid, track)
}
const deathMs = new Map(deaths.map((death) => [playerByName.get(death.name), ms(death.t)]))
const playerAt = (guid, t) => {
  const dead = deathMs.get(guid)
  return trackAt(tracks.get(guid), dead !== undefined ? Math.min(t, dead) : t)
}

const events = []
const push = (row) => events.push(row)

// --- Eggs: the real spawns on the Rookery floor, hatched by the waves. ---
const eggs = spawns.eggs
  .filter((egg) => egg.z < 100 && egg.x >= FLOOR_BOUNDS.minX && egg.x <= FLOOR_BOUNDS.maxX && egg.y >= FLOOR_BOUNDS.minY && egg.y <= FLOOR_BOUNDS.maxY)
  .map((egg, index) => ({ ...egg, guid: objectGuid(EGG.entry, index + 1), hatchMs: null }))

// --- Whelps: each wave hatches the unhatched eggs nearest its anchor. ---
const whelpList = []
const anchorAt = (near, t) => playerByName.has(near) ? playerAt(playerByName.get(near), t) : places[near]
const pileGuids = [...playerByName.values()]
for (const wave of whelps.waves) {
  const t = ms(wave.t)
  const anchor = anchorAt(wave.near, t)
  const candidates = eggs
    .filter((egg) => egg.hatchMs === null)
    .map((egg) => ({ egg, distance: Math.hypot(egg.x - anchor.x, egg.y - anchor.y) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, wave.count)
  for (const { egg } of candidates) {
    egg.hatchMs = t + Math.round(random() * 900)
    // Chase the nearest player who has arrived by then (illustrative).
    const target = pileGuids
      .map((guid) => ({ guid, at: playerAt(guid, egg.hatchMs + 1500) }))
      .sort((a, b) => Math.hypot(a.at.x - egg.x, a.at.y - egg.y) - Math.hypot(b.at.x - egg.x, b.at.y - egg.y))[0].guid
    const guid = creatureGuid(WHELP.entry, whelpList.length + 1)
    units[guid] = { name: WHELP.name, entry: WHELP.entry }
    whelpList.push({ guid, egg, target, phase: random() * Math.PI * 2, radius: 1.4 + random() * 1.4 })
  }
}

// Fear: every whelp within 10 yd of the caster runs out for 4 s, then returns.
const fearMs = ms(fear.t)
const fearCaster = playerByName.get(fear.caster)
const FEAR_MS = 4000
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
  if (t > fearMs && t < fearMs + FEAR_MS && egg.hatchMs < fearMs) {
    const caster = playerAt(fearCaster, fearMs)
    const away = Math.atan2(point.y - caster.y, point.x - caster.x)
    const f = Math.sin(((t - fearMs) / FEAR_MS) * Math.PI)
    point = { x: point.x + Math.cos(away) * 9 * f, y: point.y + Math.sin(away) * 9 * f }
  }
  return { ...point, z: FLOOR_Z }
}

// --- Position rows. ---
const positionRow = (guid, t, point, facing) => push(["p", t, g(guid), round(point.x), round(point.y), round(point.z ?? FLOOR_Z), MAP_ID, round(normalizeFacing(facing), 3)])
for (let t = 0; t <= durationMs; t += SAMPLE_MS) {
  for (const guid of playerByName.values()) {
    const dead = deathMs.get(guid)
    if (dead !== undefined && t > dead + SAMPLE_MS) continue
    const now = playerAt(guid, t)
    const next = playerAt(guid, t + SAMPLE_MS)
    const moving = Math.hypot(next.x - now.x, next.y - now.y) > 0.05
    // Standing players face the Rookery (south) until it is full of whelps.
    positionRow(guid, t, now, moving ? facingTo(now, next) : Math.PI)
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

// --- Health: observed death times; the curves between are illustrative. ---
const PLAYER_HEALTH = { WARRIOR: 5200, PALADIN: 4800, ROGUE: 3600, HUNTER: 3800, DRUID: 3700, PRIEST: 3300, MAGE: 3200, WARLOCK: 3600 }
const healthFraction = (guid, name, t) => {
  const dead = deathMs.get(guid)
  if (dead !== undefined) {
    if (t >= dead) return 0
    const drainFrom = dead - 4000
    return t < drainFrom ? 0.75 + 0.2 * Math.cos(t / 2100 + name.length) : 0.75 * (1 - (t - drainFrom) / 4000)
  }
  if (name === annotations.recorder) {
    // Observed on the player frame: full until the pile, about half at 108 s.
    if (t < ms(100)) return 1
    if (t < ms(108)) return 1 - 0.5 * ((t - ms(100)) / (ms(108) - ms(100)))
    return Math.max(0.25, 0.5 - 0.25 * ((t - ms(108)) / (durationMs - ms(108))))
  }
  return t < ms(98) ? 1 : 0.55 + 0.3 * Math.cos(t / 2700 + name.length)
}
for (let t = 0; t <= durationMs; t += 1000) {
  for (const [name, guid] of playerByName) {
    const max = PLAYER_HEALTH[players[guid].class]
    const dead = deathMs.get(guid)
    if (dead !== undefined && t > dead + 1000) continue
    push(["r", t, g(guid), Math.round(max * healthFraction(guid, name, t)), max, 0])
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

// --- Illustrative combat: whelp swings and the observed fear. ---
for (const whelp of whelpList) {
  for (let t = whelp.egg.hatchMs + 1800 + Math.round(random() * 600); t < durationMs; t += 1600 + Math.round(random() * 600)) {
    if (t > fearMs && t < fearMs + FEAR_MS && whelp.egg.hatchMs < fearMs) continue
    const dead = deathMs.get(whelp.target)
    if (dead !== undefined && t >= dead) break
    push(["d", t, g(whelp.guid), g(whelp.target), 40 + Math.round(random() * 60), 2, 2, 6603, "Auto Attack"])
  }
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
