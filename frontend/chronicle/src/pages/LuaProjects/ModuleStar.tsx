import { useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Star } from "lucide-react"
import { useSession } from "@/api/queries"
import { setStarred, type LuaProject } from "./api"
import { errorMessage } from "./moduleUi"

/**
 * Star to track a module: tracked panel modules are offered on the instance page. Owners always track
 * their own, so their button only shows the count. Signed-out visitors are sent to sign in.
 */
export function ModuleStar({ project, canUse }: { project: LuaProject; canUse: boolean }) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [state, setState] = useState({ stars: project.stars, starred: project.starred })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const owner = session?.user_id === project.owner_id
  const shape = "inline-flex items-center overflow-hidden rounded-md border text-sm font-medium"
  const label = state.starred ? "Tracking" : "Track"
  const icon = <Star className={`size-4 ${state.starred ? "fill-amber-300 text-amber-300" : ""}`} />
  const count = <span className="border-l border-border px-2.5 py-2 tabular-nums text-muted-foreground" aria-label={`${state.stars} stars`}>{state.stars.toLocaleString()}</span>

  async function toggle() {
    const previous = state, next = !state.starred
    setBusy(true); setError("")
    setState({ stars: state.stars + (next ? 1 : -1), starred: next })
    try {
      setState(await setStarred(project.id, next))
      // The instance page's panel picker lists tracked modules.
      void queryClient.invalidateQueries({ queryKey: ["lua-panel-catalog"] })
    } catch (e) {
      setState(previous); setError(errorMessage(e))
    } finally { setBusy(false) }
  }

  if (!session) return <Link to={`/login?from=${encodeURIComponent(window.location.pathname)}`} className={`${shape} border-border hover:bg-accent`} title="Sign in to track this module">
    <span className="inline-flex items-center gap-2 px-3 py-2">{icon} Track</span>{count}</Link>
  return <div className="flex flex-col items-end gap-1">
    <button type="button" onClick={() => void toggle()} disabled={busy || owner || !canUse} aria-pressed={state.starred}
      title={owner ? "Owners always track their own modules" : state.starred ? "Stop tracking: it leaves your instance panel picker" : "Track it: it appears in your instance panel picker"}
      className={`${shape} ${state.starred ? "border-amber-300/40 bg-amber-300/10" : "border-border"} enabled:hover:bg-accent disabled:cursor-default`}>
      <span className="inline-flex items-center gap-2 px-3 py-2">{icon} {label}</span>{count}
    </button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
