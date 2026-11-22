import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Globe, Info } from "lucide-react"
import { useSession } from "@/api/queries"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { latestRelease, updateProject, type LuaProject } from "./api"
import { errorMessage, smallButton } from "./moduleUi"

/** Header badge for editors: whether the module is in the discovery gallery. */
export function PublishedBadge({ published }: { published: boolean }) {
  return published
    ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-xs font-normal text-primary"><Globe className="size-3" /> Published</span>
    : <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">Unpublished</span>
}

/**
 * The About sidebar's discovery setting. Publishing opts into the gallery; it never changes public access to a
 * module. Editors see the state; only the owner can change it. Visitors see nothing.
 */
export function ModulePublishing({ project, canEdit, onSaved }: { project: LuaProject; canEdit: boolean; onSaved: () => void }) {
  const { data: session } = useSession()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const owner = session?.user_id === project.owner_id
  if (!canEdit) return null

  async function toggle() {
    setBusy(true); setError("")
    try {
      await updateProject(project.id, { description: project.description, published: !project.published })
      onSaved()
      await Promise.all(["public-modules", "my-modules", "module-author-page"].map(key => client.invalidateQueries({ queryKey: [key] })))
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return <div className="text-xs">
    <div className="flex items-center gap-1 text-muted-foreground">
      Discovery
      <HintTooltip>
        <TooltipTrigger asChild><button type="button" aria-label="About discovery" className="hover:text-foreground"><Info className="size-3" /></button></TooltipTrigger>
        <TooltipContent className="max-w-64">Published modules appear in the module gallery. Every module stays public either way: anyone with the link can open, track and run it.</TooltipContent>
      </HintTooltip>
      {owner && <button type="button" className={`${smallButton} ml-auto`} disabled={busy} onClick={() => void toggle()}>
        {busy ? "Saving…" : project.published ? "Unpublish" : "Publish"}
      </button>}
    </div>
    <p className={`mt-1 ${project.published ? "text-foreground" : "text-muted-foreground"}`}>{project.published ? "In the module gallery" : "Not in the gallery. It is still public by link."}</p>
    {!latestRelease(project) && <p className={`mt-1 ${project.published ? "text-amber-500" : "text-muted-foreground"}`}>It also needs a release with files to appear. Tag one from Releases.</p>}
    {!owner && <p className="mt-1 text-muted-foreground">Only the owner can change this.</p>}
    {error && <p role="alert" className="mt-1 text-destructive">{error}</p>}
  </div>
}
