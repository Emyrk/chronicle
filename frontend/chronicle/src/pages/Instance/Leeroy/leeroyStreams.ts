import { create, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import {
  DamageSchema, EventMetaSchema, HealSchema, InterruptSchema, ResurrectionSchema,
  SlainSchema, SpellDataSchema, SpellGoSchema, SpellStartSchema,
  UnitPositionSchema, UnitResourcesSchema,
} from "@/api/proto/chronicle_pb";
import type { CachedStream, StreamType } from "@/hooks/instanceEvents/types";
import type { MapFixture } from "../EventsPanels/Map/fixtures/mapFixture";

function varint(value: number | bigint): number[] {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  while (remaining > 127n) {
    bytes.push(Number(remaining & 127n) | 128);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return bytes;
}

function encodeMessage<T extends DescMessage>(schema: T, fields: MessageInitShape<T>): Uint8Array {
  const bytes = toBinary(schema, create(schema, fields));
  return Uint8Array.from([...varint(bytes.length), ...bytes]);
}

/** Convert a map fixture to the same header + length-delimited protobuf streams as the API. */
export function buildLeeroyStreams(fixture: MapFixture): Map<StreamType, CachedStream> {
  const buckets = new Map<StreamType, Uint8Array[]>();
  const guid = (index: number | null) => index == null ? undefined : fixture.guids[index];
  const spell = (id: number, name: string) => create(SpellDataSchema, { id, name });

  fixture.events.forEach((row, index) => {
    const [code, offset, ...fields] = row;
    const f = fields as (string | number | null)[];
    const n = (i: number) => Number(f[i] ?? 0);
    const text = (i: number) => String(f[i] ?? "");
    const unit = (i: number) => guid(f[i] as number | null);
    const meta = create(EventMetaSchema, { index, offsetMilli: BigInt(offset as number) });
    let type: StreamType;
    let message: Uint8Array;
    switch (code) {
      case "p": {
        type = "unit_position";
        const hasZ = f.length >= 6;
        message = encodeMessage(UnitPositionSchema, {
          meta, unit: unit(0), x: n(1), y: n(2),
          ...(hasZ && f[3] != null ? { z: n(3) } : {}),
          mapId: n(hasZ ? 4 : 3),
          ...(f[hasZ ? 5 : 4] != null ? { facing: n(hasZ ? 5 : 4) } : {}),
        });
        break;
      }
      case "r":
        type = "unit_resources";
        message = encodeMessage(UnitResourcesSchema, {
          meta, unit: unit(0), currentHealth: BigInt(n(1)), maximumHealth: BigInt(n(2)),
          absorb: n(3), currentPower: n(4), maximumPower: n(5), powerType: text(6),
        });
        break;
      case "d":
      case "h": {
        const shared = {
          meta, caster: unit(0), target: unit(1), amount: n(2), hitType: n(3),
          school: n(4), schools: [n(4)], sourceName: text(6),
          ...(f[5] != null ? { spellData: spell(n(5), text(6)) } : {}),
        };
        type = code === "d" ? "damage" : "heal";
        message = code === "d"
          ? encodeMessage(DamageSchema, shared)
          : encodeMessage(HealSchema, { ...shared, caster: unit(0) ?? "", overheal: 0, absorbed: 0 });
        break;
      }
      case "s":
        type = "spell_start";
        message = encodeMessage(SpellStartSchema, {
          meta, caster: unit(0), target: unit(1), castTimeMilli: n(2), spellData: spell(n(3), text(4)),
        });
        break;
      case "g":
        type = "spell_go";
        message = encodeMessage(SpellGoSchema, {
          meta, caster: unit(0), target: unit(1), numHits: n(2), spellData: spell(n(3), text(4)),
        });
        break;
      case "i":
        type = "interrupt";
        message = encodeMessage(InterruptSchema, { meta, caster: unit(0), target: unit(1) });
        break;
      case "k":
        type = "slain";
        message = encodeMessage(SlainSchema, { meta, caster: unit(0), target: unit(1) });
        break;
      case "z":
        type = "ressurection";
        message = encodeMessage(ResurrectionSchema, { meta, source: unit(0), target: unit(1) });
        break;
      default:
        throw new Error(`Unknown fixture event code: ${code}`);
    }
    const bucket = buckets.get(type) ?? [];
    bucket.push(message);
    buckets.set(type, bucket);
  });

  const streams = new Map<StreamType, CachedStream>();
  const encounterBytes = new TextEncoder().encode(fixture.encounter.id);
  const firstTimestamp = new Date(fixture.firstTimestamp);
  for (const [type, messages] of buckets) {
    const dataLength = messages.reduce((sum, bytes) => sum + bytes.length, 0);
    const header = Uint8Array.from([
      ...varint(encounterBytes.length), ...encounterBytes,
      ...varint(firstTimestamp.getTime()), ...varint(messages.length), ...varint(dataLength),
    ]);
    const data = new Uint8Array(header.length + dataLength);
    data.set(header);
    let offset = header.length;
    for (const bytes of messages) {
      data.set(bytes, offset);
      offset += bytes.length;
    }
    streams.set(type, {
      data,
      headers: [{ encounterID: fixture.encounter.id, firstTimestamp, count: messages.length, dataLength }],
    });
  }
  return streams;
}
