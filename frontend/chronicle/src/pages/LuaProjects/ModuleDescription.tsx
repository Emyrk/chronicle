import { useState, type FormEvent } from "react"
import { Pencil } from "lucide-react"
import { DESCRIPTION_MAX, setDescription, type LuaProject } from "./api"
import { errorMessage, smallButton } from "./moduleUi"

/** The module's short description. People who may release the module can edit it in place. */
export function ModuleDescription({ project, canEdit, onSaved }: { project: LuaProject; canEdit: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // The server counts code points, so an emoji is one character, not two.
  const length = draft === null ? 0 : [...draft.trim()].length

  async function save(event: FormEvent) {
    event.preventDefault()
    if (draft === null) return
    setBusy(true); setError("")
    try {
      await setDescription(project.id, draft)
      setDraft(null)
      onSaved()
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  if (draft !== null) return <form onSubmit={save} className="mt-3 max-w-2xl space-y-2">
    <textarea className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm" rows={3} value={draft} autoFocus
      aria-label="Description" placeholder="What does this module show? One or two sentences." onChange={event => setDraft(event.target.value)} />
    <div className="flex items-center gap-2">
      <button type="submit" className={smallButton} disabled={busy || length > DESCRIPTION_MAX}>{busy ? "Saving…" : "Save"}</button>
      <button type="button" className={smallButton} disabled={busy} onClick={() => { setDraft(null); setError("") }}>Cancel</button>
      <span className={`ml-auto text-xs tabular-nums ${length > DESCRIPTION_MAX ? "text-destructive" : "text-muted-foreground"}`}>{length}/{DESCRIPTION_MAX}</span>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>

  if (!project.description && !canEdit) return null
  return <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
    {project.description || <span className="italic">No description yet.</span>}
    {canEdit && <button type="button" onClick={() => setDraft(project.description)} className="ml-2 inline-flex items-center gap-1 align-middle text-xs text-primary hover:underline">
      <Pencil className="size-3" />{project.description ? "Edit" : "Add a description"}</button>}
  </p>
}
