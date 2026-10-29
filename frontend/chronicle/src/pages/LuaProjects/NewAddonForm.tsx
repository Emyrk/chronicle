import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Sparkles } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { addonPath, createProject, urlName } from "./api"
import { errorMessage, primaryButton, welcomeBox } from "./addonUi"

/**
 * Step 2 of the new-user welcome on /addons: only the name is typed, the address follows it,
 * and creating opens the Workshop. Authors picking their own address use the Addon Workshop's /addons/new instead.
 */
export function NewAddonForm({ author }: { author: string }) {
  const { data: session, isLoading: sessionLoading } = useSession()
  const permission = useAuthorizationCheck({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: !!session })
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    try {
      // Guides are hidden as a new addon kind for now; existing guide addons still work.
      const project = await createProject("panel", name.trim(), slug.trim())
      navigate(addonPath(project, "/edit"))
    } catch (e) { setError(errorMessage(e)); setBusy(false) }
  }

  if (permission.data?.createLuaProject !== true) return <div className={`${welcomeBox} text-sm`}>
    {sessionLoading || permission.isPending ? <p>Checking addon creation permission…</p> :
      <p role="alert" className="text-destructive">{permission.isError ? "Could not check addon creation permission. Please try again." :
        "You do not have permission to create addons. Ask a technical administrator for the Addon Author role."}</p>}
  </div>

  return <form onSubmit={create} className={`${welcomeBox} space-y-4`}>
    <div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-violet-400/15 text-violet-300"><Sparkles className="size-3.5" /></span>
      <h2 className="font-semibold">Step 2: name your addon</h2></div>
    <fieldset className="min-w-0 space-y-4">
      <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} maxLength={120} required
        onChange={event => { setName(event.target.value); setSlug(urlName(event.target.value, 80)) }} /></label>
      {/* A first addon's address follows its name; afterwards authors may pick one, on /addons/new. */}
      <p className="break-all font-mono text-xs text-muted-foreground">/addons/{author}/<span className="text-foreground">{slug || "my-addon"}</span></p>
      <button className={`${primaryButton} w-full`} disabled={busy || !slug} type="submit">{busy ? "Creating…" : "Create and open the Workshop"}</button>
    </fieldset>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>
}
