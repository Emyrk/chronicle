import { describe, expect, it } from "vitest"
import { strToU8, zipSync } from "fflate"
import { defaultRef, formatBytes, manifestSummary, packageDownloadURL, readPackageFiles } from "./packageFiles"

const release = (sha256: string) => ({ sha256, published_at: "2026-10-01T00:00:00Z", published_by: "me" })

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

  it("defaults to stable, then unstable, then the draft", () => {
    expect(defaultRef({ stable: release("s"), unstable: release("u"), draft_sha256: "d" })).toBe("stable")
    expect(defaultRef({ stable: null, unstable: release("u"), draft_sha256: "d" })).toBe("unstable")
    expect(defaultRef({ stable: null, unstable: null, draft_sha256: "d" })).toBe("draft")
    expect(defaultRef({ stable: null, unstable: null, draft_sha256: null })).toBeNull()
  })

  it("downloads drafts from the private endpoint", () => {
    expect(packageDownloadURL({ id: "p 1" }, "draft", "abc")).toBe("/api/v1/me/lua-projects/p%201/draft/abc/package")
    expect(packageDownloadURL({ id: "p" }, "stable", "abc")).toBe("/api/v1/lua-projects/p/artifacts/abc/package")
  })

  it("formats sizes", () => {
    expect([formatBytes(12), formatBytes(2048), formatBytes(3 * 1024 * 1024)]).toEqual(["12 B", "2.0 KB", "3.0 MB"])
  })
})
