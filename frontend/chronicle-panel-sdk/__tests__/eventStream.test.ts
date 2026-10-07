import { create, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { decodeEncounterPayloads } from "../src/v1/events";
import { DamageSchema } from "../src/v1/protobuf/chronicle_pb";

function varint(value: number): number[] {
  const bytes: number[] = [];
  let current = value;
  do {
    let byte = current % 128;
    current = Math.floor(current / 128);
    if (current > 0) byte |= 0x80;
    bytes.push(byte);
  } while (current > 0);
  return bytes;
}

function framedDamageStream(): ArrayBuffer {
  const message = toBinary(DamageSchema, create(DamageSchema, {
    caster: "Player-1",
    target: "Creature-1",
    sourceName: "Fireball",
    amount: 1234,
    meta: { index: 7, offsetMilli: 5000n },
  }));
  const encounter = new TextEncoder().encode("encounter-1");
  const body = new Uint8Array([...varint(message.length), ...message]);
  return new Uint8Array([
    ...varint(encounter.length),
    ...encounter,
    ...varint(1_700_000_000_000),
    ...varint(1),
    ...varint(body.length),
    ...body,
  ]).buffer;
}

describe("decodeEncounterPayloads", () => {
  it("decodes Chronicle framing and protobuf messages", () => {
    const [payload] = decodeEncounterPayloads(DamageSchema, framedDamageStream());
    expect(payload.encounterId).toBe("encounter-1");
    expect(payload.firstTimestampMs).toBe(1_700_000_000_000);
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]?.amount).toBe(1234);
    expect(payload.events[0]?.meta?.offsetMilli).toBe(5000n);
  });
});
