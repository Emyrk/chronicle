import { create, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { EventMetaSchema, UnitPositionSchema } from "@/api/proto/chronicle_pb";
import { processWorkerRequest } from "./panelRequestProcessor";

function varint(value: number): number[] {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return bytes;
}

// One stream segment: [encounterID][firstTimestamp][count][dataLength][messages].
function positionSegment(encounterID: string, timestampMs: number, unit: string): number[] {
  const encoded = toBinary(UnitPositionSchema, create(UnitPositionSchema, { meta: create(EventMetaSchema, { index: 1 }), unit, x: 1, y: 2, mapId: 469 }));
  const messages = [...varint(encoded.length), ...encoded];
  const id = new TextEncoder().encode(encounterID);
  return [...varint(id.length), ...id, ...varint(timestampMs), ...varint(1), ...varint(messages.length), ...messages];
}

function mapEncounters(selectedEncounterIds: string[]): string[] {
  const data = new Uint8Array([...positionSegment("trash", 1_000, "0xA"), ...positionSegment("boss", 2_000, "0xB")]);
  const response = processWorkerRequest({
    requestId: 1,
    panelId: "map",
    streams: [{ type: "unit_position", data }],
    context: { players: {}, selectedEncounterIds, entitySelection: { enemyIds: [], playerIds: [] } },
  });
  expect(response.error).toBeUndefined();
  const encounters = (response.result as unknown as { encounters: { entries: [string, unknown][] } }).encounters;
  return encounters.entries.map(([id]) => id);
}

describe("processWorkerRequest map", () => {
  it("processes only the selected encounter when one is selected", () => {
    expect(mapEncounters(["boss"])).toEqual(["boss"]);
  });

  it("keeps every encounter for the whole run (zero or several selected)", () => {
    expect(mapEncounters([])).toEqual(["trash", "boss"]);
    expect(mapEncounters(["trash", "boss"])).toEqual(["trash", "boss"]);
  });
});
