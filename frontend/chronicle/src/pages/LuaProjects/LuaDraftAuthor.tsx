import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useInferencePermission } from "@/features/chat/api"
import { runAgUi } from "@/features/chat/client"
import { useInferenceSelection } from "@/features/chat/useInferenceSelection"
import { uploadDraft, type LuaProject } from "./api"
import { buildLuaDraftTar, parseLuaProposal } from "./draftAuthor"

const button = "rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"

export function LuaDraftAuthor({ project, onUploaded }: { project: LuaProject; onUploaded: (success: boolean) => Promise<void> }) {
  const { session, isAuthenticated } = useAuth()
  const permission = useInferencePermission(isAuthenticated)
  const selection = useInferenceSelection(session?.user_id, isAuthenticated && permission.allowed)
  const [prompt, setPrompt] = useState("")
  const [source, setSource] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  if (project.kind !== "panel" || !isAuthenticated || !permission.allowed) return null

  async function generate() {
    if (!selection.connectionId || !selection.modelId || !prompt.trim() || working) return
    setWorking(true)
    setSource(null)
    setError("")
    setNotice("")
    const abort = new AbortController()
    controller.current = abort
    let response = ""
    let responseBytes = 0
    let finished = false
    try {
      await runAgUi({
        url: "/api/v1/inference/runs", signal: abort.signal,
        body: {
          run_id: crypto.randomUUID(), assistant_id: "lua-project-author",
          connection_id: selection.connectionId, model: selection.modelId,
          messages: [{ role: "user", content: `Draft a Lua panel for ${project.name}. Requirements: ${prompt.trim()}` }],
        },
        onEvent: event => {
          if (event.type === "TEXT_MESSAGE_CONTENT") {
            responseBytes += new TextEncoder().encode(event.delta).length
            if (responseBytes > 256 * 1024) abort.abort()
            else response += event.delta
          }
          if (event.type === "RUN_ERROR") throw new Error(event.message)
          if (event.type === "RUN_FINISHED") finished = true
        },
      })
      if (!finished) throw new Error("AI response did not finish.")
      setSource(parseLuaProposal(response))
      setNotice("Proposal ready. Review and edit the source before uploading.")
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Generation failed.")
      else setError("Generation cancelled or response exceeded 256 KiB.")
    } finally { controller.current = null; setWorking(false) }
  }

  async function confirmUpload() {
    if (source === null || working) return
    if (!window.confirm("Upload the reviewed Lua source as this project's private draft? This replaces the current draft; it does not publish or test it.")) return
    setWorking(true)
    setError("")
    setNotice("")
    try {
      const archive = buildLuaDraftTar(project, source)
      await uploadDraft(project.id, project.revision, archive)
      setSource(null)
      await onUploaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.")
      if (e instanceof Error && "status" in e && e.status === 409) {
        setSource(null) // A stale revision needs a fresh proposal/review.
        await onUploaded(false).catch(() => {})
      }
    } finally { setWorking(false) }
  }

  return <section className="space-y-3 rounded-xl border border-border/80 bg-card p-5 shadow-sm" aria-label="AI Lua draft author">
    <h2 className="font-semibold">AI-assisted Lua panel draft</h2>
    <p className="text-sm text-muted-foreground">Uses your connected AI provider. Output is untrusted source, not tested or executed here. Only your explicit upload saves a private draft. Publishing remains a separate action.</p>
    {selection.ready ? <>
      <label className="block text-sm font-medium">Describe your panel
        <textarea className="mt-1 block min-h-24 w-full rounded-md border bg-background p-3" maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={working} />
      </label>
      <button className={button} type="button" disabled={working || !prompt.trim()} onClick={() => void generate()}>{working ? "Working…" : "Generate proposal"}</button>
      {working && controller.current && <button className={button} type="button" onClick={() => controller.current?.abort()}>Cancel generation</button>}
      {source !== null && <>
        <label className="block text-sm font-medium">Review and edit main.lua
          <textarea className="styled-scrollbar mt-1 block min-h-80 w-full rounded-md border bg-background p-3 font-mono text-xs" value={source} onChange={e => setSource(e.target.value)} spellCheck={false} disabled={working} />
        </label>
        <p className="text-xs text-muted-foreground">project.json is generated from this project's name and slug. No model-supplied manifest or tar bytes are used.</p>
        <button className={button} type="button" disabled={working || !source} onClick={() => void confirmUpload()}>Review and upload private draft</button>
      </>}
    </> : <p className="text-sm text-muted-foreground">Connect an AI provider in account settings to generate a proposal.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>
}
