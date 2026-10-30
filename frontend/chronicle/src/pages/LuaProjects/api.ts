/** Lua project (module) API. The browser never evaluates package contents. */
import type { ModuleAuthor, InferenceContributorUsage, LuaProjectContributor, LuaProjectPermissions, LuaProjectQuota } from "@/api/typesGenerated"
export type LuaProjectKind = "panel" | "guide"
/** A tagged snapshot of main. Only the newest few keep their files; older ones are listed with available false. */
export type LuaRelease = { tag: string; sha256?: string; available: boolean; icon?: string; published_at: string; published_by?: string; published_by_author?: string }
/** The module's latest saved source. Anyone who can view the module can run it. */
export type LuaMain = { sha256: string; icon?: string; updated_at: string }
export type LuaProject = {
  id: string
  owner_id: string
  kind: LuaProjectKind
  name: string
  slug: string
  revision: number
  /** A short summary for lists and the module page, up to DESCRIPTION_MAX characters. Set outside the manifest. */
  description: string
  /** The owner's module author name; the project's address is /modules/<author>/<slug> once it is set. */
  author?: string
  /** Flavor tags the module needs; sites missing any of them leave it out of listings. */
  flavor?: string[]
  main?: LuaMain
  /** Newest first. */
  releases: LuaRelease[]
  /** People tracking the module; `starred` says whether the viewer is one. Owners always are. */
  stars: number
  starred: boolean
  created_at: string
  updated_at: string
}

/** What panels run by default: the newest release that still has its files. */
export function latestRelease(project: Pick<LuaProject, "releases">): LuaRelease | undefined {
  return project.releases.find(release => release.available)
}

/** A panel's build to run: the latest release, or main for people testing changes. */
export type LuaChannel = "release" | "main"

export function channelSha(project: Pick<LuaProject, "releases" | "main">, channel: LuaChannel): string | undefined {
  return channel === "main" ? project.main?.sha256 : latestRelease(project)?.sha256
}

const base = "/api/v1/me/lua-projects"

export class LuaProjectError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; detail?: string } | null
    throw new LuaProjectError(body?.detail ?? body?.message ?? `Request failed (${response.status})`, response.status)
  }
  if (response.status === 204) return null as T
  return response.json() as Promise<T>
}

export async function listProjects(): Promise<LuaProject[]> {
  const data = await request<LuaProject[] | { projects: LuaProject[] }>(base)
  return Array.isArray(data) ? data : data.projects
}

export function getProjectQuota(): Promise<LuaProjectQuota> {
  return request<LuaProjectQuota>(`${base}/quota`)
}

export async function getProject(id: string): Promise<LuaProject> {
  return request<LuaProject>(`${base}/${encodeURIComponent(id)}`)
}

/** The longest module description, in characters (code points, as the server counts them). */
export const DESCRIPTION_MAX = 300

export async function setDescription(id: string, description: string): Promise<LuaProject> {
  return updateProject(id, { description })
}

/** Saves the module's settings. Leaving out flavor keeps its tags. */
export async function updateProject(id: string, settings: { description: string; flavor?: string[] }): Promise<LuaProject> {
  return request<LuaProject>(`${base}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  })
}

export async function createProject(kind: LuaProjectKind, name: string, slug: string): Promise<LuaProject> {
  return request<LuaProject>(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, name, slug }),
  })
}

export function deleteProject(id: string): Promise<void> {
  return request<void>(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function uploadDraft(id: string, revision: number, archive: File): Promise<void> {
  const response = await fetch(`${base}/${encodeURIComponent(id)}/draft?expected_revision=${revision}`, {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/x-tar" }, body: archive,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; detail?: string } | null
    throw new LuaProjectError(body?.detail ?? body?.message ?? `Upload failed (${response.status})`, response.status)
  }
}

/** Tags the current main. Releases need the release permission; only the newest few keep files. */
export function createRelease(id: string, revision: number, tag: string): Promise<LuaProject> {
  return request<LuaProject>(`${base}/${encodeURIComponent(id)}/releases`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag, expected_revision: revision }),
  })
}

export function deleteRelease(id: string, tag: string): Promise<LuaProject> {
  return request<LuaProject>(`${base}/${encodeURIComponent(id)}/releases/${encodeURIComponent(tag)}`, { method: "DELETE" })
}

/** Modules the user tracks: what their instance panel picker offers. */
export function listStarredProjects(): Promise<LuaProject[]> {
  return request<LuaProject[]>(`${base}/starred`)
}

export function setStarred(id: string, starred: boolean): Promise<{ stars: number; starred: boolean }> {
  return request(`${base}/${encodeURIComponent(id)}/star`, { method: starred ? "PUT" : "DELETE" })
}

export async function getPublicProject(id: string, channel: LuaChannel, signal?: AbortSignal): Promise<LuaProject> {
  return request<LuaProject>(`/api/v1/lua-projects/${encodeURIComponent(id)}?channel=${channel}`, { signal, cache: "no-store" })
}

export function publicPackageURL(id: string, hash: string): string {
  return `/api/v1/lua-projects/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(hash)}/package`
}

export type { LuaProjectContributor, LuaProjectPermissions }
export type LuaContributorPermission = "edit" | "release"
/** A module with what the viewer may do with it. */
export type LuaProjectPage = { project: LuaProject; permissions: LuaProjectPermissions }

/** The module's address: /modules/<author>/<slug>, or /modules/id/<id> until its owner claims an author name. */
export function modulePath(project: Pick<LuaProject, "id" | "author" | "slug">, suffix = ""): string {
  const base = project.author ? `${authorPath(project.author)}/${encodeURIComponent(project.slug)}` : `/modules/id/${encodeURIComponent(project.id)}`
  return base + suffix
}

/** An author's modules: /modules/<author>. */
export function authorPath(author: string): string {
  return `/modules/${encodeURIComponent(author)}`
}

export type AuthorPage = { author: string; projects: LuaProject[] }

export function getAuthorPage(author: string, signal?: AbortSignal): Promise<AuthorPage> {
  return request<AuthorPage>(`/api/v1/modules/${encodeURIComponent(author)}`, { signal, cache: "no-store" })
}

/** Released modules anyone may use, newest release first. */
export function listPublicProjects(signal?: AbortSignal): Promise<LuaProject[]> {
  return request<LuaProject[]>("/api/v1/lua-projects", { signal })
}

/** New author names: 5-32 lowercase letters, digits and single hyphens. The server also reserves some names. */
export const MIN_AUTHOR_NAME = 5
export function validAuthorName(name: string): boolean {
  return name.length >= MIN_AUTHOR_NAME && name.length <= 32 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)
}

export function getProjectPage(id: string, signal?: AbortSignal): Promise<LuaProjectPage> {
  return request<LuaProjectPage>(`/api/v1/lua-projects/${encodeURIComponent(id)}/page`, { signal, cache: "no-store" })
}

export function getProjectPageByPath(author: string, slug: string, signal?: AbortSignal): Promise<LuaProjectPage> {
  return request<LuaProjectPage>(`/api/v1/modules/${encodeURIComponent(author)}/${encodeURIComponent(slug)}`, { signal, cache: "no-store" })
}

/** The caller's author name, or null before they claim one. */
/** The caller's author name, or null before they claim one (204). */
export async function getMyAuthor(): Promise<string | null> {
  return (await request<ModuleAuthor | null>("/api/v1/me/module-author"))?.name ?? null
}

/** The caller's username as a free author name, or "" when none fits. */
export async function suggestAuthor(): Promise<string> {
  return (await request<ModuleAuthor>("/api/v1/me/module-author/suggestion")).name
}

export async function claimAuthor(name: string): Promise<string> {
  return (await request<ModuleAuthor>("/api/v1/me/module-author", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  })).name
}

export function listContributors(id: string): Promise<LuaProjectContributor[]> {
  return request<LuaProjectContributor[]>(`${base}/${encodeURIComponent(id)}/contributors`)
}

export function putContributor(id: string, author: string, permissions: LuaContributorPermission[]): Promise<LuaProjectContributor[]> {
  return request<LuaProjectContributor[]>(`${base}/${encodeURIComponent(id)}/contributors/${encodeURIComponent(author)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions }),
  })
}

export function removeContributor(id: string, author: string): Promise<LuaProjectContributor[]> {
  return request<LuaProjectContributor[]>(`${base}/${encodeURIComponent(id)}/contributors/${encodeURIComponent(author)}`, { method: "DELETE" })
}

/** Each person's AI assistant usage on the module. Needs edit access and AI features. */
export function getContributorUsage(id: string): Promise<InferenceContributorUsage[]> {
  return request<InferenceContributorUsage[]>(`/api/v1/inference/usage/lua-project/${encodeURIComponent(id)}/contributors`)
}

/** Cleans what someone is typing into an author name or slug field, keeping a trailing hyphen mid-word. */
export function urlNameInput(value: string, max = 32): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, max)
}

/** Turns a display name into an author name or slug suggestion: lowercase letters, digits and single hyphens. */
export function urlName(value: string, max = 32): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "")
}

/** Suggests the next tag after the newest release: v1.2 becomes v1.3, 7 becomes 8, otherwise v1. */
export function nextReleaseTag(releases: readonly Pick<LuaRelease, "tag">[]): string {
  const match = /^(.*?)(\d+)$/.exec(releases[0]?.tag ?? "")
  if (!match) return releases.length ? `${releases[0].tag}-2` : "v1"
  return `${match[1]}${Number(match[2]) + 1}`
}
