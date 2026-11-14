import { afterEach, expect, it, vi } from "vitest";
import { blogRequest, blogFeedbackMutation, blogModerationMutation } from "./blogInteractions";

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

it("sends private submissions and consent withdrawal without forcing publication", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetcher);
  for (const consent of [false, true, false]) {
    const mutation = blogFeedbackMutation("  Edited suggestion  ", consent);
    await blogRequest("/api/v1/blog/test/feedback", mutation.method, mutation.body);
    expect(fetcher).toHaveBeenLastCalledWith("/api/v1/blog/test/feedback", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "Edited suggestion", consent }),
    });
  }
});
it("sends the reviewed revision for both approve and reject", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetcher);
  for (const action of ["approve", "reject"] as const) {
    const mutation = blogModerationMutation("feedback-id", action, "2026-11-14T21:00:00.123456Z");
    await blogRequest(`/api/v1/admin/blog/${mutation.path}`, mutation.method, mutation.body);
    expect(fetcher).toHaveBeenLastCalledWith(`/api/v1/admin/blog/feedback/feedback-id/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"expected_updated_at":"2026-11-14T21:00:00.123456Z"}',
    });
  }
});
