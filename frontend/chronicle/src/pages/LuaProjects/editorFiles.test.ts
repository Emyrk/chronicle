import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import { createGuideRuntime } from "../Guides/runtime/runtime"
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
    const loaded = await readLuaDraftZip(zip(files.manifest, files.lua, { "README.md": encoder.encode(files.readme) }), project)
    expect(loaded).toEqual(files)
    const first = buildEditorTar(project, loaded)
    const second = buildEditorTar(project, loaded)
    expect(first.type).toBe("application/x-tar")
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(await second.arrayBuffer()))
    expect(tarEntries(new Uint8Array(await first.arrayBuffer()))).toEqual([
      { name: "project.json", content: files.manifest }, { name: "main.lua", content: files.lua }, { name: "README.md", content: files.readme },
    ])
  })

  it("accepts a listed icon and rejects any other", () => {
    const withIcon = (icon: unknown) => ({ ...files, manifest: JSON.stringify({ ...JSON.parse(files.manifest), icon }) })
    expect(() => validateEditorFiles(project, withIcon("heart-pulse"))).not.toThrow()
    expect(() => validateEditorFiles(project, withIcon("HeartPulse"))).toThrow(/Unknown icon/)
    expect(() => validateEditorFiles(project, withIcon(7))).toThrow(/Unknown icon/)
  })

  it("treats README.md as optional", async () => {
    expect(files.readme).toContain("# Example")
    const withoutReadme = await readLuaDraftZip(zip(), project)
    expect(withoutReadme.readme).toBe("")
    expect(tarEntries(new Uint8Array(await buildEditorTar(project, withoutReadme).arrayBuffer())).map(entry => entry.name)).toEqual(["project.json", "main.lua"])
    expect(() => validateEditorFiles(project, { ...files, readme: "x".repeat(64 * 1024 + 1) })).toThrow("README.md")
    await expect(readLuaDraftZip(zip(files.manifest, files.lua, { "docs/README.md": encoder.encode("# x") }), project)).rejects.toThrow("only")
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
    const wholeInstance = JSON.stringify({ ...JSON.parse(files.manifest), stream_scope: "instance", max_events: 2_000_000 })
    expect(panelPackageFromWorkingCopy(project, { ...files, manifest: wholeInstance })).toMatchObject({ streamScope: "instance", maxEvents: 2_000_000 })
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
      JSON.stringify({ ...JSON.parse(files.manifest), max_events: 0 }),
      JSON.stringify({ ...JSON.parse(files.manifest), max_events: "100" }),
      JSON.stringify({ ...JSON.parse(files.manifest), unexpected: true })]) {
      expect(() => validateEditorFiles(project, { ...files, manifest })).toThrow()
    }
    for (const lua of ["", "a\0b", "x".repeat(65537)]) expect(() => buildEditorTar(project, { ...files, lua })).toThrow()
    expect(() => buildEditorTar({ ...project, kind: "guide" }, files)).toThrow()
  })

  it("starts new modules with a hello-world panel that runs as is", () => {
    validateEditorFiles(project, files)
    const manifest = JSON.parse(files.manifest) as { capabilities: ("ui" | "input")[] }
    const runtime = createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": files.lua }, capabilities: manifest.capabilities, panelStreams: [] })
    const texts = [...runtime.start()].filter(op => op.op === "set").map(op => (op as { props: { text?: string } }).props.text).filter(Boolean)
    runtime.stop()
    expect(texts).toEqual(["Hello, world!", "Edit main.lua, then press Run preview to see your changes."])
    expect(files.readme).toContain("main.lua")
  })
})
