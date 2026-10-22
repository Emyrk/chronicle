import { create, toBinary, type DescMessage, type MessageShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  EventMetaSchema,
  SpellDataSchema,
  SpellGoSchema,
  SpellStartSchema,
  UnitPositionSchema,
} from "@/api/proto/chronicle_pb";
import type { GuidePackageLike } from "./types";
import { loadGuideEventData } from "./eventStreams";

function varint(value: number | bigint): Uint8Array {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  while (remaining >= 0x80n) {
    bytes.push(Number(remaining & 0x7fn) | 0x80);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Uint8Array.from(bytes);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function stream<T extends DescMessage>(encounterId: string, schema: T, messages: readonly MessageShape<T>[]): Uint8Array {
  const encounter = new TextEncoder().encode(encounterId);
  const encoded = messages.map((message) => toBinary(schema, message));
  const data = concat(encoded.flatMap((message) => [varint(message.byteLength), message]));
  return concat([varint(encounter.byteLength), encounter, varint(1_000), varint(messages.length), varint(data.byteLength), data]);
}

function packageWithStreams(files: ReadonlyMap<string, Uint8Array>): GuidePackageLike {
  return {
    manifest: {
      id: "chronicle.test",
      name: "Test guide",
      entrypoint: "main.lua",
      capabilities: [],
      assets: [],
      event_streams: [
        { type: "unit_position", path: "events/positions.pb" },
        { type: "spell_start", path: "events/spell-start.pb" },
        { type: "spell_go", path: "events/spell-go.pb" },
      ],
    },
    read: (path) => {
      const file = files.get(path);
      if (!file) throw new Error(`missing ${path}`);
      return file;
    },
    readText: () => "",
  };
}

function meta(index: number, offsetMilli: number) {
  return create(EventMetaSchema, { index, offsetMilli: BigInt(offsetMilli), isSynthetic: true });
}

describe("guide event streams", () => {
  it("decodes canonical position and spell streams through the production Map processor", () => {
    const files = new Map<string, Uint8Array>([
      ["events/positions.pb", stream("entrance", UnitPositionSchema, [
        create(UnitPositionSchema, { meta: meta(0, 0), unit: "mage", x: 1, y: 2, mapId: 249 }),
        create(UnitPositionSchema, { meta: meta(3, 1_000), unit: "mage", x: 3, y: 4, mapId: 249 }),
      ])],
      ["events/spell-start.pb", stream("entrance", SpellStartSchema, [
        create(SpellStartSchema, {
          meta: meta(1, 250),
          caster: "mage",
          target: "onyxia",
          spellData: create(SpellDataSchema, { id: 10, name: "Blizzard" }),
          castTimeMilli: 2_500,
        }),
      ])],
      ["events/spell-go.pb", stream("entrance", SpellGoSchema, [
        create(SpellGoSchema, {
          meta: meta(2, 750),
          caster: "mage",
          target: "onyxia",
          spellData: create(SpellDataSchema, { id: 10, name: "Blizzard" }),
          numHits: 4,
        }),
      ])],
    ]);

    const data = loadGuideEventData(packageWithStreams(files));
    const encounter = data.result.encounters.get("entrance");

    expect(data.encounterIds).toEqual(["entrance"]);
    expect(encounter?.positionsByUnit.get("mage")).toEqual([
      expect.objectContaining({ timestampMs: 1_000, x: 1, y: 2, mapId: 249 }),
      expect.objectContaining({ timestampMs: 2_000, x: 3, y: 4, mapId: 249 }),
    ]);
    expect(encounter?.effects.events).toEqual([
      expect.objectContaining({ timestampMs: 1_250, kind: "cast_start", source: "mage", target: "onyxia", spellId: 10 }),
      expect.objectContaining({ timestampMs: 1_750, kind: "cast_go", source: "mage", target: "onyxia", spellId: 10 }),
    ]);
  });
});
