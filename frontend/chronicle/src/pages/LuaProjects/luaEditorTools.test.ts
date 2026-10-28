import { describe, expect, it } from "vitest"
import { applyLuaFileEdit, parseLuaFileEdit, workingCopyFiles } from "./luaEditorTools"

const files = { lua: "local a = 1\nlocal b = 1\nreturn {}\n", manifest: "{}\n", readme: "" }

describe("lua editor tools", () => {
  it("parses bounded edit arguments", () => {
    expect(parseLuaFileEdit({ file: "main.lua", expected_revision: 2, edits: [{ old_text: "a", new_text: "b" }] }))
      .toEqual({ file: "main.lua", expectedRevision: 2, edits: [{ oldText: "a", newText: "b" }] })
    expect(parseLuaFileEdit({ file: "project.json", expected_revision: 0, content: "{}" })).toEqual({ file: "project.json", expectedRevision: 0, content: "{}" })
    for (const file of ["README.md", "ui/bars.lua", "lib/util.v2.lua"]) expect(parseLuaFileEdit({ file, expected_revision: 1, content: "x" }).file).toBe(file)
    for (const bad of [null, {}, { file: "notes.txt", expected_revision: 1, content: "x" }, { file: "../main.lua", expected_revision: 1, content: "x" },
      { file: "ui/../main.lua", expected_revision: 1, content: "x" }, { file: "/main.lua", expected_revision: 1, content: "x" },
      { file: "docs/README.md", expected_revision: 1, content: "x" }, { file: "a".repeat(200) + ".lua", expected_revision: 1, content: "x" }, { file: "main.lua", content: "x" },
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

  it("edits README.md and names the files that exist when a .lua path is missing", () => {
    expect(applyLuaFileEdit(files, { file: "README.md", expectedRevision: 0, content: "# Panel" })).toEqual({ ...files, readme: "# Panel" })
    expect(() => applyLuaFileEdit(files, { file: "ui/bars.lua", expectedRevision: 0, content: "x" })).toThrow("ui/bars.lua is not in the working copy. It has project.json, README.md, main.lua.")
    expect(() => applyLuaFileEdit(files, { file: "toString.lua", expectedRevision: 0, content: "x" })).toThrow("not in the working copy")
    expect(workingCopyFiles(files)).toEqual({ "project.json": "{}\n", "README.md": "", "main.lua": files.lua })
  })
})
