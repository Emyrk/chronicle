import { describe, expect, it } from "vitest";
import {
  CastAction, CastSchema, DamageSchema, HealSchema, InterruptSchema,
  ResourceChangeSchema, ResurrectionSchema, SlainSchema, SpellGoSchema,
  SpellStartSchema, UnitPositionSchema, UnitResourcesSchema,
} from "@/api/proto/chronicle_pb";
import { createStreamCursor, decodeAllPayloads, parseAllHeaders } from "@/api/protodecode/decode";
import { leeroyRookery } from "../EventsPanels/Map/fixtures/leeroyRookery";
import type { MapFixture } from "../EventsPanels/Map/fixtures/mapFixture";
import { buildLeeroyStreams } from "./leeroyStreams";

const fixture = {
  encounter: { id: "rookery-test" },
  firstTimestamp: "2026-01-02T03:04:05.000Z",
  guids: ["caster", "target"],
  events: [
    ["p", 0, 0, 10.5, -2, 91.5, 229, 1.25],
    ["r", 1, 1, 1234, 2000, 40, 5, 30, "MANA"],
    ["d", 2, 0, 1, 100, 2, 1, 42, "Fire"],
    ["h", 3, 1, 0, 70, 1, 2, 43, "Heal"],
    ["s", 4, 0, 1, 1500, 44, "Bolt"],
    ["g", 5, 0, 1, 2, 44, "Bolt"],
    ["i", 6, 1, 0],
    ["k", 7, 0, 1],
    ["z", 8, 1, 0],
    ["p", 9, 1, 20, 30, 229, null], // legacy position without z
    ["m", 10, 1, -55, "loss", "Arcane Explosion", "Mana"],
    ["m", 11, 0, 12, "Gain", "Rage gained", "Rage"],
  ],
} as unknown as MapFixture;

describe("buildLeeroyStreams", () => {
  it("feeds the real Leeroy fixture through production stream cursors", () => {
    const streams = buildLeeroyStreams(leeroyRookery);
    const cases = [
      ["unit_position", "p", UnitPositionSchema, "unit", 2],
      ["unit_resources", "r", UnitResourcesSchema, "unit", 2],
      ["damage", "d", DamageSchema, "caster", 2],
      ["slain", "k", SlainSchema, "target", 3],
      ["spell_go", "g", SpellGoSchema, "caster", 2],
    ] as const;
    for (const [type, code, schema, field, guidColumn] of cases) {
      const count = leeroyRookery.events.filter((row) => row[0] === code).length;
      expect(count).toBeGreaterThan(0);
      const cached = streams.get(type)!;
      const cursor = createStreamCursor(schema, cached.data);
      expect(cursor.currentHeader).toEqual(cached.headers[0]);
      expect(cursor.currentHeader?.encounterID).toBe(leeroyRookery.encounter.id);
      expect(cursor.currentHeader?.count).toBe(count);
      let seen = 0;
      leeroyRookery.events.forEach((row, index) => {
        if (row[0] !== code) return;
        const event = cursor.peek();
        expect(event?.index).toBe(index);
        expect(event?.message).toMatchObject({
          meta: { index, offsetMilli: BigInt(row[1] as number) },
          [field]: leeroyRookery.guids[row[guidColumn] as number],
        });
        cursor.advance();
        seen++;
      });
      expect(seen).toBe(count);
      expect(cursor.hasMoreInEncounter).toBe(false);
      expect(cursor.nextEncounter()).toBe(false);
      expect(cursor.bytesProcessed).toBe(cached.data.length);
    }
  });

  it("writes production headers and preserves fixture-wide indexes across all eleven streams", () => {
    const streams = buildLeeroyStreams(fixture);
    expect(streams.size).toBe(11);

    const cases = [
      ["unit_position", UnitPositionSchema, [0, 9]],
      ["unit_resources", UnitResourcesSchema, [1]],
      ["damage", DamageSchema, [2]],
      ["heal", HealSchema, [3]],
      ["spell_start", SpellStartSchema, [4]],
      ["spell_go", SpellGoSchema, [5]],
      ["interrupt", InterruptSchema, [6]],
      ["slain", SlainSchema, [7]],
      ["ressurection", ResurrectionSchema, [8]],
      ["cast", CastSchema, [4, 5]],
      ["resource_change", ResourceChangeSchema, [10, 11]],
    ] as const;
    for (const [type, schema, indexes] of cases) {
      const cached = streams.get(type)!;
      const [{ header, messages }] = decodeAllPayloads(schema, cached.data);
      expect(parseAllHeaders(cached.data)).toEqual(cached.headers);
      expect(header).toEqual(cached.headers[0]);
      expect(header.encounterID).toBe("rookery-test");
      expect(header.firstTimestamp.toISOString()).toBe(fixture.firstTimestamp);
      expect(header.count).toBe(indexes.length);
      expect(messages.map((message) => message.meta?.index)).toEqual(indexes);
      expect(messages.map((message) => message.meta?.offsetMilli)).toEqual(indexes.map(BigInt));
    }

    const casts = decodeAllPayloads(CastSchema, streams.get("cast")!.data)[0].messages;
    expect(casts.map(({ action }) => action)).toEqual([CastAction.ActionBeginsToCast, CastAction.ActionCasts]);
    expect(casts.map(({ caster, target, spell }) => ({ caster, target, id: spell?.id, name: spell?.name })))
      .toEqual([
        { caster: "caster", target: "target", id: 44, name: "Bolt" },
        { caster: "caster", target: "target", id: 44, name: "Bolt" },
      ]);
    const changes = decodeAllPayloads(ResourceChangeSchema, streams.get("resource_change")!.data)[0].messages;
    expect(changes.map(({ target, amount, direction, sourceName, resourceType }) => ({ target, amount, direction, sourceName, resourceType })))
      .toEqual([
        { target: "target", amount: 55, direction: "Loss", sourceName: "Arcane Explosion", resourceType: "Mana" },
        { target: "caster", amount: 12, direction: "Gain", sourceName: "Rage gained", resourceType: "Rage" },
      ]);

    const positions = decodeAllPayloads(UnitPositionSchema, streams.get("unit_position")!.data)[0].messages;
    expect(positions[0]).toMatchObject({ unit: "caster", x: 10.5, y: -2, z: 91.5, mapId: 229, facing: 1.25 });
    expect(positions[1]).toMatchObject({ unit: "target", x: 20, y: 30, mapId: 229 });
    expect(positions[1].z).toBeUndefined();
    expect(positions[1].facing).toBeUndefined();
    expect(decodeAllPayloads(UnitResourcesSchema, streams.get("unit_resources")!.data)[0].messages[0])
      .toMatchObject({ unit: "target", currentHealth: 1234n, maximumHealth: 2000n, absorb: 40, currentPower: 5, maximumPower: 30, powerType: "MANA" });
    expect(decodeAllPayloads(DamageSchema, streams.get("damage")!.data)[0].messages[0])
      .toMatchObject({ caster: "caster", target: "target", amount: 100, schools: [1], spellData: { id: 42, name: "Fire" } });
    expect(decodeAllPayloads(HealSchema, streams.get("heal")!.data)[0].messages[0])
      .toMatchObject({ caster: "target", target: "caster", amount: 70, schools: [2], spellData: { id: 43, name: "Heal" } });
    expect(decodeAllPayloads(SpellStartSchema, streams.get("spell_start")!.data)[0].messages[0])
      .toMatchObject({ caster: "caster", target: "target", castTimeMilli: 1500, spellData: { id: 44, name: "Bolt" } });
    expect(decodeAllPayloads(SpellGoSchema, streams.get("spell_go")!.data)[0].messages[0])
      .toMatchObject({ numHits: 2, spellData: { id: 44, name: "Bolt" } });
    expect(decodeAllPayloads(InterruptSchema, streams.get("interrupt")!.data)[0].messages[0])
      .toMatchObject({ caster: "target", target: "caster" });
    expect(decodeAllPayloads(SlainSchema, streams.get("slain")!.data)[0].messages[0])
      .toMatchObject({ caster: "caster", target: "target" });
    expect(decodeAllPayloads(ResurrectionSchema, streams.get("ressurection")!.data)[0].messages[0])
      .toMatchObject({ source: "target", target: "caster" });
  });
});
