import { useState, type FormEvent } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { ArrowLeft, Plus } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { addonPath, createProject, DESCRIPTION_MAX, getMyAuthor, setDescription, urlName } from "./api"
import { useQuery } from "@tanstack/react-query"
import { button, card, errorMessage, kindLabel, primaryButton } from "./addonUi"

/** /addons/new: a dedicated page to create an addon, with its own address and an optional description. */
export function NewAddonPage() {
  const { data: session, isLoading: sessionLoading } = useSession()
  const authorQuery = useQuery({ queryKey: ["addon-author", session?.user_id], enabled: !!session, queryFn: getMyAuthor })
  const permission = useAuthorizationCheck({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: !!session })
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const slug = urlName(name, 80)
  const [description, setDraftDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const descriptionLength = [...description.trim()].length

  // Claiming an author name happens on /addons, before an addon can be created.
  if (!sessionLoading && (!session || (authorQuery.isSuccess && authorQuery.data === null))) return <Navigate to="/addons" replace />
  const author = authorQuery.data

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    try {
      // Guides are hidden as a new addon kind for now; existing guide addons still work.
      const project = await createProject("panel", name.trim(), slug.trim())
      if (description.trim()) await setDescription(project.id, description.trim())
      navigate(addonPath(project, "/edit"))
    } catch (e) { setError(errorMessage(e)); setBusy(false) }
  }

  return <main className="container mx-auto max-w-2xl space-y-8 px-4 py-10">
    <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to={author ? `/addons/${encodeURIComponent(author)}` : "/addons"}>
      <ArrowLeft className="size-4" /> Back to your addons</Link>
    <header className="border-b pb-7">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Addon Workshop</p>
      <h1 className="text-3xl font-semibold tracking-tight">New addon</h1>
      <p className="mt-2 text-sm text-muted-foreground">Give it a name and an address. You can build it in the Workshop right after.</p>
    </header>
    {permission.data?.createLuaProject !== true ? <div className={`${card} text-sm`}>
      {sessionLoading || !author || permission.isPending ? <p>Checking addon creation permission…</p> :
        <p role="alert" className="text-destructive">{permission.isError ? "Could not check addon creation permission. Please try again." :
          "You do not have permission to create addons. Ask a technical administrator for the Addon Author role."}</p>}
    </div> : <form onSubmit={create} className={`${card} space-y-4`}>
      <fieldset className="min-w-0 space-y-4">
        <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} maxLength={120} required autoFocus
          onChange={event => setName(event.target.value)} /></label>
        <label className="block text-sm font-medium">Type
          <select className="mt-1 w-full rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground disabled:cursor-not-allowed" value="panel" disabled aria-label="Type">
            <option value="panel">{kindLabel("panel")}</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">More addon types are coming soon.</span></label>
        <label className="block text-sm font-medium">Address
          <span className="mt-1 flex items-center rounded-md border bg-muted/40 font-mono text-sm text-muted-foreground">
            <span className="shrink-0 pl-3">/addons/{author}/</span>
            <input className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-foreground outline-none" value={slug} readOnly aria-label="Address" tabIndex={-1} />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">Follows the name. Unique among your addons.</span></label>
        <label className="block text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span>
          <textarea className="mt-1 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm" rows={3} value={description} maxLength={DESCRIPTION_MAX * 2}
            placeholder="What does this addon show? One or two sentences." onChange={event => setDraftDescription(event.target.value)} />
          <span className={`mt-1 block text-right text-xs tabular-nums ${descriptionLength > DESCRIPTION_MAX ? "text-destructive" : "text-muted-foreground"}`}>{descriptionLength}/{DESCRIPTION_MAX}</span></label>
        <div className="flex gap-2">
          <button className={primaryButton} disabled={busy || !slug || descriptionLength > DESCRIPTION_MAX} type="submit"><Plus className="size-4" />{busy ? "Creating…" : "Create addon"}</button>
          <Link to={author ? `/addons/${encodeURIComponent(author)}` : "/addons"} className={button}>Cancel</Link>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </form>}
  </main>
}
