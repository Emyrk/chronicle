import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Sparkles } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { addonPath, createProject, urlName, urlNameInput, type LuaProject } from "./api"
import { button, card, errorMessage, primaryButton, welcomeBox } from "./addonUi"

/**
 * Creates an addon for `author`. As a newcomer's first addon (`first`) it is step 2 of the welcome:
 * only the name is typed, the address follows it, and creating opens the Workshop.
 */
export function NewAddonForm({ author, first = false, onCreated }: { author: string; first?: boolean; onCreated?: (project: LuaProject) => void }) {
  const { data: session, isLoading: sessionLoading } = useSession()
  const permission = useAuthorizationCheck({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: !!session })
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const box = first ? welcomeBox : `${card} h-fit`

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    try {
      // Guides are hidden as a new addon kind for now; existing guide addons still work.
      const project = await createProject("panel", name.trim(), slug.trim())
      if (first) { navigate(addonPath(project, "/edit")); return }
      onCreated?.(project)
      setName(""); setSlug(""); setSlugEdited(false)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  if (permission.data?.createLuaProject !== true) return <div className={`${box} text-sm`}>
    {sessionLoading || permission.isPending ? <p>Checking addon creation permission…</p> :
      <p role="alert" className="text-destructive">{permission.isError ? "Could not check addon creation permission. Please try again." :
        "You do not have permission to create addons. Ask a technical administrator for the Addon Author role."}</p>}
  </div>

  return <form onSubmit={create} className={`${box} space-y-4`}>
    <div className="flex items-center gap-2">{first ? <span className="flex size-6 items-center justify-center rounded-full bg-violet-400/15 text-violet-300"><Sparkles className="size-3.5" /></span> : <Plus className="size-4" />}
      <h2 className="font-semibold">{first ? "Step 2: name your addon" : "New addon"}</h2></div>
    <fieldset className="min-w-0 space-y-4">
      <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} maxLength={120} required
        onChange={event => { setName(event.target.value); if (!slugEdited) setSlug(urlName(event.target.value, 80)) }} /></label>
      {/* A first addon's address follows its name; afterwards authors may pick one. */}
      {first ? <p className="break-all font-mono text-xs text-muted-foreground">/addons/{author}/<span className="text-foreground">{slug || "my-addon"}</span></p> :
        <label className="block text-sm font-medium">Address
          <span className="mt-1 flex items-center rounded-md border bg-background font-mono text-sm">
            <span className="shrink-0 pl-3 text-muted-foreground">/addons/{author}/</span>
            <input className="min-w-0 flex-1 bg-transparent py-2 pr-3 outline-none" value={slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required aria-label="Slug"
              onChange={event => { setSlug(urlNameInput(event.target.value, 80)); setSlugEdited(true) }} />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">Unique among your addons. Lowercase letters, numbers and hyphens.</span></label>}
      <button className={first ? `${primaryButton} w-full` : button} disabled={busy || !slug} type="submit">{busy ? "Creating…" : first ? "Create and open the Workshop" : "Create addon"}</button>
    </fieldset>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>
}
