import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIdentityCatalogue, identityCatalogueDownloadURL, identityCatalogueURL } from "./identityCatalogue";

afterEach(() => vi.unstubAllGlobals());

describe("identity catalogue requests", () => {
  it("sends server-side review and bounded pagination, pinning cursors to generation", () => {
    expect(identityCatalogueURL("log", "unknown")).toBe("/api/v1/raidlogs/logs/log/identity-catalogue?review=unknown&limit=100");
    const params = new URL(identityCatalogueURL("log", "conflicts", { after: "0x0000", generation: 7 }), "https://example.test").searchParams;
    expect(params.get("after")).toBe("0x0000");
    expect(params.get("generation")).toBe("7");
    expect(identityCatalogueDownloadURL("log", 7)).toBe("/api/v1/raidlogs/logs/log/identity-catalogue/download?generation=7");
  });

  it("preserves an explicitly absent catalogue rather than treating it as an empty filter result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ catalogue: null, records: [] })));
    expect(await fetchIdentityCatalogue("log", "all")).toEqual({ page: { catalogue: null, records: [] }, reset: false });
  });

  it("discards the stale generation and refetches page one on409", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("replaced", { status: 409 })).mockResolvedValueOnce(Response.json({ catalogue: { generation: 8 }, records: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchIdentityCatalogue("log", "unknown", { after: "old-guid", generation: 7 });
    expect(result.reset).toBe(true);
    expect(result.page.catalogue?.generation).toBe(8);
    expect(fetchMock.mock.calls[1][0]).toBe(identityCatalogueURL("log", "unknown"));
    expect(fetchMock.mock.calls[1][1].credentials).toBe("same-origin");
  });

  it.each([401, 403, 404, 500])("reports HTTP%s as error, never as absent data", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("failed", { status })));
    await expect(fetchIdentityCatalogue("log", "all")).rejects.toThrow(`(${status})`);
  });
});
