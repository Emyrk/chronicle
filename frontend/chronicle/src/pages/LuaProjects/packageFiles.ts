import { unzip, type Unzipped } from "fflate"
import { inspectArchive, normalizeExtractedFiles } from "../Guides/package/archive"
import { latestRelease, publicPackageURL, type LuaProject } from "./api"

/** Which build of an addon the page is showing: "main" or a release tag. */
export type PackageRef = string
export type PackageFile = { path: string; bytes: Uint8Array }

export const MAIN_REF = "main"

/** The build's hash, or null when it does not exist or its files are gone. */
export function packageSha(project: Pick<LuaProject, "releases" | "main">, ref: PackageRef): string | null {
  if (ref === MAIN_REF) return project.main?.sha256 ?? null
  return project.releases.find(release => release.tag === ref && release.available)?.sha256 ?? null
}

/** The latest release people run, else main. */
export function defaultRef(project: Pick<LuaProject, "releases" | "main">): PackageRef | null {
  return latestRelease(project)?.tag ?? (project.main ? MAIN_REF : null)
}

/** Every build that can be browsed: main, then releases that still have files. */
export function browsableRefs(project: Pick<LuaProject, "releases" | "main">): PackageRef[] {
  return [...(project.main ? [MAIN_REF] : []), ...project.releases.filter(release => release.available).map(release => release.tag)]
}

/** Main and releases are both served by hash to anyone who can view the addon. */
export function packageDownloadURL(project: Pick<LuaProject, "id">, sha: string): string {
  return publicPackageURL(project.id, sha)
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

/** "5 minutes ago", "3 days ago", then a date; the exact time is in the tooltip. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const abs = Math.abs(seconds)
  if (abs < 60) return formatter.format(seconds, "second")
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), "minute")
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), "hour")
  if (abs < 30 * 86_400) return formatter.format(Math.round(seconds / 86_400), "day")
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}
