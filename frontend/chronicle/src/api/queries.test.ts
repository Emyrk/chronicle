import { afterEach, describe, expect, it, vi } from "vitest";
import {
  billingCheckoutOperationID,
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

describe("billingCheckoutOperationID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses one operation ID for retries of the same price", () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    vi.stubGlobal("crypto", { randomUUID });
    const operationIDs = new Map<string, string>();

    expect(billingCheckoutOperationID(operationIDs, "price_monthly")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(billingCheckoutOperationID(operationIDs, "price_monthly")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(billingCheckoutOperationID(operationIDs, "price_annual")).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });
});

describe("getLogGroupRefetchInterval", () => {
  it.each(["available", "pending", "retryable", "running", "scheduled"])(
    "polls every 9 seconds while the job is %s",
    (state) => {
      expect(getLogGroupRefetchInterval(logWithJobState(state))).toBe(9_000);
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
