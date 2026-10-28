/** Lua project (addon) API. The browser never evaluates package contents. */
import type { AddonAuthor, InferenceContributorUsage, LuaProjectContributor, LuaProjectPermissions } from "@/api/typesGenerated"
export type LuaProjectKind = "panel" | "guide"
/** icon is the release's project.json "icon", absent when it named none. */
export type LuaRelease = { sha256: string; published_at: string; published_by: string; icon?: string }
export type LuaProject = {
  id: string
  owner_id: string
  kind: LuaProjectKind
  name: string
  slug: string
  revision: number
  /** The owner's addon author name; the project's address is /addons/<author>/<slug> once it is set. */
  author?: string
  draft_sha256: string | null
  draft_icon?: string
  unstable: LuaRelease | null
  stable: LuaRelease | null
  created_at: string
  updated_at: string
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
  return response.json() as Promise<T>
}

export async function listProjects(): Promise<LuaProject[]> {
  const data = await request<LuaProject[] | { projects: LuaProject[] }>(base)
  return Array.isArray(data) ? data : data.projects
}

export async function getProject(id: string): Promise<LuaProject> {
  return request<LuaProject>(`${base}/${encodeURIComponent(id)}`)
}

export async function createProject(kind: LuaProjectKind, name: string, slug: string): Promise<LuaProject> {
  return request<LuaProject>(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, name, slug }),
  })
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

export function publishUnstable(id: string, revision: number): Promise<unknown> {
  return request(`${base}/${encodeURIComponent(id)}/unstable`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_revision: revision }),
  })
}

export function promoteStable(id: string, revision: number, testedSha256: string): Promise<unknown> {
  return request(`${base}/${encodeURIComponent(id)}/stable`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_revision: revision, tested_sha256: testedSha256 }),
  })
}

export async function getPublicProject(id: string, channel: "stable" | "unstable", signal?: AbortSignal): Promise<LuaProject> {
  return request<LuaProject>(`/api/v1/lua-projects/${encodeURIComponent(id)}?channel=${channel}`, { signal, cache: "no-store" })
}

export function publicPackageURL(id: string, hash: string): string {
  return `/api/v1/lua-projects/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(hash)}/package`
}

export type { LuaProjectContributor, LuaProjectPermissions }
export type LuaContributorPermission = "edit" | "publish_unstable" | "publish"
/** An addon as the viewer may see it. The draft and unstable release are present only with edit access. */
export type LuaProjectPage = { project: LuaProject; permissions: LuaProjectPermissions }

/** The addon's address: /addons/<author>/<slug>, or /addons/<id> until its owner claims an author name. */
export function addonPath(project: Pick<LuaProject, "id" | "author" | "slug">, suffix = ""): string {
  const base = project.author ? `/addons/${encodeURIComponent(project.author)}/${encodeURIComponent(project.slug)}` : `/addons/${encodeURIComponent(project.id)}`
  return base + suffix
}

export function getProjectPage(id: string, signal?: AbortSignal): Promise<LuaProjectPage> {
  return request<LuaProjectPage>(`/api/v1/lua-projects/${encodeURIComponent(id)}/page`, { signal, cache: "no-store" })
}

export function getProjectPageByPath(author: string, slug: string, signal?: AbortSignal): Promise<LuaProjectPage> {
  return request<LuaProjectPage>(`/api/v1/addons/${encodeURIComponent(author)}/${encodeURIComponent(slug)}`, { signal, cache: "no-store" })
}

/** The caller's author name, or null before they claim one. */
export async function getMyAuthor(): Promise<string | null> {
  try { return (await request<AddonAuthor>("/api/v1/me/addon-author")).name }
  catch (error) { if (error instanceof LuaProjectError && error.status === 404) return null; throw error }
}

export async function claimAuthor(name: string): Promise<string> {
  return (await request<AddonAuthor>("/api/v1/me/addon-author", {
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

/** Each person's AI assistant usage on the addon. Needs edit access and AI features. */
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
