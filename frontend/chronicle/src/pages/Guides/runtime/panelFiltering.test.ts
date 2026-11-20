import { create, toBinary } from "@bufbuild/protobuf"
import { describe, expect, it } from "vitest"
import { DamageSchema, HealSchema, UnitClassificationSchema } from "@/api/proto/chronicle_pb"
import { FastDamageCursor, FastHealCursor } from "@/api/protodecode/decode"
import { compileFilters, type PanelFilter } from "../../Instance/EventsPanels/processors/filters"
import type { ProcessorContext, ProcessorEvent } from "../../Instance/EventsPanels/processorTypes"
import { createPanelWorkerHandler } from "./panelWorker"
import type { PanelFilterMode } from "./panelFilters"
import { createGuideRuntime } from "./runtime"

function varint(value: number): number[] {
  const bytes: number[] = []
  do {
    const byte = value % 128
    value = Math.floor(value / 128)
    bytes.push(byte | (value ? 128 : 0))
  } while (value)
  return bytes
}

function frame(id: string, encoded: Uint8Array[], startMs = 1000): number[] {
  const messages = encoded.flatMap(message => [...varint(message.length), ...message])
  return [...varint(id.length), ...new TextEncoder().encode(id), ...varint(startMs), ...varint(encoded.length), ...varint(messages.length), ...messages]
}

const damage = new Uint8Array(frame("e1", [
  { caster: "0x000000000000000A", amount: 10, spellData: { id: 1, name: "Fireball" }, schools: [4] },
  { caster: "0x000000000000000B", amount: 30, spellData: { id: 2, name: "Frostbolt" }, schools: [6] },
  { caster: "0x000000000000000A", amount: 70, spellData: { id: 1, name: "Fireball" }, schools: [4, 6] },
].map((event, index) => toBinary(DamageSchema, create(DamageSchema, {
  ...event, sourceName: event.spellData.name, target: "0x000000000000000C", meta: { index, offsetMilli: BigInt(index * 100) },
})))))
const heal = new Uint8Array(frame("e1", [
  { amount: 100, overheal: 100 }, { amount: 100, overheal: 80 }, { amount: 100, overheal: 5 },
].map((event, index) => toBinary(HealSchema, create(HealSchema, {
  ...event, caster: "0x000000000000000A", target: "0x000000000000000C", meta: { index, offsetMilli: BigInt(index * 100) },
})))))

function context(filters: PanelFilter[]): ProcessorContext {
  return { players: {}, selectedEncounterIds: new Set(["e1", "e2"]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() }, filters }
}

const tally = `
  local label = CreateFrame("FontString", "out", UIParent)
  local count, total = 0, 0
  Panel:OnEvent(function(message)
    count = count + 1
    if Chronicle.Filter(message) then total = total + message.amount end
  end)
  Panel:OnComplete(function() label:SetText(count .. ":" .. total) end)
`

function run(mode: PanelFilterMode | undefined, filters: PanelFilter[], source = tally,
  stream: "damage" | "heal" = "damage", bytes: Uint8Array = damage) {
  const messages: unknown[] = []
  const handle = createPanelWorkerHandler(message => messages.push(message))
  handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": source }, streams: [stream],
    capabilities: ["ui"], filterMode: mode, filterContext: context(filters) })
  handle({ type: "streams", streams: { [stream]: bytes }, encounterIds: ["e1", "e2"] })
  handle({ type: "stop" })
  return messages
}

function text(messages: unknown[]) {
  expect(messages).not.toContainEqual(expect.objectContaining({ type: "error" }))
  return messages.flatMap(message => (message as { operations?: { op: string; props?: { text?: string } }[] }).operations ?? [])
    .filter(op => op.op === "set").map(op => op.props?.text).at(-1)
}

function nativeResult(stream: "damage" | "heal", bytes: Uint8Array, filters: PanelFilter[]) {
  const cursor = stream === "damage" ? new FastDamageCursor(bytes) : new FastHealCursor(bytes)
  const predicate = compileFilters(filters, context(filters))
  let count = 0, total = 0
  while (cursor.hasMoreInEncounter) {
    const event = cursor.next()!
    if (predicate({ ...event, type: stream } as unknown as ProcessorEvent)) { count++; total += event.amount }
  }
  return { count, total }
}

describe("Lua panel filtering", () => {
  const threshold: PanelFilter[] = [{ type: "event_value", value: ">:20" }]

  it("prefilters delivery, while manual delivers every message for selective aggregation", () => {
    expect(text(run("prefilter", threshold))).toBe("2:100")
    expect(text(run("manual", threshold))).toBe("3:100")
  })

  it.each([undefined, "none"] as const)("ignores active filters in mode %s", mode => {
    expect(text(run(mode, threshold))).toBe("3:110")
  })

  it.each(["none", "prefilter", "manual"] as const)("returns true with no filters in %s mode", mode => {
    expect(text(run(mode, []))).toBe("3:110")
  })

  it("evaluates the supplied retained message, including after replay, without mutation", () => {
    expect(text(run("manual", threshold, `
      local label = CreateFrame("FontString", "out", UIParent)
      local first, last
      Panel:OnEvent(function(message)
        if first == nil then first = message end
        last = message
        local amount, source, school = message.amount, message.source, message.schools[1]
        Chronicle.Filter(message)
        assert(message.amount == amount and message.source == source and message.schools[1] == school)
        assert(message.caster == nil and message.type == nil and message.globalOffsetMilli == nil)
        assert(not Chronicle.Filter(first))
      end)
      Panel:OnComplete(function()
        assert(not Chronicle.Filter(first))
        assert(Chronicle.Filter(last))
        label:SetText(first.amount .. ":" .. last.amount)
      end)
    `))).toBe("10:70")
  })

  const parityCases: { name: string; stream: "damage" | "heal"; bytes: Uint8Array; filter: PanelFilter; expected: { count: number; total: number } }[] = [
    { name: "source", stream: "damage", bytes: damage, filter: { type: "source_type", value: "0x000000000000000A" }, expected: { count: 2, total: 80 } },
    { name: "spell ID", stream: "damage", bytes: damage, filter: { type: "ability_id", value: "2" }, expected: { count: 1, total: 30 } },
    { name: "spell name", stream: "damage", bytes: damage, filter: { type: "ability_name", value: "fireball" }, expected: { count: 2, total: 80 } },
    { name: "multiple schools", stream: "damage", bytes: damage, filter: { type: "ability_school", value: "frost" }, expected: { count: 2, total: 100 } },
    { name: "effective healing rather than raw overheal", stream: "heal", bytes: heal, filter: { type: "event_value", value: ">:20" }, expected: { count: 1, total: 100 } },
  ]
  it.each(parityCases)("matches native $name semantics in both filtering modes", ({ stream, bytes, filter, expected }) => {
    const filters = [filter]
    expect(nativeResult(stream, bytes, filters)).toEqual(expected)
    expect(text(run("prefilter", filters, tally, stream, bytes))).toBe(`${expected.count}:${expected.total}`)
    expect(text(run("manual", filters, tally, stream, bytes))).toBe(`3:${expected.total}`)
  })

  it.each(["prefilter", "manual"] as const)("uses a shared time origin across encounters in %s mode", mode => {
    const event = (amount: number) => toBinary(DamageSchema, create(DamageSchema, {
      amount, caster: "0x000000000000000A", target: "0x000000000000000C", meta: { index: 1, offsetMilli: 100n },
    }))
    const bytes = new Uint8Array([...frame("e1", [event(10)], 1000), ...frame("e2", [event(70)], 6000)])
    expect(text(run(mode, [{ type: "time_range", value: "5000,5200" }], tally, "damage", bytes)))
      .toBe(`${mode === "prefilter" ? 1 : 2}:70`)
  })

  it("still emits progress and completes when prefilter excludes every event", () => {
    const encoded = toBinary(DamageSchema, create(DamageSchema, {
      amount: 1, caster: "0x000000000000000A", target: "0x000000000000000C",
    }))
    const bytes = new Uint8Array(frame("e1", Array.from({ length: 2000 }, () => encoded)))
    const messages = run("prefilter", threshold, tally, "damage", bytes)
    expect(text(messages)).toBe("0:0")
    expect(messages.filter(message => (message as { type: string }).type === "progress"))
      .toEqual([{ type: "progress", events: 0 }, { type: "progress", events: 0 }])
    expect(messages.at(-1)).toMatchObject({ type: "replay-complete", metrics: { events: 0 } })
  })

  it.each(["prefilter", "manual"] as const)("uses undeclared prior-encounter classification without delivering it in %s mode", mode => {
    const owner = "0x000000000000000A"
    const pet = "0xF130000000000001"
    const classified = new Uint8Array(frame("prior", [toBinary(UnitClassificationSchema, create(UnitClassificationSchema, {
      target: pet, owner, meta: { index: 1, offsetMilli: 0n },
    }))], 1000))
    const damageBytes = new Uint8Array(frame("e2", [pet, "0x000000000000000B"].map((caster, index) =>
      toBinary(DamageSchema, create(DamageSchema, {
        caster, target: "0x000000000000000C", amount: index === 0 ? 25 : 5,
        meta: { index, offsetMilli: BigInt(index * 100) },
      }))), 6000))
    const filterContext = context([{ type: "source_type", value: "selected_players" }])
    filterContext.selectedEncounterIds = new Set(["e2"])
    filterContext.entitySelection.playerIds.add(owner)
    const execute = (support: boolean) => {
      const messages: unknown[] = []
      const handle = createPanelWorkerHandler(message => messages.push(message))
      handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": tally }, streams: ["damage"],
        capabilities: ["ui"], streamScope: "selection", filterMode: mode, filterContext })
      handle({ type: "streams", encounterIds: ["e2"], streams: {
        damage: damageBytes, ...(support && { unit_classification: classified }),
      } })
      handle({ type: "stop" })
      return messages
    }
    // The earlier encounter is unselected, but its ownership update must survive.
    expect(text(execute(true))).toBe(`${mode === "prefilter" ? 1 : 2}:25`)
    expect(text(execute(false))).toBe(`${mode === "prefilter" ? 0 : 2}:0`)
  })

  it.each(["classification", "same-timestamp classification", "vehicle interval"] as const)(
    "keeps retained ownership historical without changing live state for %s", scenario => {
      const owner = "0x000000000000000A"
      const controlled = "0xF130000000000001"
      const sameTimestamp = scenario === "same-timestamp classification"
      const firstOffset = sameTimestamp ? 0 : 100
      const lastOffset = sameTimestamp ? 0 : 300
      const damageBytes = new Uint8Array(frame("e1", [
        { index: 1, offset: firstOffset, amount: 25 }, { index: 3, offset: lastOffset, amount: 5 },
      ].map(({ index, offset, amount }) => toBinary(DamageSchema, create(DamageSchema, {
        caster: controlled, target: "0x000000000000000C", amount,
        meta: { index, offsetMilli: BigInt(offset) },
      })))))
      const classificationBytes = new Uint8Array(frame("e1", [
        { index: 0, offset: 0, controller: owner },
        { index: 2, offset: sameTimestamp ? 0 : 200, controller: undefined },
      ].map(({ index, offset, controller }) => toBinary(UnitClassificationSchema, create(UnitClassificationSchema, {
        target: controlled, controller, meta: { index, offsetMilli: BigInt(offset) },
      })))))
      const filterContext = context([{ type: "source_type", value: "selected_players" }])
      filterContext.entitySelection.playerIds.add(owner)
      if (scenario === "vehicle interval") {
        filterContext.vehicleControlIntervals = [{ vehicleGuid: controlled, controllerGuid: owner,
          assignedAtMs: 1000, releasedAtMs: 1200 }]
      }
      const source = `
        local label = CreateFrame("FontString", "out", UIParent)
        local saved, current, immediate
        Panel:OnEvent(function(message)
          if saved == nil then
            saved = message
            immediate = Chronicle.Filter(message)
            assert(immediate)
          else
            current = message
            assert(not Chronicle.Filter(current))
            assert(Chronicle.Filter(saved) == immediate)
            assert(not Chronicle.Filter(current))
          end
        end)
        Panel:OnComplete(function()
          assert(not Chronicle.Filter(current))
          assert(Chronicle.Filter(saved) == immediate)
          assert(not Chronicle.Filter(current))
          label:SetText(tostring(immediate) .. ":" .. tostring(Chronicle.Filter(saved)) .. ":" .. tostring(Chronicle.Filter(current)))
        end)
      `
      const messages: unknown[] = []
      const handle = createPanelWorkerHandler(message => messages.push(message))
      handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": source }, streams: ["damage"],
        capabilities: ["ui"], filterMode: "manual", filterContext })
      handle({ type: "streams", encounterIds: ["e1"], streams: { damage: damageBytes,
        ...(scenario !== "vehicle interval" && { unit_classification: classificationBytes }),
      } })
      handle({ type: "stop" })
      expect(text(messages)).toBe("true:true:false")
    },
  )

  it.each([null, "", "invalid", 1, false, [], {}])("rejects invalid worker filterMode %j", mode => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler(message => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": "" }, streams: [],
      capabilities: [], filterMode: mode as unknown as PanelFilterMode })
    expect(messages).toEqual([{ type: "error", phase: "startup", message: "unsupported filter mode" }])
    handle({ type: "stop" })
  })

  it.each(["nil", "true", "42", '"damage"', "{}", '{ stream = "click", offsetMs = 0, encounterId = "e1", selected = true }',
    '{ stream = "damage", offsetMs = -1, encounterId = "e1", selected = true }',
    '{ stream = "damage", offsetMs = 0/0, encounterId = "e1", selected = true }',
    '{ stream = "damage", offsetMs = 0, encounterId = "e1", selected = "yes" }',
    '{ stream = "damage", offsetMs = 0, encounterId = "e1", selected = true, amount = function() end }',
  ])("rejects invalid Chronicle.Filter input %s", input => {
    const runtime = createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": `Chronicle.Filter(${input})` },
      capabilities: [], panelStreams: ["damage"] })
    try { expect(() => runtime.start()).toThrow(/filter|combat-event/i) }
    finally { runtime.stop() }
  })
})
