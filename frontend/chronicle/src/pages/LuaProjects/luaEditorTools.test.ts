import { describe, expect, it } from "vitest"
import { applyLuaFileEdit, parseLuaFileEdit } from "./luaEditorTools"

const files = { lua: "local a = 1\nlocal b = 1\nreturn {}\n", manifest: "{}\n", readme: "" }

describe("lua editor tools", () => {
  it("parses bounded edit arguments", () => {
    expect(parseLuaFileEdit({ file: "main.lua", expected_revision: 2, edits: [{ old_text: "a", new_text: "b" }] }))
      .toEqual({ file: "main.lua", expectedRevision: 2, edits: [{ oldText: "a", newText: "b" }] })
    expect(parseLuaFileEdit({ file: "project.json", expected_revision: 0, content: "{}" })).toEqual({ file: "project.json", expectedRevision: 0, content: "{}" })
    for (const bad of [null, {}, { file: "x.lua", expected_revision: 1, content: "x" }, { file: "main.lua", content: "x" },
      { file: "main.lua", expected_revision: 1 }, { file: "main.lua", expected_revision: 1, content: "x", edits: [{ old_text: "a", new_text: "" }] },
      { file: "main.lua", expected_revision: 1, edits: [{ old_text: "", new_text: "b" }] }]) {
      expect(() => parseLuaFileEdit(bad)).toThrow()
    }
  })

  it("applies sequential unique replacements and rejects ambiguous ones", () => {
    const next = applyLuaFileEdit(files, { file: "main.lua", expectedRevision: 0, edits: [{ oldText: "local a = 1", newText: "local a = 2" }, { oldText: "return {}", newText: "return { a = a }" }] })
    expect(next).toEqual({ ...files, lua: "local a = 2\nlocal b = 1\nreturn { a = a }\n" })
    expect(() => applyLuaFileEdit(files, { file: "main.lua", expectedRevision: 0, edits: [{ oldText: "= 1", newText: "= 3" }] })).toThrow(/more than once/)
    expect(() => applyLuaFileEdit(files, { file: "main.lua", expectedRevision: 0, edits: [{ oldText: "missing", newText: "" }] })).toThrow(/not found/)
    expect(applyLuaFileEdit(files, { file: "project.json", expectedRevision: 0, content: "[]" })).toEqual({ ...files, manifest: "[]" })
    expect(files.lua).toContain("local a = 1")
  })
})
