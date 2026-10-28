import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, Plus, Sparkles, Users } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { addonPath, latestRelease, createProject, getMyAuthor, listProjects, urlName, urlNameInput, type LuaProject, type LuaProjectKind } from "./api"
import { AddonIcon } from "./AddonIcon"
import { AddonWelcome, ClaimAuthorForm, SignInPrompt, welcomeBox } from "./AddonWelcome"
import { button, card, errorMessage, kindLabel, primaryButton } from "./addonUi"

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
  const navigate = useNavigate()
  // Newcomers get the welcome until their first addon exists: sign in, claim a name, then create.
  const welcome = !sessionLoading && (!session || (authorQuery.isSuccess && (author === null || (!loading && !error && projects.length === 0))))

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
      // A first addon goes straight to the Workshop, which is where step 2 happens.
      if (welcome) { navigate(`${addonPath(project)}/edit`); return }
      setProjects(items => [project, ...items])
      setName("")
      setSlug("")
      setSlugEdited(false)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  // Inside the welcome, the form is step 2 and uses the welcome's lighter box.
  const panelBox = welcome ? welcomeBox : `${card} h-fit`
  const createPanel = canCreate ? <form onSubmit={create} className={`${panelBox} space-y-4`}>
    <div className="flex items-center gap-2">{welcome ? <span className="flex size-6 items-center justify-center rounded-full bg-violet-400/15 text-violet-300"><Sparkles className="size-3.5" /></span> : <Plus className="size-4" />}<h2 className="font-semibold">{welcome ? "Step 2: name your addon" : "New addon"}</h2></div>
    <fieldset disabled={!author} className="min-w-0 space-y-4 disabled:opacity-60">
      <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} maxLength={120} required
        onChange={event => { setName(event.target.value); if (!slugEdited) setSlug(urlName(event.target.value, 80)) }} /></label>
      {/* A first addon's address follows its name; the regular form lets authors pick one. */}
      {welcome ? <p className="break-all font-mono text-xs text-muted-foreground">/addons/{author}/<span className="text-foreground">{slug || "my-addon"}</span></p> :
      <label className="block text-sm font-medium">Address
        <span className="mt-1 flex items-center rounded-md border bg-background font-mono text-sm">
          <span className="shrink-0 pl-3 text-muted-foreground">/addons/{author ?? "you"}/</span>
          <input className="min-w-0 flex-1 bg-transparent py-2 pr-3 outline-none" value={slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required aria-label="Slug"
            onChange={event => { setSlug(urlNameInput(event.target.value, 80)); setSlugEdited(true) }} />
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">Unique among your addons. Lowercase letters, numbers and hyphens.</span></label>}
      <label className="block text-sm font-medium">Kind<select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={kind} onChange={event => setKind(event.target.value as LuaProjectKind)}><option value="panel">{kindLabel("panel")}</option><option value="guide">{kindLabel("guide")}</option></select></label>
      <button className={welcome ? `${primaryButton} w-full` : button} disabled={busy || !slug} type="submit">{busy ? "Creating…" : welcome ? "Create and open the Workshop" : "Create addon"}</button>
    </fieldset>
    {!author && <p className="text-xs text-muted-foreground">Claim an author name first.</p>}
  </form> : <div className={`${panelBox} text-sm`}>
    {sessionLoading || (session && createPermission.isPending) ? <p>Checking addon creation permission…</p> :
      <p role="alert" className="text-destructive">{!session ? "Sign in to create addons." :
        createPermission.isError ? "Could not check addon creation permission. Please try again." :
          "You do not have permission to create addons. Ask a technical administrator for the Addon Author role."}</p>}
  </div>

  return <main className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
    <header className="border-b pb-7">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Creator workspace / Addons</p>
      <h1 className="text-3xl font-semibold tracking-tight">Addons</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Build sandboxed Lua addons for Chronicle with the Addon Workshop. Save your work to main, try it on real raids, then tag a release when it is ready for everyone.</p>
    </header>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {welcome ? <AddonWelcome step={!session || !author ? 0 : 1} author={author ?? undefined}>
      {!session ? <SignInPrompt /> : !author ? <ClaimAuthorForm onClaimed={() => void authorQuery.refetch()} /> : createPanel}
    </AddonWelcome> : <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_19rem]">
      <section aria-label="Your addons" className="space-y-3">
        <h2 className="text-lg font-semibold">Your addons</h2>
        {loading ? <p className="text-sm text-muted-foreground">Loading addons…</p> : projects.length === 0 ? <p className={card}>No addons yet. Create one to begin.</p> : projects.map(project =>
          <Link key={project.id} to={addonPath(project)} className={`${card} group flex items-center justify-between gap-4 hover:border-primary/50`}>
            <AddonIcon name={latestRelease(project)?.icon ?? project.main?.icon} className="size-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1"><span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{kindLabel(project.kind)} · r{project.revision}</span>
              <h3 className="mt-1 flex items-center gap-2 font-semibold">{project.name}
                {session && project.owner_id !== session.user_id && <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground"><Users className="size-3" /> Shared with you</span>}</h3>
              <p className="font-mono text-xs text-muted-foreground">{addonPath(project)}</p></div>
            <ArrowUpRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
          </Link>) }
      </section>
      <div className="space-y-4">
        {createPanel}
      </div>
    </div>}
  </main>
}
