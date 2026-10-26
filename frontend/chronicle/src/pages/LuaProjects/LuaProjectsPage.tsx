import { useEffect, useState, type FormEvent } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, ArrowUpRight, FileArchive, FlaskConical, Package, Plus, ShieldCheck } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { createProject, getProject, listProjects, promoteStable, publicPackageURL, publishUnstable, uploadDraft, type LuaProject, type LuaProjectKind } from "./api"

import { LuaDraftPreview } from "./LuaDraftPreview"
import { LuaDraftAuthor } from "./LuaDraftAuthor"

const card = "rounded-xl border border-border/80 bg-card p-5 shadow-sm"
const button = "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again."
}

export function LuaProjectsPage() {
  const [projects, setProjects] = useState<LuaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [kind, setKind] = useState<LuaProjectKind>("panel")
  const { data: session, isLoading: sessionLoading } = useSession()
  const createPermission = useAuthorizationCheck({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: !!session })
  const canCreate = createPermission.data?.createLuaProject === true

  useEffect(() => {
    if (sessionLoading) return
    if (!session) { setProjects([]); setLoading(false); return }
    let active = true
    listProjects().then(items => { if (active) setProjects(items) }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, sessionLoading])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    setBusy(true)
    setError("")
    try {
      const project = await createProject(kind, name.trim(), slug.trim())
      setProjects(items => [project, ...items])
      setName("")
      setSlug("")
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return <main className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
    <header className="border-b pb-7">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Creator workspace / Lua</p>
      <h1 className="text-3xl font-semibold tracking-tight">Lua projects</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Keep a private draft, share an unstable release for testing, then promote exactly the version you tested.</p>
    </header>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_19rem]">
      <section aria-label="Your projects" className="space-y-3">
        <h2 className="text-lg font-semibold">Your projects</h2>
        {loading ? <p className="text-sm text-muted-foreground">Loading projects…</p> : projects.length === 0 ? <p className={card}>No projects yet. Create one to begin.</p> : projects.map(project =>
          <Link key={project.id} to={`/lua-projects/${encodeURIComponent(project.id)}`} className={`${card} group flex items-center justify-between gap-4 hover:border-primary/50`}>
            <div><span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{project.kind} · r{project.revision}</span><h3 className="mt-1 font-semibold">{project.name}</h3><p className="font-mono text-xs text-muted-foreground">/{project.slug}</p></div>
            <ArrowUpRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
          </Link>) }
      </section>
      {canCreate ? <form onSubmit={create} className={`${card} h-fit space-y-4`}>
        <div className="flex items-center gap-2"><Plus className="size-4" /><h2 className="font-semibold">New project</h2></div>
        <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>
        <label className="block text-sm font-medium">Slug<input className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono" value={slug} onChange={event => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required /><span className="mt-1 block text-xs text-muted-foreground">Lowercase letters, numbers and hyphens.</span></label>
        <label className="block text-sm font-medium">Kind<select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={kind} onChange={event => setKind(event.target.value as LuaProjectKind)}><option value="panel">Panel</option><option value="guide">Guide</option></select></label>
        <button className={button} disabled={busy} type="submit">{busy ? "Creating…" : "Create project"}</button>
      </form> : <div className={`${card} h-fit text-sm`}>
        {sessionLoading || (session && createPermission.isPending) ? <p>Checking project creation permission…</p> :
          <p role="alert" className="text-destructive">{!session ? "Sign in to create Lua projects." :
            createPermission.isError ? "Could not check project creation permission. Please try again." :
              "You do not have permission to create Lua projects. Ask a technical administrator for the Lua Project Author role."}</p>}
      </div>}
    </div>
  </main>
}

export function LuaProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<LuaProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [archive, setArchive] = useState<File | null>(null)
  const [testedSha, setTestedSha] = useState("")

  useEffect(() => {
    if (!projectId) return
    let active = true
    getProject(projectId).then(value => { if (active) setProject(value) }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  async function mutate(action: () => Promise<unknown>, message: string) {
    if (!projectId) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
      setProject(await getProject(projectId))
      setNotice(message)
    } catch (e) {
      setError(errorMessage(e))
      // Conflicts must refresh revision before retry, never blindly reuse an old revision.
      if (e instanceof Error && "status" in e && e.status === 409) {
        getProject(projectId).then(setProject).catch(() => {})
      }
    } finally { setBusy(false) }
  }

  if (!projectId) return <p role="alert">Missing project ID.</p>
  if (loading) return <main className="container mx-auto px-4 py-10">Loading project…</main>
  if (!project) return <main className="container mx-auto px-4 py-10"><Link to="/lua-projects">← Projects</Link><p role="alert">{error || "Project not found."}</p></main>

  const unstableLink = project.unstable ? publicPackageURL(project.id, project.unstable.sha256) : ""
  return <main className="container mx-auto max-w-5xl space-y-7 px-4 py-10">
    <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/lua-projects"><ArrowLeft className="size-4" /> All projects</Link>
    <header className="border-b pb-6"><p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{project.kind} / {project.slug} / revision {project.revision}</p><h1 className="mt-2 text-3xl font-semibold">{project.name}</h1></header>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}{error.includes("revision") && " Reload the project before retrying."}</p>}
    {notice && <p role="status" className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">{notice}</p>}
    {project.kind === "panel" && <LuaDraftAuthor key={`${project.id}:${project.revision}`} project={project} onUploaded={async success => { setProject(await getProject(project.id)); if (success) setNotice("Private draft uploaded. It has not been tested or published."); else setError("Revision changed. Generate and review a new proposal before retrying.") }} />}
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={`${card} space-y-4`}><div className="flex items-center gap-2"><FileArchive className="size-5" /><h2 className="font-semibold">01 / Draft</h2></div>
        <p className="text-sm text-muted-foreground">Upload an uncompressed tar with project.json at its root and a Lua entrypoint. The server validates the archive. Uploading replaces the draft at this revision.</p>
        <label className="block text-sm font-medium">Tar archive<input type="file" accept=".tar,application/x-tar" className="mt-2 block w-full text-sm" onChange={event => setArchive(event.target.files?.[0] ?? null)} /></label>
        <button className={button} type="button" disabled={busy || !archive} onClick={() => { if (archive) void mutate(() => uploadDraft(project.id, project.revision, archive), "Draft uploaded. Review the new revision before publishing.") }}>Upload draft</button>
        {project.draft_sha256 && <p className="break-all font-mono text-xs text-muted-foreground">Draft SHA-256: {project.draft_sha256}</p>}
      </section>
      <section className={`${card} space-y-4`}><div className="flex items-center gap-2"><FlaskConical className="size-5" /><h2 className="font-semibold">02 / Preview</h2></div>
        <div className="rounded-lg border border-dashed bg-muted/20 p-5">
          {project.kind !== "panel" ? <p className="text-sm text-muted-foreground">Guide preview is not available yet.</p>
            : project.draft_sha256 ? <LuaDraftPreview projectId={project.id} draftHash={project.draft_sha256} />
            : <p className="text-sm text-muted-foreground">Upload a draft to preview it in the sandboxed panel host.</p>}
        </div>
      </section>
      <section className={`${card} space-y-4`}><div className="flex items-center gap-2"><Package className="size-5" /><h2 className="font-semibold">03 / Unstable</h2></div>
        <p className="text-sm text-muted-foreground">Publish a test build. Only you will find it in the instance panel selector; the release URL remains accessible to anyone with the link.</p>
        <button type="button" className={button} disabled={busy || !project.draft_sha256} onClick={() => { if (window.confirm("Publish this draft to the public unstable channel?")) void mutate(() => publishUnstable(project.id, project.revision), "Unstable release published.") }}>Publish unstable</button>
        {project.unstable?.sha256 && <div className="space-y-1 text-xs"><p className="break-all font-mono text-muted-foreground">SHA-256: {project.unstable?.sha256}</p><a href={unstableLink} className="inline-flex items-center gap-1 text-primary underline" target="_blank" rel="noopener noreferrer">Public unstable package <ArrowUpRight className="size-3" /></a><p className="break-all font-mono text-muted-foreground">Panel reference: lua:{project.id}:unstable</p></div>}
      </section>
      <section className={`${card} space-y-4`}><div className="flex items-center gap-2"><ShieldCheck className="size-5" /><h2 className="font-semibold">04 / Stable</h2></div>
        <p className="text-sm text-muted-foreground">Promote only the unstable SHA-256 you tested in the real runtime. Test event-driven behavior from an installed Unstable panel before promotion.</p>
        <label className="block text-sm font-medium">Tested unstable SHA-256<input className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" value={testedSha} onChange={event => setTestedSha(event.target.value.trim().toLowerCase())} placeholder={project.unstable?.sha256 ?? "64 hexadecimal characters"} pattern="[a-f0-9]{64}" /></label>
        <button type="button" className={button} disabled={busy || !project.unstable?.sha256 || testedSha !== project.unstable?.sha256} onClick={() => { if (window.confirm(`Promote tested release ${testedSha} to stable?`)) void mutate(() => promoteStable(project.id, project.revision, testedSha), "Stable release promoted.") }}>Promote tested release</button>
        {project.stable?.sha256 && <a href={publicPackageURL(project.id, project.stable.sha256)} className="block break-all font-mono text-xs text-primary underline">Stable package · {project.stable?.sha256}</a>}
      </section>
    </div>
  </main>
}
