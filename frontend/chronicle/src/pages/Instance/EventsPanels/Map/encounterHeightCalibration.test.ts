import { describe, expect, it, vi } from "vitest";
import calibration from "./height-calibrations/forever-dalaran-atrexis.json";
import { dungeonMeshSHA256, encounterHeightReference, encounterReferenceY, type EncounterHeightContext } from "./encounterHeightCalibration";
import { buildFloorTracks } from "./walkableFloors";

function context(): EncounterHeightContext {
  return {
    datasetId: "b69b601c-d247-44c6-9cb6-3f71053fd052",
    mapId: 2959,
    coordinateSpace: "world",
    frame: "wow-yup-mirrored-x",
    wholeRun: false,
    selectedEncounterIds: ["backend-encounter-uuid"],
    activeEncounter: { id: "backend-encounter-uuid", name: "Atrexis the Grave Knight", mapId: 2959, enemyEntries: [247126] },
  };
}

describe("reviewed encounter height calibration", () => {
  it("matches canonical dataset identity and actual encounter name plus creature entry, not client encounter ID", () => {
    expect(encounterHeightReference(context())).toEqual({
      id: calibration.id, meshSHA256: calibration.meshSHA256, referenceZ: 60,
    });
  });

  it.each([
    { datasetId: undefined }, { datasetId: "forever" }, { datasetId: "other-uuid" },
    { mapId: undefined }, { mapId: 0 }, { coordinateSpace: undefined }, { coordinateSpace: "ui-map-normalized" },
    { frame: undefined }, { frame: "other-frame" }, { wholeRun: true },
    { selectedEncounterIds: [] }, { selectedEncounterIds: ["backend-encounter-uuid", "other"] },
    { selectedEncounterIds: ["different-active-encounter"] }, { activeEncounter: undefined },
  ] satisfies Partial<EncounterHeightContext>[])("fails closed for context %j", (invalid) => {
    expect(encounterHeightReference({ ...context(), ...invalid })).toBeUndefined();
  });

  it.each([
    { name: "Other encounter" }, { name: "" }, { enemyEntries: [] }, { enemyEntries: [247127] }, { mapId: 0 },
  ])("does not borrow artwork encounter identity: %j", (invalid) => {
    const valid = context();
    expect(encounterHeightReference({ ...valid, activeEncounter: { ...valid.activeEncounter!, ...invalid } })).toBeUndefined();
  });

  it.each([
    { datasetId: "" }, { dataset: "other" }, { frame: "other-frame" }, { version: 2 },
    { review: { status: "unreviewed" } }, { meshSHA256: "" }, { referenceZ: NaN },
  ])("rejects invalid calibration provenance %j", (invalid) => {
    expect(encounterHeightReference(context(), { ...calibration, ...invalid })).toBeUndefined();
  });

  it("requires the exact loaded mesh digest and converts the seed to scene units", () => {
    const reference = encounterHeightReference(context());
    expect(encounterReferenceY(reference, undefined, 2)).toBeUndefined();
    expect(encounterReferenceY(reference, "0".repeat(64), 2)).toBeUndefined();
    expect(encounterReferenceY(undefined, calibration.meshSHA256, 2)).toBeUndefined();
    expect(encounterReferenceY(reference, calibration.meshSHA256, NaN)).toBeUndefined();
    const options = {
      units: [{ guid: "player", samples: [{ ms: 0, x: 0, z: 0 }, { ms: 1000, x: 10, z: 0 }] }],
      scale: 2, candidatesAt: () => [196, 116],
    };
    const anchored = buildFloorTracks({ ...options, referenceY: encounterReferenceY(reference, calibration.meshSHA256, 2) });
    expect(anchored.reference).toBe(120);
    expect([...new Set(anchored.units.get("player")!.y)]).toEqual([116]);
    const stale = buildFloorTracks({ ...options, referenceY: encounterReferenceY(reference, "0".repeat(64), 2) });
    expect(stale.reference).toBe(196);
    expect([...new Set(stale.units.get("player")!.y)]).toEqual([196]);
  });

  it("hashes exact GLB bytes", async () => {
    // SHA-256 test vector for the exact bytes 61 62 63.
    expect(await dungeonMeshSHA256(new Uint8Array([97, 98, 99]).buffer))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("keeps digest failures optional for rendering", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(new Error("unavailable"));
    try {
      expect(await dungeonMeshSHA256(new ArrayBuffer(0))).toBeUndefined();
    } finally {
      digest.mockRestore();
    }
  });
});
