import { unzip, type Unzipped } from "fflate"
import { inspectArchive, normalizeExtractedFiles } from "../Guides/package/archive"
import type { PanelPackage } from "../Guides/package/panelLoader"
import { PANEL_STREAM_SCOPES, type PanelStreamScope } from "../Guides/runtime/panelEvents"
import type { LuaProject } from "./api"

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })
const maxZipBytes = 8 * 1024 * 1024
const maxLuaBytes = 64 * 1024
const maxManifestBytes = 32 * 1024

export type EditorFiles = { manifest: string; lua: string }

/** Only the two files this editor can round-trip are accepted. Never discard an unseen file on save. */
export async function readLuaDraftZip(bytes: Uint8Array, project: Pick<LuaProject, "kind" | "name" | "slug">): Promise<EditorFiles> {
  if (bytes.byteLength > maxZipBytes) throw new Error("Draft ZIP exceeds 8 MiB.")
  const index = inspectArchive(bytes.slice())
  if (index.entries.length !== 2 || index.entries.some(entry =>
    (entry.path !== "project.json" && entry.path !== "main.lua") || entry.path !== entry.archivePath)) {
    throw new Error("This editor supports drafts containing only project.json and main.lua. Download and edit other packages locally.")
  }
  const expanded = await new Promise<Unzipped>((resolve, reject) => unzip(bytes.slice(), (error, result) => error ? reject(error) : resolve(result)))
  const files = normalizeExtractedFiles(index, expanded)
  const manifest = files.get("project.json")
  const lua = files.get("main.lua")
  if (!manifest || !lua) throw new Error("Draft is missing project.json or main.lua.")
  if (manifest.length > maxManifestBytes || lua.length > maxLuaBytes) throw new Error("Draft source exceeds the editor limits.")
  const result = { manifest: decoder.decode(manifest), lua: decoder.decode(lua) }
  validateEditorFiles(project, result)
  return result
}

export function initialEditorFiles(project: Pick<LuaProject, "kind" | "name" | "slug">): EditorFiles {
  return {
    manifest: JSON.stringify({ manifest_version: 1, kind: project.kind, name: project.name, slug: project.slug,
      entrypoint: "main.lua", capabilities: ["ui"], streams: [], assets: [] }, null, 2) + "\n",
    lua: "-- Write your addon here\nreturn {}\n",
  }
}

function assertStringList(value: unknown, allowed: readonly string[], label: string) {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !allowed.includes(item)) ||
    new Set(value).size !== value.length) throw new Error(`Invalid ${label} in project.json.`)
}

/** Mirrors the upload contract for the deliberately limited two-file editor. */
export function validateEditorFiles(project: Pick<LuaProject, "kind" | "name" | "slug">, files: EditorFiles): void {
  if (project.kind !== "panel") throw new Error("The browser editor currently supports panel projects only.")
  if (!files.lua || files.lua.includes("\0") || encoder.encode(files.lua).length > maxLuaBytes) {
    throw new Error("main.lua must be nonempty, NUL-free, and at most 64 KiB.")
  }
  if (encoder.encode(files.manifest).length > maxManifestBytes) throw new Error("project.json exceeds 32 KiB.")
  let parsed: unknown
  try { parsed = JSON.parse(files.manifest) } catch { throw new Error("project.json must contain valid JSON.") }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("project.json must be an object.")
  const manifest = parsed as Record<string, unknown>
  const fields = ["manifest_version", "kind", "name", "slug", "entrypoint", "capabilities", "streams", "stream_scope", "max_events", "assets"]
  if (Object.keys(manifest).some(key => !fields.includes(key)) || manifest.manifest_version !== 1 ||
    manifest.kind !== project.kind || manifest.name !== project.name || manifest.slug !== project.slug ||
    manifest.entrypoint !== "main.lua") {
    throw new Error("project.json must match this project's kind, name and slug, use manifest_version 1 and main.lua, with no unknown fields.")
  }
  assertStringList(manifest.capabilities, ["ui", "input"], "capabilities")
  assertStringList(manifest.streams, ["damage"], "streams")
  if (manifest.stream_scope !== undefined && !PANEL_STREAM_SCOPES.includes(manifest.stream_scope as PanelStreamScope)) {
    throw new Error(`stream_scope in project.json must be one of: ${PANEL_STREAM_SCOPES.join(", ")}.`)
  }
  if (manifest.max_events !== undefined && (typeof manifest.max_events !== "number" || !Number.isSafeInteger(manifest.max_events) || manifest.max_events < 1)) {
    throw new Error("max_events in project.json must be a positive integer.")
  }
  assertStringList(manifest.assets, [], "assets")
}

function octal(header: Uint8Array, offset: number, width: number, value: number) {
  const text = value.toString(8).padStart(width - 1, "0")
  if (text.length !== width - 1) throw new Error("Tar field overflow.")
  header.set(encoder.encode(`${text}\0`), offset)
}

function entry(name: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(512)
  header.set(encoder.encode(name))
  octal(header, 100, 8, 0o644)
  octal(header, 108, 8, 0)
  octal(header, 116, 8, 0)
  octal(header, 124, 12, data.length)
  octal(header, 136, 12, 0)
  header.fill(32, 148, 156)
  header[156] = 48
  header.set(encoder.encode("ustar\0"), 257)
  header.set(encoder.encode("00"), 263)
  octal(header, 148, 8, header.reduce((sum, byte) => sum + byte, 0))
  const result = new Uint8Array(512 + Math.ceil(data.length / 512) * 512)
  result.set(header)
  result.set(data, 512)
  return result
}

export function panelPackageFromWorkingCopy(project: Pick<LuaProject, "kind" | "name" | "slug">, files: EditorFiles): PanelPackage {
  validateEditorFiles(project, files)
  const manifest = JSON.parse(files.manifest) as { capabilities: ("ui" | "input")[]; streams: "damage"[]; stream_scope?: PanelStreamScope; max_events?: number }
  // Validation above guarantees this is a two-file, asset-free panel package.
  return {
    name: project.name, entrypoint: "main.lua", sources: { "main.lua": files.lua },
    capabilities: manifest.capabilities, streams: manifest.streams, streamScope: manifest.stream_scope ?? "selection",
    ...(manifest.max_events !== undefined && { maxEvents: manifest.max_events }),
    assets: new Map<string, Uint8Array>(),
  }
}

/** Replaces working-copy files only if nothing changed since the proposal was made. Validation is reported, not enforced. */
export function applySourceProposal(files: EditorFiles, revision: number, proposal: { files: EditorFiles; expectedRevision: number }): EditorFiles | null {
  if (proposal.expectedRevision !== revision) return null
  return { ...files, ...proposal.files }
}

/** Stable USTAR metadata and entry order; the archive is never executed in the browser. */
export function buildEditorTar(project: Pick<LuaProject, "kind" | "name" | "slug">, files: EditorFiles): File {
  validateEditorFiles(project, files)
  const entries = [entry("project.json", encoder.encode(files.manifest)), entry("main.lua", encoder.encode(files.lua))]
  const result = new Uint8Array(entries.reduce((sum, part) => sum + part.length, 1024))
  if (result.length > maxZipBytes) throw new Error("Tar exceeds 8 MiB.")
  let offset = 0
  for (const part of entries) { result.set(part, offset); offset += part.length }
  return new File([result], "lua-draft.tar", { type: "application/x-tar" })
}
