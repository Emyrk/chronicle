import { afterEach, expect, it, vi } from "vitest";
import { blogRequest } from "./blogInteractions";

afterEach(() => vi.unstubAllGlobals());
it("sends JSON mutations and accepts empty successful responses", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetcher);
  await expect(blogRequest("/feedback", "PUT", { body: "hello", publication_consent: false })).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledWith("/feedback", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "hello", publication_consent: false }) });
});
it("surfaces authorization and stale-review errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: "Feedback changed. Reload before reviewing." }) }));
  await expect(blogRequest("/feedback", "PATCH", {})).rejects.toThrow("Feedback changed");
});
it("handles non-JSON failures without exposing response bodies", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => { throw new Error("invalid JSON"); } }));
  await expect(blogRequest("/feedback")).rejects.toThrow("Request failed (503)");
});
