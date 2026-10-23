import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLogGroupRefetchInterval,
  spellQueryOptions,
  type RiverJobState,
  type WoWLogGroupState,
} from "./queries";

function logWithJobState(state: RiverJobState): WoWLogGroupState {
  return { status: { state } } as WoWLogGroupState;
}

describe("spellQueryOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses one dataset-aware cache key", () => {
    expect(spellQueryOptions("123").queryKey).toEqual([
      "wowdb",
      "spell",
      "123",
      "default",
    ]);
    expect(spellQueryOptions("123", "dataset-a").queryKey).toEqual([
      "wowdb",
      "spell",
      "123",
      "dataset-a",
    ]);
  });

  it("requests the matching dataset", async () => {
    const spell = { id: 123 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(spell),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(spellQueryOptions("123", "dataset-a").queryFn()).resolves.toBe(spell);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/wowdb/spell/123?dataset_id=dataset-a",
    );
  });

  it("uses the default endpoint when no dataset is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(spellQueryOptions("456").queryFn()).rejects.toThrow(
      "Spell not found",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/wowdb/spell/456");
  });
});

describe("getLogGroupRefetchInterval", () => {
  it.each(["available", "pending", "retryable", "running", "scheduled"])(
    "polls every 10 seconds while the job is %s",
    (state) => {
      expect(getLogGroupRefetchInterval(logWithJobState(state))).toBe(10_000);
    },
  );

  it.each(["cancelled", "completed", "discarded"])(
    "stops polling when the job is %s",
    (state) => {
      expect(getLogGroupRefetchInterval(logWithJobState(state))).toBe(false);
    },
  );

  it("does not poll before log data is available", () => {
    expect(getLogGroupRefetchInterval(undefined)).toBe(false);
  });
});
