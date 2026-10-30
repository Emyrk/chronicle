import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { modulePath, createProject, getProjectQuota, urlName } from "./api"
import { errorMessage, primaryButton, welcomeBox } from "./moduleUi"

/**
 * Step 2 of the new-user welcome on /modules: only the name is typed, the address follows it,
 * and creating opens the Workshop. Authors picking their own address use the Module Workshop's /modules/new instead.
 */
export function NewModuleForm({ author }: { author: string }) {
  const { data: session, isLoading: sessionLoading } = useSession()
  const permission = useAuthorizationCheck({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: !!session })
  const quota = useQuery({ queryKey: ["module-project-quota", session?.user_id], enabled: !!session, queryFn: getProjectQuota })
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    try {
      // Guides are hidden as a new module kind for now; existing guide modules still work.
      const project = await createProject("panel", name.trim(), slug.trim())
      await quota.refetch()
      navigate(modulePath(project, "/edit"))
    } catch (e) { setError(errorMessage(e)); setBusy(false) }
  }

  if (permission.data?.createLuaProject !== true) return <div className={`${welcomeBox} text-sm`}>
    {sessionLoading || permission.isPending ? <p>Checking module creation permission…</p> :
      <p role="alert" className="text-destructive">{permission.isError ? "Could not check module creation permission. Please try again." :
        "You need Revered or Exalted supporter status to create modules."}</p>}
  </div>

  if (quota.isPending) return <div className={`${welcomeBox} text-sm text-muted-foreground`}>Checking module resource limit…</div>
  if (quota.isError) return <div className={`${welcomeBox} text-sm text-destructive`} role="alert">Could not check your module resource limit. Please try again.</div>
  if (quota.data.owned >= quota.data.limit) return <div className={`${welcomeBox} space-y-2 text-sm`}>
    <h2 className="font-semibold">Module ownership limit</h2>
    <p>You own {quota.data.owned} of {quota.data.limit} modules.</p>
    <p className="text-xs text-muted-foreground">This limit keeps each account&apos;s use of shared storage and processing resources bounded. Delete a module before creating another.</p>
  </div>

  return <form onSubmit={create} className={`${welcomeBox} space-y-4`}>
    <div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-violet-400/15 text-violet-300"><Sparkles className="size-3.5" /></span>
      <h2 className="font-semibold">Step 2: name your module</h2></div>
    <p className="text-xs text-muted-foreground">{quota.data.owned} of {quota.data.limit} module slots used. The limit bounds shared storage and processing usage.</p>
    <fieldset className="min-w-0 space-y-4">
      <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} maxLength={120} required
        onChange={event => { setName(event.target.value); setSlug(urlName(event.target.value, 80)) }} /></label>
      {/* A first module's address follows its name; afterwards authors may pick one, on /modules/new. */}
      <p className="break-all font-mono text-xs text-muted-foreground">/modules/{author}/<span className="text-foreground">{slug || "my-module"}</span></p>
      <button className={`${primaryButton} w-full`} disabled={busy || !slug} type="submit">{busy ? "Creating…" : "Create and open the Workshop"}</button>
    </fieldset>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>
}
