import { describe, expect, it, vi } from "vitest";
import { copyPluginStream } from "./pluginStreamBroker";

describe("copyPluginStream", () => {
  it("returns owned bytes and plain headers", async () => {
    const cached = { data: new Uint8Array([1, 2, 3]), headers: [{ encounterID: "e", firstTimestamp: new Date(10), count: 2, dataLength: 3 }] };
    const fetchStream = vi.fn(async () => cached);
    const result = await copyPluginStream("damage", ["damage"], fetchStream, new AbortController().signal);
    new Uint8Array(result.data)[0] = 9;
    expect(cached.data[0]).toBe(1);
    expect(result.headers).toEqual([{ encounterId: "e", firstTimestampMs: 10, count: 2, dataLength: 3 }]);
    expect(fetchStream).toHaveBeenCalledOnce();
  });

  it("rejects undeclared streams without fetching", async () => {
    const fetchStream = vi.fn();
    await expect(copyPluginStream("heal", ["damage"], fetchStream, new AbortController().signal)).rejects.toThrow("not declared");
    expect(fetchStream).not.toHaveBeenCalled();
  });
});
