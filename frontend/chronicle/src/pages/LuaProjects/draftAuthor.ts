import type { LuaProject } from "./api"

const encoder = new TextEncoder()
const maxSourceBytes = 64 * 1024
const maxTarBytes = 8 * 1024 * 1024

/** Model output is a proposal, never an archive or an executable artifact. */
export function parseLuaProposal(text: string): string {
  if (encoder.encode(text).length > 256 * 1024) throw new Error("AI response exceeds the draft limit.")
  let value: unknown
  try { value = JSON.parse(text.trim()) } catch { throw new Error("AI did not return a valid JSON Lua proposal.") }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 1 || !("main_lua" in value) ||
    typeof value.main_lua !== "string") {
    throw new Error("AI proposal must contain only a main_lua string.")
  }
  validateSource(value.main_lua)
  return value.main_lua
}

function validateSource(source: string): Uint8Array {
  const bytes = encoder.encode(source)
  if (bytes.length === 0 || bytes.length > maxSourceBytes || source.includes("\0")) {
    throw new Error("Lua source must be nonempty, NUL-free, and at most 64 KiB.")
  }
  return bytes
}

function octal(header: Uint8Array, offset: number, width: number, value: number) {
  const text = value.toString(8).padStart(width - 1, "0")
  if (text.length !== width - 1) throw new Error("Tar field overflow.")
  header.set(encoder.encode(`${text}\0`), offset)
}

function tarEntry(name: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(512)
  header.set(encoder.encode(name), 0)
  octal(header, 100, 8, 0o644)
  octal(header, 108, 8, 0)
  octal(header, 116, 8, 0)
  octal(header, 124, 12, data.length)
  octal(header, 136, 12, 0)
  header.fill(32, 148, 156)
  header[156] = 48 // regular file, USTAR
  header.set(encoder.encode("ustar\0"), 257)
  header.set(encoder.encode("00"), 263)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  octal(header, 148, 8, checksum)
  const entry = new Uint8Array(512 + Math.ceil(data.length / 512) * 512)
  entry.set(header)
  entry.set(data, 512)
  return entry
}

/** Exactly two fixed-path regular files, stable metadata and zero-padded USTAR blocks. */
export function buildLuaDraftTar(project: Pick<LuaProject, "kind" | "name" | "slug">, source: string): File {
  if (project.kind !== "panel") throw new Error("AI authoring is only available for panels.")
  const lua = validateSource(source)
  const manifest = encoder.encode(JSON.stringify({
    manifest_version: 1, kind: "panel", name: project.name, slug: project.slug,
    entrypoint: "main.lua", capabilities: ["ui"], streams: [], assets: [],
  }))
  if (manifest.length > 32 * 1024) throw new Error("Manifest exceeds the server limit.")
  const entries = [tarEntry("project.json", manifest), tarEntry("main.lua", lua)]
  const size = entries.reduce((sum, entry) => sum + entry.length, 1024)
  if (size > maxTarBytes) throw new Error("Tar exceeds the server limit.")
  const archive = new Uint8Array(size)
  let offset = 0
  for (const entry of entries) { archive.set(entry, offset); offset += entry.length }
  return new File([archive], "lua-draft.tar", { type: "application/x-tar" })
}
