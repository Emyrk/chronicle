/** Owner-scoped Lua project API. The browser never evaluates package contents. */
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
