import { describe, expect, it } from "vitest";
import type { CachedStream, StreamType } from "@/hooks/instanceEvents";
import type { SerializableProcessorContext } from "./processorTypes";
import type { AllActivityDebugState } from "./processors/allActivityDebug.processor";
import { processIncrementally } from "./mainThreadProcessor";

function createContext(): SerializableProcessorContext {
  return {
    players: {},
    selectedEncounterIds: ["encounter"],
    entitySelection: {
      enemyIds: [],
      playerIds: [],
    },
  };
}

describe("processIncrementally", () => {
  it("ignores unsupported consume streams and leaves their count at zero", async () => {
    const streams = new Map<StreamType, CachedStream>([
      ["consume", { data: new Uint8Array(), headers: [] }],
    ]);

    const result = await processIncrementally<AllActivityDebugState>({
      panelId: "all_activity",
      streams,
      context: createContext(),
      stopAtTimestamp: null,
      previousState: null,
    });

    expect(result.error).toBeUndefined();
    expect(result.processedCount).toBe(0);
    expect(result.result.streamCounts.consume).toBe(0);
  });
});
