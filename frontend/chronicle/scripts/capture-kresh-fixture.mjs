/**
 * Captures one encounter's Map-panel event streams into a compact JSON
 * fixture for the Replay Map stories (no backend needed at render time).
 *
 *   HOST=https://forever.chronicleclassic.com \
 *     node scripts/capture-kresh-fixture.mjs <instanceId> <encounterId> [outFile]
 *
 * The streams are decoded with the app's own cursors (src/api/protodecode),
 * loaded through Vite so the `@/` alias resolves. See scripts/README.md.
 */
import { gunzipSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const [instanceId, encounterId, outArg] = process.argv.slice(2)
const host = (process.env.HOST ?? "").replace(/\/$/, "")
if (!host || !instanceId || !encounterId) {
  console.error("usage: HOST=https://... node scripts/capture-kresh-fixture.mjs <instanceId> <encounterId> [outFile]")
  process.exit(2)
}
const outFile = resolve(outArg ?? resolve(root, "src/pages/Instance/EventsPanels/Map/fixtures/kreshReal.json"))

// The API only answers browser requests from its own origin (the dev proxy
// fakes the same headers).
const headers = { Origin: host, Referer: `${host}/`, "Sec-Fetch-Site": "same-origin" }

async function get(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${await response.text()}`)
  return response
}

// Stream code -> [stream type, cursor class, row builder]. Rows keep only the
// fields map.processor.ts reads; `g` maps a GUID to its index in `guids`.
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits
const STREAMS = [
  ["p", "unit_position", "FastUnitPositionCursor", (e, g) => [g(e.unit), round(e.x, 2), round(e.y, 2), e.mapId, round(e.facing, 3)]],
  ["r", "unit_resources", "FastUnitResourcesCursor", (e, g) => [g(e.unit), e.currentHealth, e.maximumHealth, e.absorb, e.currentPower, e.maximumPower, e.powerType]],
  ["d", "damage", "FastDamageCursor", (e, g) => [g(e.caster), g(e.target), e.amount, e.hitType, e.schools[0] ?? 0, e.spellId, e.sourceName]],
  ["h", "heal", "FastHealCursor", (e, g) => [g(e.caster), g(e.target), e.amount, e.hitType, e.schools[0] ?? 0, e.spellId, e.sourceName]],
  ["s", "spell_start", "FastSpellStartCursor", (e, g) => [g(e.caster), g(e.target), e.castTimeMilli, e.spell.id, e.spell.name]],
  ["g", "spell_go", "FastSpellGoCursor", (e, g) => [g(e.caster), g(e.target), e.numHits, e.spell.id, e.spell.name]],
  ["i", "interrupt", "FastInterruptCursor", (e, g) => [g(e.caster), g(e.target)]],
  ["k", "slain", "FastSlainCursor", (e, g) => [g(e.caster), g(e.target)]],
  ["z", "ressurection", "FastResurrectionCursor", (e, g) => [g(e.source), g(e.target)]],
]

const vite = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  resolve: { alias: { "@": resolve(root, "src") } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
})
try {
  const decode = await vite.ssrLoadModule("/src/api/protodecode/decode.ts")

  const api = await (await get(`${host}/api/v1/raidlogs/instances/${instanceId}`)).json()
  const encounter = api.encounters?.find((candidate) => candidate.id === encounterId)
  if (!encounter) throw new Error(`encounter ${encounterId} not found in instance ${instanceId}`)

  const guids = []
  const guidIndex = new Map()
  const g = (guid) => {
    let index = guidIndex.get(guid)
    if (index === undefined) {
      index = guids.length
      guids.push(guid)
      guidIndex.set(guid, index)
    }
    return index
  }

  const rows = []
  let firstTimestamp = null
  for (const [code, type, cursorName, build] of STREAMS) {
    const response = await get(`${host}/api/v1/raidlogs/instances/${instanceId}/events/${type}`).catch((error) => {
      if (String(error.message).includes("HTTP 404")) return null
      throw error
    })
    if (!response) continue
    let data = new Uint8Array(await response.arrayBuffer())
    if (data[0] === 0x1f && data[1] === 0x8b) data = new Uint8Array(gunzipSync(data))
    const cursor = new decode[cursorName](data)
    let count = 0
    while (cursor.currentHeader) {
      if (cursor.currentHeader.encounterID === encounterId) {
        const start = cursor.currentHeader.firstTimestamp.toISOString()
        if (firstTimestamp && firstTimestamp !== start) throw new Error(`${type}: encounter start ${start} differs from ${firstTimestamp}`)
        firstTimestamp = start
        while (cursor.hasMoreInEncounter) {
          const event = cursor.next()
          if (!event) break
          rows.push({ index: event.index, row: [code, event.offsetMilli, ...build(event, g)] })
          count++
        }
      }
      cursor.nextEncounter()
    }
    console.error(`${type}: ${count} events`)
  }
  if (!firstTimestamp) throw new Error("no events for this encounter")
  // The panel pipeline interleaves streams by event index within an encounter.
  rows.sort((a, b) => a.index - b.index)

  // Keep only the names the Map needs: display name + class for players,
  // name/entry/owner for the other units in this encounter.
  const players = {}
  const units = {}
  const ownerBySummon = new Map(Object.entries(api.summons_by_owner ?? {})
    .flatMap(([owner, summons]) => summons.map((summon) => [summon, owner])))
  for (const guid of guids) {
    const player = api.players?.[guid]
    if (player) players[guid] = { name: player.name, class: player.class }
    const unit = api.units?.[guid]
    if (!unit) continue
    // Like resolveInstanceUnits: names may come by entry, owners by summoner.
    const name = unit.name ?? api.names_by_entry?.[unit.entry] ?? guid
    const owner = unit.owner?.toString() ?? ownerBySummon.get(guid)
    units[guid] = { name, entry: unit.entry, ...(owner ? { owner } : {}) }
  }

  // Some encounters come back without a hostile list. Fall back to the
  // hostile units in the events, flagging the one named after the encounter
  // as its boss.
  const hostiles = encounter.hostiles?.length
    ? encounter.hostiles.map((hostile) => ({ id: String(hostile.id), boss: Boolean(hostile.boss) }))
    : guids.filter((guid) => !players[guid] && units[guid] && !units[guid].owner)
      .map((guid) => ({ id: guid, boss: units[guid].name === encounter.name }))
  const enemies = hostiles.map((hostile) => ({ ...hostile, name: units[hostile.id]?.name ?? hostile.id }))

  // Artwork manifest entry for this map, so the story needs no manifest fetch.
  const manifest = await (await get(`${api.icon_base_url.replace(/\/$/, "")}/maps/manifest.json`)).json()
  const mapInstance = manifest.instances?.find((candidate) => candidate.mapID === encounter.map_id)
  if (!mapInstance) throw new Error(`no artwork for map ${encounter.map_id}`)

  const fixture = {
    source: { host, instanceId, encounterId },
    instance: { name: api.name, iconBaseUrl: api.icon_base_url, capabilities: api.capabilities ?? [] },
    encounter: {
      id: encounter.id,
      name: encounter.name,
      boss: encounter.boss,
      mapId: encounter.map_id,
      killType: encounter.kill_type,
      startTime: encounter.start_time,
      endTime: encounter.end_time,
      enemies,
    },
    firstTimestamp,
    manifest: { format: manifest.format, target: manifest.target, maps: [], instances: [mapInstance] },
    players,
    units,
    guids,
    events: rows.map(({ row }) => row),
  }
  mkdirSync(dirname(outFile), { recursive: true })
  const json = JSON.stringify(fixture)
  writeFileSync(outFile, `${json}\n`)
  console.error(`wrote ${outFile}: ${rows.length} events, ${guids.length} units, ${(json.length / 1024).toFixed(1)} KB`)
} finally {
  await vite.close()
}
