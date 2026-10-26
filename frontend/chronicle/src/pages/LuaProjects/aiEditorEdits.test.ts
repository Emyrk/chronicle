import { describe, expect, it } from "vitest"
import { buildLuaEditMessage, createLuaEditResponse, isLuaEditCurrent, MAX_AI_EDIT_MESSAGE_BYTES } from "./aiEditorEdits"

const bytes = (value: string) => new TextEncoder().encode(value).length

describe("AI Lua editor edits", () => {
  it("bounds the whole UTF-8 user message including the instruction and source", () => {
    const prefix = buildLuaEditMessage("", "edit", "Panel")
    const source = "界".repeat(Math.floor((MAX_AI_EDIT_MESSAGE_BYTES - bytes(prefix)) / 3))
    expect(bytes(buildLuaEditMessage(source, "edit", "Panel"))).toBeLessThanOrEqual(MAX_AI_EDIT_MESSAGE_BYTES)
    expect(() => buildLuaEditMessage(source + "界", "edit", "Panel")).toThrow("32 KiB")
    expect(() => buildLuaEditMessage("return {}", "界".repeat(11000), "Panel")).toThrow("32 KiB")
    expect(() => buildLuaEditMessage("return {}", "  ", "Panel")).toThrow()
  })

  it("rejects stale source, local revisions, projects and server revisions", () => {
    const snapshot = { source: "return 1", revisionToken: 3, projectId: "a", projectRevision: 4 }
    expect(isLuaEditCurrent(snapshot, { ...snapshot })).toBe(true)
    for (const changed of [
      { source: "return 2" }, { revisionToken: 5 }, { projectId: "b" }, { projectRevision: 5 },
    ]) expect(isLuaEditCurrent(snapshot, { ...snapshot, ...changed })).toBe(false)
    // Even if the text returns to its original value, the local revision detects intervening edits.
    expect(isLuaEditCurrent(snapshot, { ...snapshot, revisionToken: 4, source: snapshot.source })).toBe(false)
  })

  it("only parses bounded strict complete-source JSON proposals", () => {
    const response = createLuaEditResponse()
    response.append('{"main_')
    response.append('lua":"return 2"}')
    expect(response.proposal()).toBe("return 2")
    for (const text of ["```lua\nreturn 2\n```", '{"main_lua":"return 2","other":1}', '{"main_lua":""}']) {
      const invalid = createLuaEditResponse()
      invalid.append(text)
      expect(() => invalid.proposal()).toThrow()
    }
    const oversized = createLuaEditResponse()
    expect(() => oversized.append("界".repeat(87382))).toThrow("256 KiB")
    expect(() => oversized.proposal()).toThrow()
  })
})
