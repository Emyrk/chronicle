import { afterEach, describe, expect, it, vi } from "vitest"
import { createProject, getPublicProject, listProjects, promoteStable, publicPackageURL, publishUnstable, uploadDraft } from "./api"

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
    const fetch = vi.fn().mockResolvedValue(response({ unstable: { sha256: "a".repeat(64) } }))
    vi.stubGlobal("fetch", fetch)
    const controller = new AbortController()
    const project = await getPublicProject("a/b", "unstable", controller.signal)
    expect(fetch).toHaveBeenCalledWith("/api/v1/lua-projects/a%2Fb?channel=unstable", {
      credentials: "include", signal: controller.signal, cache: "no-store",
    })
    expect(publicPackageURL("a/b", project.unstable!.sha256)).toBe(`/api/v1/lua-projects/a%2Fb/artifacts/${"a".repeat(64)}/package`)
  })

  it("publishes with explicit revision and tested digest", async () => {
    const fetch = vi.fn().mockResolvedValue(response())
    vi.stubGlobal("fetch", fetch)
    await publishUnstable("abc", 7)
    await promoteStable("abc", 8, "a".repeat(64))
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ expected_revision: 7 })
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ expected_revision: 8, tested_sha256: "a".repeat(64) })
    expect(publicPackageURL("abc", "a".repeat(64))).toBe(`/api/v1/lua-projects/abc/artifacts/${"a".repeat(64)}/package`)
  })
})
