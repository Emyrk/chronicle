import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, AtSign, Plus, Users } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { addonPath, claimAuthor, createProject, getMyAuthor, listProjects, urlName, urlNameInput, type LuaProject, type LuaProjectKind } from "./api"
import { AddonIcon } from "./AddonIcon"
import { button, card, errorMessage, kindLabel } from "./addonUi"

/** The caller's addon author name. Anyone signed in may claim one, so owners can share addons with them. */
function AuthorNameCard({ onClaimed }: { onClaimed: (name: string) => void }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function claim(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    try { onClaimed(await claimAuthor(name)) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <form onSubmit={claim} className={`${card} h-fit space-y-3`}>
    <div className="flex items-center gap-2"><AtSign className="size-4" /><h2 className="font-semibold">Claim your author name</h2></div>
    <p className="text-xs text-muted-foreground">Your addons live at /addons/&lt;author&gt;/&lt;addon&gt;, and owners share addons with you by this name. It cannot be changed later.</p>
    <label className="block text-sm font-medium">Author name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono" value={name}
      onChange={event => setName(urlNameInput(event.target.value))} placeholder="your-name" minLength={2} maxLength={32} required /></label>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <button className={button} disabled={busy || name.length < 2} type="submit">{busy ? "Claiming…" : "Claim name"}</button>
  </form>
}

export function LuaProjectsPage() {
  const [projects, setProjects] = useState<LuaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [kind, setKind] = useState<LuaProjectKind>("panel")
  const { data: session, isLoading: sessionLoading } = useSession()
  const createPermission = useAuthorizationCheck({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: !!session })
  const canCreate = createPermission.data?.createLuaProject === true
  const authorQuery = useQuery({ queryKey: ["addon-author", session?.user_id], enabled: !!session, queryFn: getMyAuthor })
  const author = authorQuery.data

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
      setSlugEdited(false)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return <main className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
    <header className="border-b pb-7">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Creator workspace / Addons</p>
      <h1 className="text-3xl font-semibold tracking-tight">Addons</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Build sandboxed Lua addons for Chronicle with the Addon Workshop. Keep a private draft, share an unstable release for testing, then promote exactly the version you tested.</p>
    </header>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_19rem]">
      <section aria-label="Your addons" className="space-y-3">
        <h2 className="text-lg font-semibold">Your addons</h2>
        {loading ? <p className="text-sm text-muted-foreground">Loading addons…</p> : projects.length === 0 ? <p className={card}>No addons yet. Create one to begin.</p> : projects.map(project =>
          <Link key={project.id} to={addonPath(project)} className={`${card} group flex items-center justify-between gap-4 hover:border-primary/50`}>
            <AddonIcon name={project.stable?.icon ?? project.unstable?.icon ?? project.draft_icon} className="size-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1"><span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{kindLabel(project.kind)} · r{project.revision}</span>
              <h3 className="mt-1 flex items-center gap-2 font-semibold">{project.name}
                {session && project.owner_id !== session.user_id && <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground"><Users className="size-3" /> Shared with you</span>}</h3>
              <p className="font-mono text-xs text-muted-foreground">{addonPath(project)}</p></div>
            <ArrowUpRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
          </Link>) }
      </section>
      <div className="space-y-4">
        {session && authorQuery.isSuccess && author === null &&
          <AuthorNameCard onClaimed={() => void authorQuery.refetch()} />}
        {canCreate ? <form onSubmit={create} className={`${card} h-fit space-y-4`}>
          <div className="flex items-center gap-2"><Plus className="size-4" /><h2 className="font-semibold">New addon</h2></div>
          <fieldset disabled={!author} className="space-y-4 disabled:opacity-60">
            <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} maxLength={120} required
              onChange={event => { setName(event.target.value); if (!slugEdited) setSlug(urlName(event.target.value, 80)) }} /></label>
            <label className="block text-sm font-medium">Address
              <span className="mt-1 flex items-center rounded-md border bg-background font-mono text-sm">
                <span className="shrink-0 pl-3 text-muted-foreground">/addons/{author ?? "you"}/</span>
                <input className="min-w-0 flex-1 bg-transparent py-2 pr-3 outline-none" value={slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required aria-label="Slug"
                  onChange={event => { setSlug(urlNameInput(event.target.value, 80)); setSlugEdited(true) }} />
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">Unique among your addons. Lowercase letters, numbers and hyphens.</span></label>
            <label className="block text-sm font-medium">Kind<select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={kind} onChange={event => setKind(event.target.value as LuaProjectKind)}><option value="panel">{kindLabel("panel")}</option><option value="guide">{kindLabel("guide")}</option></select></label>
            <button className={button} disabled={busy} type="submit">{busy ? "Creating…" : "Create addon"}</button>
          </fieldset>
          {!author && <p className="text-xs text-muted-foreground">Claim an author name first.</p>}
        </form> : <div className={`${card} h-fit text-sm`}>
          {sessionLoading || (session && createPermission.isPending) ? <p>Checking addon creation permission…</p> :
            <p role="alert" className="text-destructive">{!session ? "Sign in to create addons." :
              createPermission.isError ? "Could not check addon creation permission. Please try again." :
                "You do not have permission to create addons. Ask a technical administrator for the Addon Author role."}</p>}
        </div>}
      </div>
    </div>
  </main>
}
