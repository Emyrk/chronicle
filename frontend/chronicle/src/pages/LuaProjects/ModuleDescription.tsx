import { useState, type FormEvent } from "react"
import { Pencil } from "lucide-react"
import { DESCRIPTION_MAX, setDescription, type LuaProject } from "./api"
import { errorMessage, smallButton } from "./moduleUi"

/** The module's short description. People who may release the module can edit it in place. */
/** Descriptions are plain text; bare http(s) links become real links. */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => index % 2 === 1
    ? <a key={index} href={part} target="_blank" rel="noreferrer nofollow" className="text-primary underline-offset-2 hover:underline">{part.replace(/^https?:\/\//, "")}</a>
    : part)
}

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

  if (draft !== null) return <form onSubmit={save} className="max-w-3xl space-y-2">
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
  return <p className="group max-w-3xl text-[15px] leading-relaxed text-foreground/85">
    {project.description ? linkify(project.description) : <span className="italic text-muted-foreground">No description yet.</span>}
    {canEdit && <button type="button" onClick={() => setDraft(project.description)} title="Edit description"
      className="ml-2 inline-flex items-center gap-1 rounded p-0.5 align-middle text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
      <Pencil className="size-3.5" />{!project.description && "Add a description"}<span className="sr-only">{project.description ? "Edit" : ""}</span></button>}
  </p>
}
