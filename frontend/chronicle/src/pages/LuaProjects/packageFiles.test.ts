import { describe, expect, it } from "vitest"
import { strToU8, zipSync } from "fflate"
import { defaultRef, formatBytes, timeAgo, manifestSummary, packageDownloadURL, packageSha, readPackageFiles } from "./packageFiles"

const release = (tag: string, available = true) => ({ tag, available, ...(available && { sha256: tag + "-sha" }), published_at: "2026-10-01T00:00:00Z" })

describe("package files", () => {
  it("lists files with README.md first", async () => {
    const zip = zipSync({ "main.lua": strToU8("return {}"), "README.md": strToU8("# Hi"), "icons/a.png": strToU8("x"), "project.json": strToU8("{}") }, { level: 0 })
    expect((await readPackageFiles(zip)).map(file => file.path)).toEqual(["README.md", "icons/a.png", "main.lua", "project.json"])
  })

  it("summarizes the manifest and tolerates invalid JSON", () => {
    const file = (text: string) => [{ path: "project.json", bytes: strToU8(text) }]
    expect(manifestSummary(file(`{"streams":["damage"],"capabilities":["ui"],"max_events":5}`))).toEqual({ streams: ["damage"], capabilities: ["ui"], streamScope: "selection", maxEvents: 5 })
    expect(manifestSummary(file("{"))).toBeNull()
    expect(manifestSummary([])).toBeNull()
  })

  it("defaults to the latest release with files, then main", () => {
    const main = { sha256: "m", updated_at: "2026-10-27T00:00:00Z" }
    expect(defaultRef({ releases: [release("v2", false), release("v1")], main })).toBe("v1")
    expect(defaultRef({ releases: [release("v1", false)], main })).toBe("main")
    expect(defaultRef({ releases: [], main: undefined })).toBeNull()
    expect(packageSha({ releases: [release("v2", false)], main }, "v2")).toBeNull()
    expect(packageSha({ releases: [], main }, "main")).toBe("m")
  })

  it("serves every build from the public endpoint", () => {
    expect(packageDownloadURL({ id: "p 1" }, "abc")).toBe("/api/v1/lua-projects/p%201/artifacts/abc/package")
  })

  it("says how long ago a release was published", () => {
    const now = Date.parse("2026-10-28T17:00:00Z")
    expect(timeAgo("2026-10-28T16:55:00Z", now)).toMatch(/5 minutes ago/)
    expect(timeAgo("2026-10-26T17:00:00Z", now)).toMatch(/2 days ago/)
    expect(timeAgo("2026-08-01T12:00:00Z", now)).toMatch(/2026/)
  })

  it("formats sizes", () => {
    expect([formatBytes(12), formatBytes(2048), formatBytes(3 * 1024 * 1024)]).toEqual(["12 B", "2.0 KB", "3.0 MB"])
  })
})
