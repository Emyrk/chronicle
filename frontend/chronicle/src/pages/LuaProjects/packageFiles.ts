import { unzip, type Unzipped } from "fflate"
import { inspectArchive, normalizeExtractedFiles } from "../Guides/package/archive"
import { publicPackageURL, type LuaProject } from "./api"

/** Which build of an addon the page is showing. */
export type PackageRef = "stable" | "unstable" | "draft"
export type PackageFile = { path: string; bytes: Uint8Array }

export const PACKAGE_REFS: readonly PackageRef[] = ["stable", "unstable", "draft"]

export function packageSha(project: Pick<LuaProject, "stable" | "unstable" | "draft_sha256">, ref: PackageRef): string | null {
  return ref === "draft" ? project.draft_sha256 : project[ref]?.sha256 ?? null
}

/** The released build people install, else the newest build that exists. */
export function defaultRef(project: Pick<LuaProject, "stable" | "unstable" | "draft_sha256">): PackageRef | null {
  return PACKAGE_REFS.find(ref => packageSha(project, ref)) ?? null
}

export function packageDownloadURL(project: Pick<LuaProject, "id">, ref: PackageRef, sha: string): string {
  return ref === "draft" ? `/api/v1/me/lua-projects/${encodeURIComponent(project.id)}/draft/${encodeURIComponent(sha)}/package` : publicPackageURL(project.id, sha)
}

/** Lists a package ZIP's files for display. Nothing in it is executed. README.md sorts first, like a repository. */
export async function readPackageFiles(bytes: Uint8Array): Promise<PackageFile[]> {
  const index = inspectArchive(bytes.slice())
  const expanded = await new Promise<Unzipped>((resolve, reject) => unzip(bytes.slice(), (error, result) => error ? reject(error) : resolve(result)))
  const files = [...normalizeExtractedFiles(index, expanded)].map(([path, data]) => ({ path, bytes: data }))
  return files.sort((a, b) => Number(b.path === "README.md") - Number(a.path === "README.md") || a.path.localeCompare(b.path))
}

export type ManifestSummary = { streams: string[]; capabilities: string[]; streamScope: string; maxEvents?: number }

/** Reads the fields the About box shows; tolerant, because older or invalid drafts still deserve a file listing. */
export function manifestSummary(files: readonly PackageFile[]): ManifestSummary | null {
  const manifest = files.find(file => file.path === "project.json")
  if (!manifest) return null
  try {
    const data = JSON.parse(new TextDecoder().decode(manifest.bytes)) as Record<string, unknown>
    const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
    return {
      streams: list(data.streams), capabilities: list(data.capabilities),
      streamScope: typeof data.stream_scope === "string" ? data.stream_scope : "selection",
      ...(typeof data.max_events === "number" && { maxEvents: data.max_events }),
    }
  } catch { return null }
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(path)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const shortSha = (sha: string) => sha.slice(0, 7)
