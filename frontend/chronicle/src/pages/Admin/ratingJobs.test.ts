import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueRatingJob } from "./ratingJobs";

afterEach(() => vi.unstubAllGlobals());

describe("rating maintenance enqueue", () => {
  it.each([
    ["renown-repair", "/api/v1/admin/ratings/renown/repair"],
    ["rebuild", "/api/v1/admin/ratings/rebuild"],
  ] as const)("posts %s to its admin route", async (action, path) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: 42, job_state: "available", unique_skipped_as_duplicate: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(enqueueRatingJob(action)).resolves.toMatchObject({ job_id: 42 });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(path, { method: "POST" });
  });

  it("shows the server error without treating the job as queued", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: "Queue unavailable" }),
    }));
    await expect(enqueueRatingJob("rebuild")).rejects.toThrow("Queue unavailable");
  });
});
