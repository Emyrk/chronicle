import { unzip, type Unzipped } from "fflate"
import { inspectArchive, normalizeExtractedFiles } from "./archive"
import { normalizePackagePath } from "./paths"
import { isReservedLuaPath } from "../runtime/trustedModules"
import { PANEL_STREAM_SCOPES, type PanelStream, type PanelStreamScope } from "../runtime/panelEvents"
import type { GuideCapability } from "../protocol/types"

export interface PanelPackage {
  name: string
  entrypoint: string
  sources: Record<string, string>
  streams: PanelStream[]
  /** project.json `stream_scope`; "selection" when omitted. */
  streamScope: PanelStreamScope
  capabilities: GuideCapability[]
  assets: ReadonlyMap<string, Uint8Array>
}

const decoder = new TextDecoder("utf-8", { fatal: true })
const STREAM_SET: ReadonlySet<string> = new Set(["damage"] satisfies PanelStream[])
const VALID_CAPS = new Set(["ui", "input"])

function names(value: unknown, label: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 64 || value.some((s) => typeof s !== "string") || new Set(value).size !== value.length) {
    throw new Error(`invalid ${label}`)
  }
  return value as string[]
}

function rasterAsset(path: string, bytes: Uint8Array): boolean {
  if (bytes.byteLength > 2 * 1024 * 1024) return false
  if (path.endsWith(".png")) return bytes.byteLength >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return bytes.byteLength >= 3 &&
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (path.endsWith(".webp")) return bytes.byteLength >= 12 &&
    decoder.decode(bytes.subarray(0, 4)) === "RIFF" && decoder.decode(bytes.subarray(8, 12)) === "WEBP"
  return false
}

export async function loadPanelPackage(bytes: Uint8Array): Promise<PanelPackage> {
  const archive = bytes.slice()
  const index = inspectArchive(archive)
  const expanded = await new Promise<Unzipped>((resolve, reject) => unzip(archive, (error, result) => error ? reject(error) : resolve(result)))
  const files = normalizeExtractedFiles(index, expanded)
  const manifestBytes = files.get("project.json")
  if (!manifestBytes) throw new Error("missing project.json")
  const manifest: unknown = JSON.parse(decoder.decode(manifestBytes))
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("invalid project.json")
  const data = manifest as Record<string, unknown>
  if (data.manifest_version !== 1 || data.kind !== "panel" || typeof data.name !== "string" || !data.name.trim() ||
      typeof data.entrypoint !== "string") throw new Error("invalid panel manifest")
  const entrypoint = normalizePackagePath(data.entrypoint)
  if (!entrypoint.endsWith(".lua") || isReservedLuaPath(entrypoint.toLowerCase())) throw new Error("invalid panel entrypoint")
  const capabilities = names(data.capabilities, "capabilities")
  if (capabilities.some((cap) => !VALID_CAPS.has(cap))) throw new Error("unsupported panel capability")
  const streams = names(data.streams, "streams")
  if (streams.some((stream) => !STREAM_SET.has(stream))) throw new Error("unsupported panel stream")
  const streamScope = data.stream_scope ?? "selection"
  if (!PANEL_STREAM_SCOPES.includes(streamScope as PanelStreamScope)) throw new Error("unsupported panel stream scope")
  const assets = names(data.assets, "assets").map((asset) => normalizePackagePath(asset))
  const assetSet = new Set(assets)
  if (assetSet.size !== assets.length) throw new Error("duplicate panel asset")
  if (!files.has(entrypoint)) throw new Error("panel entrypoint not found")
  const sources: Record<string, string> = Object.create(null)
  const assetFiles = new Map<string, Uint8Array>()
  for (const [path, content] of files) {
    if (isReservedLuaPath(path.toLowerCase())) throw new Error("reserved Chronicle module path")
    if (path.endsWith(".lua")) sources[path] = decoder.decode(content)
    else if (assetSet.has(path)) {
      if (path === "project.json" || path.endsWith(".lua") || !rasterAsset(path, content)) throw new Error("invalid panel asset")
      assetFiles.set(path, content.slice())
    } else if (path !== "project.json") throw new Error(`undeclared panel file: ${path}`)
  }
  if (assetFiles.size !== assets.length) throw new Error("missing panel asset")
  return { name: data.name, entrypoint, sources, streams: streams as PanelStream[], streamScope: streamScope as PanelStreamScope, capabilities: capabilities as GuideCapability[], assets: assetFiles }
}
