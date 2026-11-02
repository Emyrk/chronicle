import { afterEach, describe, expect, it, vi } from "vitest";
import { buildUIUsagePayload, createPanelChoiceBatcher, reportUIUsage, uiUsageSignature, usagePanelType } from "./uiUsage";

describe("UI usage telemetry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("collapses custom and Lua panel references to bounded labels", () => {
    expect(usagePanelType("damage_done")).toBe("damage_done");
    expect(usagePanelType("empty")).toBeNull();
    expect(usagePanelType("custom:github:emyrk/example:meter")).toBe("custom");
    expect(usagePanelType("lua:123e4567-e89b-12d3-a456-426614174000:release")).toBe("lua");
  });

  it("builds a stable payload without empty panels", () => {
    const payload = buildUIUsagePayload("summary", [
      "damage_done",
      "empty",
      "custom:github:emyrk/example:meter",
    ]);

    expect(payload).toEqual({ preset: "summary", panels: ["custom", "damage_done"] });
    expect(uiUsageSignature("summary", ["damage_done", "custom:github:emyrk/example:meter", "empty"]))
      .toBe('{"preset":"summary","panels":["custom:github:emyrk/example:meter","damage_done"]}');
  });

  it("batches explicit panel selections during the debounce window", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const batcher = createPanelChoiceBatcher(send, 750);

    batcher.select("damage_done");
    vi.advanceTimersByTime(500);
    batcher.select("custom:github:emyrk/example:meter");
    vi.advanceTimersByTime(749);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ selected: ["damage_done", "custom"] });
  });

  it("reports asynchronously without credentials", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    reportUIUsage({ panels: ["damage_done"] });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/ui-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"panels":["damage_done"]}',
      credentials: "omit",
      keepalive: true,
    });
  });
});
