import { useEffect, useRef, useState } from "react"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"
import { lua } from "@codemirror/legacy-modes/mode/lua"
import { applySourceProposal, buildEditorTar, initialEditorFiles, readLuaDraftZip, validateEditorFiles, type EditorFiles } from "./editorFiles"
import { uploadDraft, type LuaProject } from "./api"

const button = "rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
const maxZipBytes = 8 * 1024 * 1024

/** Fetch with a cap before parsing; never interpret package source as JavaScript. */
async function fetchPrivateDraft(project: LuaProject, signal: AbortSignal): Promise<EditorFiles> {
  const response = await fetch(`/api/v1/me/lua-projects/${encodeURIComponent(project.id)}/draft/${encodeURIComponent(project.draft_sha256!)}/package`, {
    credentials: "same-origin", cache: "no-store", signal,
  })
  if (!response.ok) throw new Error(`Private draft unavailable (${response.status}).`)
  if (!response.body) throw new Error("Private draft response has no body.")
  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxZipBytes) throw new Error("Private draft ZIP exceeds 8 MiB.")
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return readLuaDraftZip(bytes, project)
}

function LuaCodeMirror({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const editable = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!container.current) return
    const editor = new EditorView({ parent: container.current, state: EditorState.create({ doc: value, extensions: [
      lineNumbers(), history(), drawSelection(), highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      StreamLanguage.define(lua), syntaxHighlighting(defaultHighlightStyle),
      editable.current.of(EditorView.editable.of(!disabled)), EditorView.lineWrapping,
      EditorView.theme({
        "&": { fontSize: "13px", color: "var(--foreground)", backgroundColor: "var(--background)" },
        ".cm-content": { minHeight: "320px", fontFamily: "var(--font-mono, monospace)", padding: "12px 0" },
        ".cm-scroller": { maxHeight: "520px", overflow: "auto" },
        ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "none" },
        ".cm-focused": { outline: "2px solid var(--ring)", outlineOffset: "-2px" },
      }),
      EditorView.updateListener.of(update => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()) }),
    ] }) })
    view.current = editor
    return () => { editor.destroy(); view.current = null }
    // Value is the initial document. Parent remounts on draft identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (view.current && view.current.state.doc.toString() !== value) {
    view.current.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: value } })
  } }, [value])
  useEffect(() => { view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!disabled)) }) }, [disabled])
  return <div ref={container} className="overflow-hidden rounded-md border border-border" role="group" aria-label="main.lua source editor" />
}

export type LuaWorkingCopy = { source: string; manifest: string; revision: number; dirty: boolean; valid: boolean }
export type LuaSourceProposal = { id: string; source: string; expectedRevision: number }
export type LuaSourceEditorProps = {
  project: LuaProject
  onUploaded: (success: boolean) => Promise<void>
  onWorkingCopy?: (copy: LuaWorkingCopy | null) => void
  proposedSource?: LuaSourceProposal | null
  onProposalResult?: (id: string, applied: boolean) => void
}

/** Lazy-load this component from the route: importing it loads the CodeMirror bundle. */
export function LuaSourceEditor({ project, onUploaded, onWorkingCopy, proposedSource, onProposalResult }: LuaSourceEditorProps) {
  const [files, setFiles] = useState<EditorFiles | null>(null)
  const [baseline, setBaseline] = useState<EditorFiles | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [active, setActive] = useState<"lua" | "manifest">("lua")
  const identity = `${project.id}:${project.draft_sha256 ?? "new"}`
  const loadedIdentity = useRef<string | null>(null)
  const localRevision = useRef(0)
  const handledProposal = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const onWorkingCopyRef = useRef(onWorkingCopy)
  onWorkingCopyRef.current = onWorkingCopy
  const onProposalResultRef = useRef(onProposalResult)
  onProposalResultRef.current = onProposalResult
  const dirty = !!files && (!baseline || files.lua !== baseline.lua || files.manifest !== baseline.manifest)
  dirtyRef.current = dirty
  useEffect(() => {
    if (loadedIdentity.current && loadedIdentity.current !== identity && dirtyRef.current) {
      setError("The draft changed while you had unsaved edits. Your local edits remain visible; reload the page to discard them and review the latest draft.")
      return
    }
    loadedIdentity.current = identity
    const controller = new AbortController()
    if (!project.draft_sha256) {
      localRevision.current += 1
      setFiles(initialEditorFiles(project)); setBaseline(null); setLoading(false); setError("")
    } else {
      setLoading(true); setError(""); setFiles(null)
      void fetchPrivateDraft(project, controller.signal).then(value => {
        if (!controller.signal.aborted) { localRevision.current += 1; setFiles(value); setBaseline(value); setLoading(false) }
      }).catch(reason => {
        if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Unable to load private draft."); setLoading(false) }
      })
    }
    return () => controller.abort()
    // The revision may change independently; never overwrite unsaved edits for the same draft hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])
  let validation = ""
  if (files) try { validateEditorFiles(project, files) } catch (reason) { validation = reason instanceof Error ? reason.message : "Invalid source." }

  useEffect(() => {
    onWorkingCopyRef.current?.(files && !loading ? {
      source: files.lua, manifest: files.manifest, revision: localRevision.current,
      dirty, valid: !validation && !error,
    } : null)
  }, [files, loading, dirty, validation, error])

  useEffect(() => {
    if (!proposedSource || !files || loading || handledProposal.current === proposedSource.id) return
    handledProposal.current = proposedSource.id
    const next = !saving && !error ? applySourceProposal(project, files, localRevision.current, proposedSource) : null
    if (next) {
      if (next.lua !== files.lua) { localRevision.current += 1; setFiles(next) }
      setActive("lua")
    }
    onProposalResultRef.current?.(proposedSource.id, !!next)
  }, [proposedSource, files, loading, saving, error, project])

  function edit(field: keyof EditorFiles, value: string) {
    if (!files || files[field] === value) return
    localRevision.current += 1
    setFiles(current => current ? { ...current, [field]: value } : current)
  }

  async function save() {
    if (!files || !dirty || saving || validation) return
    setSaving(true); setError(""); setNotice("")
    try {
      const archive = buildEditorTar(project, files)
      await uploadDraft(project.id, project.revision, archive)
      setBaseline(files)
      setNotice("Private draft saved. It has not been run or published.")
      await onUploaded(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Draft upload failed.")
      if (reason instanceof Error && "status" in reason && reason.status === 409) {
        setError("Project revision changed. Your edits are preserved. Reload the project and compare before saving again.")
        await onUploaded(false).catch(() => {})
      }
    } finally { setSaving(false) }
  }

  return <section aria-label="Lua source editor" className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Private draft / source</p>
      <h2 className="mt-1 text-lg font-semibold">Project files</h2>
      <p className="text-sm text-muted-foreground">Edit locally in your browser. Save uploads a private draft at revision {project.revision}; it does not run or publish code.</p>
    </div><span role="status" className="rounded-full border border-border px-3 py-1 font-mono text-xs">{loading ? "Loading" : dirty ? "Unsaved changes" : "Saved"}</span></div>
    {loading ? <p role="status" className="text-sm">Loading source…</p> : files && project.kind === "panel" ? <>
      <div className="flex gap-2 border-b border-border pb-2" role="tablist" aria-label="Project files">
        {(["lua", "manifest"] as const).map(tab => <button key={tab} id={`lua-editor-tab-${tab}`} type="button" role="tab" aria-selected={active === tab} aria-controls={`lua-editor-panel-${tab}`} className={`${button} ${active === tab ? "border-primary text-foreground" : "text-muted-foreground"}`} onClick={() => setActive(tab)}>{tab === "lua" ? "main.lua" : "project.json"}</button>)}
      </div>
      <div id="lua-editor-panel-lua" role="tabpanel" aria-labelledby="lua-editor-tab-lua" hidden={active !== "lua"}>
        <LuaCodeMirror key={identity} value={files.lua} onChange={lua => edit("lua", lua)} disabled={saving} />
      </div>
      <div id="lua-editor-panel-manifest" role="tabpanel" aria-labelledby="lua-editor-tab-manifest" hidden={active !== "manifest"}>
        <label htmlFor="lua-editor-manifest" className="mb-2 block text-sm font-medium">project.json</label>
        <textarea id="lua-editor-manifest" className="styled-scrollbar min-h-64 w-full rounded-md border border-border bg-background p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-primary" spellCheck={false} value={files.manifest} disabled={saving} onChange={event => edit("manifest", event.target.value)} />
        <p className="text-xs text-muted-foreground">Project identity, entrypoint and assets are fixed. You can change capabilities and streams.</p>
      </div>
      {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}
      <button type="button" className={button} disabled={!dirty || !!validation || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save private draft"}</button>
    </> : !error && <p className="text-sm text-muted-foreground">This editor currently supports panel projects only.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>
}
