import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSession } from "@/api/queries"
import { latestRelease, updateProject, type LuaProject } from "./api"
import { errorMessage, smallButton } from "./moduleUi"

/** Publishing opts into discovery. It never changes public access to a module. */
export function ModulePublishing({ project, onSaved }: { project: LuaProject; onSaved: () => void }) {
  const { data: session } = useSession()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const owner = session?.user_id === project.owner_id

  async function toggle() {
    setBusy(true); setError("")
    try {
      await updateProject(project.id, { description: project.description, published: !project.published })
      onSaved()
      await Promise.all(["public-modules", "my-modules", "module-author-page"].map(key => client.invalidateQueries({ queryKey: [key] })))
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return <div className="mt-3 text-xs text-muted-foreground">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2 py-0.5 ${project.published ? "border-primary/40 text-primary" : "border-border"}`}>
        {project.published ? "Published" : "Unpublished"}
      </span>
      {owner && <button type="button" className={smallButton} disabled={busy} onClick={() => void toggle()}>
        {busy ? "Saving…" : project.published ? "Unpublish" : "Publish to discovery"}
      </button>}
    </div>
    <p className="mt-1.5">All modules are public, even when unpublished. Publishing opts into discovery.</p>
    {owner && !latestRelease(project) && <p className="mt-1">A release with available files is also required to appear in discovery.</p>}
    {error && <p role="alert" className="mt-1.5 text-destructive">{error}</p>}
  </div>
}
