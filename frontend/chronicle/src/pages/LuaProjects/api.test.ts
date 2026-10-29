import { afterEach, describe, expect, it, vi } from "vitest"
import { channelSha, createProject, createRelease, deleteProject, deleteRelease, getProjectQuota, getPublicProject, latestRelease, listProjects, publicPackageURL, uploadDraft } from "./api"

const response = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body })

describe("Lua project authoring API", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("uses owner-scoped routes for creation and listing", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ projects: [] })).mockResolvedValueOnce(response({ id: "one" }))
    vi.stubGlobal("fetch", fetch)
    expect(await listProjects()).toEqual([])
    await createProject("guide", "My guide", "my-guide")
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/v1/me/lua-projects", { credentials: "include" })
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/v1/me/lua-projects", expect.objectContaining({
      credentials: "include", method: "POST", body: JSON.stringify({ kind: "guide", name: "My guide", slug: "my-guide" }),
    }))
  })

  it("reads quota and deletes whole modules", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ owned: 2, limit: 3 })).mockResolvedValueOnce({ ...response(), status: 204 })
    vi.stubGlobal("fetch", fetch)
    expect(await getProjectQuota()).toEqual({ owned: 2, limit: 3 })
    await deleteProject("a/b")
    expect(fetch.mock.calls[0]).toEqual(["/api/v1/me/lua-projects/quota", { credentials: "include" }])
    expect(fetch.mock.calls[1]).toEqual(["/api/v1/me/lua-projects/a%2Fb", expect.objectContaining({ credentials: "include", method: "DELETE" })])
  })

  it("uploads raw tar with a revision guard and no form encoding", async () => {
    const fetch = vi.fn().mockResolvedValue(response())
    vi.stubGlobal("fetch", fetch)
    const archive = new File(["archive"], "project.tar", { type: "application/x-tar" })
    await uploadDraft("a/b", 4, archive)
    expect(fetch).toHaveBeenCalledWith("/api/v1/me/lua-projects/a%2Fb/draft?expected_revision=4", {
      credentials: "include", method: "PUT", headers: { "Content-Type": "application/x-tar" }, body: archive,
    })
  })

  it("resolves mutable channels without caching before fetching hash-addressed bytes", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ main: { sha256: "a".repeat(64) }, releases: [] }))
    vi.stubGlobal("fetch", fetch)
    const controller = new AbortController()
    const project = await getPublicProject("a/b", "main", controller.signal)
    expect(fetch).toHaveBeenCalledWith("/api/v1/lua-projects/a%2Fb?channel=main", {
      credentials: "include", signal: controller.signal, cache: "no-store",
    })
    expect(publicPackageURL("a/b", channelSha(project, "main")!)).toBe(`/api/v1/lua-projects/a%2Fb/artifacts/${"a".repeat(64)}/package`)
  })

  it("tags releases with a revision guard and runs the newest one that has files", async () => {
    const fetch = vi.fn().mockResolvedValue(response())
    vi.stubGlobal("fetch", fetch)
    await createRelease("abc", 7, "v1.2")
    await deleteRelease("abc", "v0.9")
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/me/lua-projects/abc/releases")
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ tag: "v1.2", expected_revision: 7 })
    expect(fetch.mock.calls[1]).toEqual(["/api/v1/me/lua-projects/abc/releases/v0.9", expect.objectContaining({ method: "DELETE" })])
    const releases = [
      { tag: "v3", available: false, published_at: "" },
      { tag: "v2", available: true, sha256: "b".repeat(64), published_at: "" },
    ]
    expect(latestRelease({ releases })?.tag).toBe("v2")
    expect(channelSha({ releases, main: undefined }, "release")).toBe("b".repeat(64))
  })
})
