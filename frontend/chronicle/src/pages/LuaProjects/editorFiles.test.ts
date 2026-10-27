import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import { applySourceProposal, buildEditorTar, initialEditorFiles, panelPackageFromWorkingCopy, readLuaDraftZip, validateEditorFiles } from "./editorFiles"

const project = { kind: "panel" as const, name: "Example", slug: "example" }
const encoder = new TextEncoder()
const files = initialEditorFiles(project)

function zip(manifest = files.manifest, lua = files.lua, extra?: Record<string, Uint8Array>) {
  return zipSync({ "project.json": encoder.encode(manifest), "main.lua": encoder.encode(lua), ...extra }, { level: 0 })
}

function tarEntries(bytes: Uint8Array) {
  const decoder = new TextDecoder()
  const result: { name: string; content: string }[] = []
  let offset = 0
  while (bytes[offset] !== 0) {
    const header = bytes.slice(offset, offset + 512)
    const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, "")
    const size = parseInt(decoder.decode(header.subarray(124, 136)), 8)
    const checksum = parseInt(decoder.decode(header.subarray(148, 156)), 8)
    header.fill(32, 148, 156)
    expect(header.reduce((sum, byte) => sum + byte, 0)).toBe(checksum)
    result.push({ name, content: decoder.decode(bytes.subarray(offset + 512, offset + 512 + size)) })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  expect(bytes.length - offset).toBe(1024)
  expect(bytes.subarray(offset).every(byte => byte === 0)).toBe(true)
  return result
}

describe("Lua browser source model", () => {
  it("loads a validated private ZIP and deterministically exports upload TAR", async () => {
    const loaded = await readLuaDraftZip(zip(), project)
    expect(loaded).toEqual(files)
    const first = buildEditorTar(project, loaded)
    const second = buildEditorTar(project, loaded)
    expect(first.type).toBe("application/x-tar")
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(await second.arrayBuffer()))
    expect(tarEntries(new Uint8Array(await first.arrayBuffer()))).toEqual([
      { name: "project.json", content: files.manifest }, { name: "main.lua", content: files.lua },
    ])
  })

  it("rejects unsupported packages instead of silently dropping their files", async () => {
    await expect(readLuaDraftZip(zip(files.manifest, files.lua, { "extra.lua": encoder.encode("return 1") }), project)).rejects.toThrow("only")
    await expect(readLuaDraftZip(zip(files.manifest, files.lua, { "../evil.lua": encoder.encode("return 1") }), project)).rejects.toThrow()
    await expect(readLuaDraftZip(zip(files.manifest, files.lua, { "nested/main.lua": encoder.encode("return 1") }), project)).rejects.toThrow()
    await expect(readLuaDraftZip(new Uint8Array(8 * 1024 * 1024 + 1), project)).rejects.toThrow("8 MiB")
    await expect(readLuaDraftZip(zip(files.manifest, "x".repeat(65537)), project)).rejects.toThrow("limits")
    await expect(readLuaDraftZip(zip(files.manifest, "return 1", { "asset.png": encoder.encode("unsafe") }), project)).rejects.toThrow()
  })

  it("builds an in-memory preview package without server execution or dropped assets", () => {
    expect(panelPackageFromWorkingCopy(project, files)).toEqual({
      name: "Example", entrypoint: "main.lua", sources: { "main.lua": files.lua },
      capabilities: ["ui"], streams: [], streamScope: "selection", assets: new Map(),
    })
    const wholeInstance = JSON.stringify({ ...JSON.parse(files.manifest), stream_scope: "instance" })
    expect(panelPackageFromWorkingCopy(project, { ...files, manifest: wholeInstance }).streamScope).toBe("instance")
    expect(() => panelPackageFromWorkingCopy(project, { ...files, manifest: files.manifest.replace('"assets": []', '"assets": ["icon.png"]') })).toThrow()
  })

  it("accepts an AI working-copy proposal only at the captured local revision", () => {
    const proposal = { files: { ...files, lua: "return { title = 'New' }" }, expectedRevision: 4 }
    expect(applySourceProposal(files, 4, proposal)).toEqual(proposal.files)
    expect(applySourceProposal(files, 5, proposal)).toBeNull()
    expect(files.lua).not.toBe(proposal.files.lua)
  })

  it("validates manifest identity, schema, streams and bounded source before upload", () => {
    for (const manifest of ["{", "[]", JSON.stringify({ ...JSON.parse(files.manifest), slug: "other" }),
      JSON.stringify({ ...JSON.parse(files.manifest), assets: ["image.png"] }),
      JSON.stringify({ ...JSON.parse(files.manifest), streams: ["damage", "damage"] }),
      JSON.stringify({ ...JSON.parse(files.manifest), capabilities: ["network"] }),
      JSON.stringify({ ...JSON.parse(files.manifest), stream_scope: "everything" }),
      JSON.stringify({ ...JSON.parse(files.manifest), unexpected: true })]) {
      expect(() => validateEditorFiles(project, { ...files, manifest })).toThrow()
    }
    for (const lua of ["", "a\0b", "x".repeat(65537)]) expect(() => buildEditorTar(project, { ...files, lua })).toThrow()
    expect(() => buildEditorTar({ ...project, kind: "guide" }, files)).toThrow()
  })
})
