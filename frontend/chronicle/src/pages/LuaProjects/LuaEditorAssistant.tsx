import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useInferencePermission } from "@/features/chat/api"
import { runAgUi } from "@/features/chat/client"
import { useInferenceSelection } from "@/features/chat/useInferenceSelection"
import type { LuaProject } from "./api"
import { buildLuaEditMessage, createLuaEditResponse, isLuaEditCurrent, type LuaEditSnapshot } from "./aiEditorEdits"

const LuaDiffReview = lazy(() => import("./LuaDiffReview").then(module => ({ default: module.LuaDiffReview })))

export type LuaEditorAssistantProps = {
  project: LuaProject
  source: string
  revisionToken: string | number
  /** Update only the unsaved working copy. Keep previousSource available for editor undo. */
  onApply: (nextSource: string, previousSource: string) => void
}

const button = "rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"

export function LuaEditorAssistant({ project, source, revisionToken, onApply }: LuaEditorAssistantProps) {
  const { session, isAuthenticated } = useAuth()
  const permission = useInferencePermission(isAuthenticated)
  const selection = useInferenceSelection(session?.user_id, isAuthenticated && permission.allowed)
  const [instruction, setInstruction] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [lastEdit, setLastEdit] = useState<{ before: string; after: string } | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const current = useRef<LuaEditSnapshot>({ source, revisionToken, projectId: project.id, projectRevision: project.revision })
  const apply = useRef(onApply)
  current.current = { source, revisionToken, projectId: project.id, projectRevision: project.revision }
  apply.current = onApply
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (!permission.allowed || !isAuthenticated) controller.current?.abort() }, [permission.allowed, isAuthenticated])

  if (project.kind !== "panel" || !isAuthenticated || !permission.allowed) return null

  async function edit() {
    if (controller.current || !selection.connectionId || !selection.modelId) return
    const snapshot = current.current
    let message: string
    try { message = buildLuaEditMessage(snapshot.source, instruction, project.name) }
    catch (e) { setError(e instanceof Error ? e.message : "Invalid AI edit request."); return }
    const abort = new AbortController()
    controller.current = abort
    setWorking(true)
    setError("")
    setNotice("")
    setLastEdit(null)
    setReviewOpen(false)
    const response = createLuaEditResponse()
    let finished = false
    try {
      await runAgUi({
        url: "/api/v1/inference/runs", signal: abort.signal,
        body: {
          run_id: crypto.randomUUID(), assistant_id: "lua-project-author",
          connection_id: selection.connectionId, model: selection.modelId,
          messages: [{ role: "user", content: message }],
        },
        onEvent: event => {
          if (event.type === "TEXT_MESSAGE_CONTENT") response.append(event.delta)
          if (event.type === "RUN_ERROR") throw new Error(event.message)
          if (event.type === "RUN_FINISHED") finished = true
        },
      })
      if (abort.signal.aborted) return
      if (!finished) throw new Error("AI response did not finish.")
      const proposal = response.proposal()
      if (!isLuaEditCurrent(snapshot, current.current)) {
        setError("The working copy changed while AI was editing. The stale proposal was discarded; request a new edit.")
        return
      }
      if (proposal === snapshot.source) { setNotice("AI returned the same source; nothing changed."); return }
      apply.current(proposal, snapshot.source)
      setLastEdit({ before: snapshot.source, after: proposal })
      setNotice("AI edit applied to the unsaved working copy. Review the changes before saving; use editor undo to revert.")
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "AI edit failed.")
      else setError("AI edit cancelled. The working copy was not changed.")
    } finally {
      if (controller.current === abort) { controller.current = null; setWorking(false) }
    }
  }

  return <section className="space-y-3 rounded-xl border border-border/80 bg-card p-4" aria-label="AI Lua editor assistant">
    <h3 className="font-semibold">Edit working copy with AI</h3>
    <p className="text-sm text-muted-foreground">Uses your connected AI provider. AI output is untrusted Lua, never run, uploaded or published here. An edit replaces only the unsaved editor source; review it and use editor undo if needed.</p>
    {selection.ready ? <>
      <label className="block text-sm font-medium">Describe the edit
        <textarea className="styled-scrollbar mt-1 block min-h-20 w-full rounded-md border bg-background p-3" maxLength={4000} value={instruction} onChange={e => setInstruction(e.target.value)} disabled={working} />
      </label>
      <button className={button} type="button" disabled={working || !instruction.trim()} onClick={() => void edit()}>{working ? "Editing…" : "Edit unsaved source"}</button>
      {working && <button className={button} type="button" onClick={() => controller.current?.abort()}>Cancel edit</button>}
    </> : <p className="text-sm text-muted-foreground">Connect an AI provider in account settings to edit the working copy.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {lastEdit && <details className="text-sm" onToggle={event => setReviewOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer">Review applied AI diff</summary>
      {reviewOpen && <Suspense fallback={<p className="py-3">Loading diff…</p>}>
        <LuaDiffReview before={lastEdit.before} after={lastEdit.after} />
      </Suspense>}
    </details>}
  </section>
}
