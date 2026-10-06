import { afterEach, describe, expect, it, vi } from "vitest";
import { createPluginItemMetadataBroker, fetchPluginItemMetadata } from "./pluginGameData";

afterEach(() => vi.unstubAllGlobals());

describe("fetchPluginItemMetadata", () => {
  it("deduplicates and sorts positive item IDs", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [{ entry: 2, name: "Blue Hat", quality: 3 }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPluginItemMetadata([3, 0, 2, 3, -1], new AbortController().signal);

    expect(result).toEqual([{ entry: 2, name: "Blue Hat", quality: 3 }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/internal/gamedata/items/metadata", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ item_ids: [2, 3] }),
    }));
  });

  it("caches metadata across overlapping requests", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { item_ids: number[] };
      return new Response(JSON.stringify({
        items: body.item_ids.map((entry) => ({ entry, name: `Item ${entry}`, quality: 2 })),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const getItemMetadata = createPluginItemMetadataBroker(new AbortController().signal);

    await expect(getItemMetadata([1, 2])).resolves.toHaveLength(2);
    await expect(getItemMetadata([2, 3])).resolves.toHaveLength(2);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ item_ids: [3] });
  });

  it("returns without fetching for an empty request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPluginItemMetadata([], new AbortController().signal)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized requests before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPluginItemMetadata(
      Array.from({ length: 513 }, (_, index) => index + 1),
      new AbortController().signal,
    )).rejects.toThrow("more than 512");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
