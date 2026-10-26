import { describe, expect, it } from "vitest"
import { buildLuaDraftTar, parseLuaProposal } from "./draftAuthor"

const project = { kind: "panel" as const, name: "Example", slug: "example" }

function readEntries(bytes: Uint8Array) {
  const decoder = new TextDecoder()
  let offset = 0
  const entries: { name: string; content: string }[] = []
  while (bytes[offset] !== 0) {
    const header = bytes.subarray(offset, offset + 512)
    const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, "")
    const size = Number.parseInt(decoder.decode(header.subarray(124, 136)), 8)
    const checksum = Number.parseInt(decoder.decode(header.subarray(148, 156)), 8)
    const copy = header.slice()
    copy.fill(32, 148, 156)
    expect(copy.reduce((sum, byte) => sum + byte, 0)).toBe(checksum)
    expect(header[156]).toBe(48)
    entries.push({ name, content: decoder.decode(bytes.subarray(offset + 512, offset + 512 + size)) })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  expect(bytes.subarray(offset).every(byte => byte === 0)).toBe(true)
  expect(bytes.length - offset).toBe(1024)
  return entries
}

describe("Lua draft author", () => {
  it("only accepts a bounded structured source proposal", () => {
    expect(parseLuaProposal('{"main_lua":"return {}"}')).toBe("return {}")
    for (const text of ["```lua\nreturn {}\n```", '{"main_lua":"x","manifest":{}}',
      '{"main_lua":42}', '{"main_lua":""}', JSON.stringify({ main_lua: "x".repeat(65537) }),
      JSON.stringify({ main_lua: "x\0y" })]) {
      expect(() => parseLuaProposal(text)).toThrow()
    }
  })

  it("builds deterministic bounded USTAR with owner metadata and only two files", async () => {
    const first = buildLuaDraftTar(project, "return {}")
    const second = buildLuaDraftTar(project, "return {}")
    expect(first.type).toBe("application/x-tar")
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(await second.arrayBuffer()))
    const entries = readEntries(new Uint8Array(await first.arrayBuffer()))
    expect(entries.map(entry => entry.name)).toEqual(["project.json", "main.lua"])
    expect(JSON.parse(entries[0].content)).toEqual({ manifest_version: 1, kind: "panel", name: "Example", slug: "example", entrypoint: "main.lua", capabilities: ["ui"], streams: [], assets: [] })
    expect(entries[1].content).toBe("return {}")
    expect(() => buildLuaDraftTar({ ...project, kind: "guide" }, "return {} ")).toThrow()
    expect(() => buildLuaDraftTar(project, "x".repeat(65537))).toThrow()
  })
})
