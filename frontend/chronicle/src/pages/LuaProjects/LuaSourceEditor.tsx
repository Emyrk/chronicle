import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language"
import { lua } from "@codemirror/legacy-modes/mode/lua"
import { applySourceProposal, buildEditorTar, initialEditorFiles, readLuaDraftZip, validateEditorFiles, type EditorFiles } from "./editorFiles"
import { uploadDraft, type LuaProject } from "./api"
import { luaHighlightStyle } from "./luaHighlight"

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

const maxZipBytes = 8 * 1024 * 1024

/** Fetch with a cap before parsing; never interpret package source as JavaScript. */
async function fetchPrivateDraft(project: LuaProject, signal: AbortSignal): Promise<EditorFiles> {
  const response = await fetch(`/api/v1/me/lua-projects/${encodeURIComponent(project.id)}/draft/${encodeURIComponent(project.main!.sha256)}/package`, {
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
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
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
      StreamLanguage.define(lua), syntaxHighlighting(luaHighlightStyle),
      editable.current.of(EditorView.editable.of(!disabled)),
      EditorView.theme({
        "&": { height: "100%", fontSize: "13px", lineHeight: "1.65", color: "var(--foreground)", backgroundColor: "var(--background)" },
        ".cm-content": { fontFamily: "var(--font-mono, ui-monospace, monospace)", padding: "12px 0", caretColor: "var(--primary)" },
        ".cm-scroller": { overflow: "auto" },
        ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--muted-foreground)", border: "none", borderRight: "1px solid var(--border)", paddingRight: "6px" },
        ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--primary) 7%, transparent)" },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--primary) 25%, transparent)" },
        ".cm-cursor": { borderLeftColor: "var(--primary)", borderLeftWidth: "2px" },
        "&.cm-focused": { outline: "none" },
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
  return <div ref={container} className="h-full overflow-hidden" role="group" aria-label="main.lua source editor" />
}

export type LuaWorkingCopy = {
  source: string; manifest: string; readme: string; revision: number; dirty: boolean; valid: boolean; validation: string
  /** A private draft exists on the server for this working copy. */
  saved: boolean
  saving: boolean
}
/** Lets the page save from anywhere (header, publish) while the editor keeps owning its draft baseline. */
export type LuaSourceEditorHandle = { save(): Promise<{ ok: boolean; error?: string }> }
/** Replaces working-copy files if the revision still matches; used by AI tools and undo. */
const tabLabel: Record<keyof EditorFiles, string> = { lua: "main.lua", manifest: "project.json", readme: "README.md" }
const statusHint: Record<keyof EditorFiles, string> = {
  lua: "Lua 5.3 · private working copy",
  manifest: "Identity, entrypoint and assets are fixed; capabilities and streams are editable.",
  readme: "Markdown · shown on the module's page",
}

export type LuaSourceProposal = { id: string; files: EditorFiles; expectedRevision: number }
export type LuaSourceEditorProps = {
  project: LuaProject
  onUploaded: (success: boolean) => Promise<void>
  onWorkingCopy?: (copy: LuaWorkingCopy | null) => void
  proposedSource?: LuaSourceProposal | null
  onProposalResult?: (id: string, applied: boolean, revision: number) => void
  /** Rendered in the status bar, e.g. the startup check. */
  footer?: ReactNode
  handleRef?: Ref<LuaSourceEditorHandle>
}

/** Lazy-load this component from the route: importing it loads the CodeMirror bundle. */
export function LuaSourceEditor({ project, onUploaded, onWorkingCopy, proposedSource, onProposalResult, footer, handleRef }: LuaSourceEditorProps) {
  const [files, setFiles] = useState<EditorFiles | null>(null)
  const [baseline, setBaseline] = useState<EditorFiles | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [active, setActive] = useState<keyof EditorFiles>("lua")
  const identity = `${project.id}:${project.main?.sha256 ?? "new"}`
  const loadedIdentity = useRef<string | null>(null)
  const localRevision = useRef(0)
  const handledProposal = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const onWorkingCopyRef = useRef(onWorkingCopy)
  onWorkingCopyRef.current = onWorkingCopy
  const onProposalResultRef = useRef(onProposalResult)
  onProposalResultRef.current = onProposalResult
  const dirty = !!files && (!baseline || files.lua !== baseline.lua || files.manifest !== baseline.manifest || files.readme !== baseline.readme)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  useEffect(() => {
    if (loadedIdentity.current && loadedIdentity.current !== identity && dirtyRef.current) {
      setError("The draft changed while you had unsaved edits. Your local edits remain visible; reload the page to discard them and review the latest draft.")
      return
    }
    loadedIdentity.current = identity
    const controller = new AbortController()
    if (!project.main) {
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
      source: files.lua, manifest: files.manifest, readme: files.readme, revision: localRevision.current,
      dirty, valid: !validation && !error, validation: validation || error, saved: !!baseline, saving,
    } : null)
  }, [files, loading, dirty, validation, error, baseline, saving])

  useEffect(() => {
    if (!proposedSource || !files || loading || handledProposal.current === proposedSource.id) return
    handledProposal.current = proposedSource.id
    const next = !saving && !error ? applySourceProposal(files, localRevision.current, proposedSource) : null
    if (next && (next.lua !== files.lua || next.manifest !== files.manifest || next.readme !== files.readme)) {
      localRevision.current += 1
      setFiles(next)
      setActive(next.lua !== files.lua ? "lua" : next.manifest !== files.manifest ? "manifest" : "readme")
    }
    onProposalResultRef.current?.(proposedSource.id, !!next, localRevision.current)
  }, [proposedSource, files, loading, saving, error])

  function edit(field: keyof EditorFiles, value: string) {
    if (!files || files[field] === value) return
    localRevision.current += 1
    setFiles(current => current ? { ...current, [field]: value } : current)
  }

  async function save(): Promise<{ ok: boolean; error?: string }> {
    if (!files || loading) return { ok: false, error: "The editor is still loading." }
    if (validation) return { ok: false, error: validation }
    if (!dirty) return { ok: true }
    if (saving) return { ok: false, error: "A save is already in progress." }
    setSaving(true); setError(""); setNotice("")
    try {
      const archive = buildEditorTar(project, files)
      await uploadDraft(project.id, project.revision, archive)
      setBaseline(files)
      setNotice("Private draft saved. It has not been run or published.")
      await onUploaded(true)
      return { ok: true }
    } catch (reason) {
      let message = reason instanceof Error ? reason.message : "Draft upload failed."
      if (reason instanceof Error && "status" in reason && reason.status === 409) {
        message = "Project revision changed. Your edits are preserved. Reload the project and compare before saving again."
        await onUploaded(false).catch(() => {})
      }
      setError(message)
      return { ok: false, error: message }
    } finally { setSaving(false) }
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useImperativeHandle(handleRef, () => ({ save: () => saveRef.current() }), [])

  const message = error || validation
  return <section aria-label="Lua source editor" className="flex h-full min-h-0 flex-col bg-background">
    <div className="flex items-center gap-2 border-b border-border bg-card/60 pr-2">
      {files && project.kind === "panel" && <div className="flex self-stretch" role="tablist" aria-label="Project files">
        {(["lua", "manifest", "readme"] as const).map(tab => <button key={tab} id={`lua-editor-tab-${tab}`} type="button" role="tab" aria-selected={active === tab} aria-controls={`lua-editor-panel-${tab}`}
          className={`-mb-px border-b-2 border-r border-r-border px-4 py-2 font-mono text-xs ${focusRing} ${active === tab ? "border-b-primary bg-background text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActive(tab)}>{tabLabel[tab]}</button>)}
      </div>}
    </div>
    <div className="relative min-h-0 flex-1">
      {loading ? <p role="status" className="p-4 text-sm text-muted-foreground">Loading source…</p> : files && project.kind === "panel" ? <>
        <div id="lua-editor-panel-lua" role="tabpanel" aria-labelledby="lua-editor-tab-lua" hidden={active !== "lua"} className="h-full">
          <LuaCodeMirror key={identity} value={files.lua} onChange={lua => edit("lua", lua)} disabled={saving} />
        </div>
        <div id="lua-editor-panel-manifest" role="tabpanel" aria-labelledby="lua-editor-tab-manifest" hidden={active !== "manifest"} className="h-full">
          <textarea id="lua-editor-manifest" aria-label="project.json" className="styled-scrollbar block h-full w-full resize-none bg-background p-4 font-mono text-[13px] leading-relaxed focus-visible:outline-none" spellCheck={false} value={files.manifest} disabled={saving} onChange={event => edit("manifest", event.target.value)} />
        </div>
        <div id="lua-editor-panel-readme" role="tabpanel" aria-labelledby="lua-editor-tab-readme" hidden={active !== "readme"} className="h-full">
          <textarea aria-label="README.md" className="styled-scrollbar block h-full w-full resize-none bg-background p-4 font-mono text-[13px] leading-relaxed focus-visible:outline-none" value={files.readme} disabled={saving}
            placeholder="# My module&#10;&#10;Markdown shown on the module's page. Leave empty for no README." onChange={event => edit("readme", event.target.value)} />
        </div>
      </> : !error && <p className="p-4 text-sm text-muted-foreground">This editor currently supports panel projects only.</p>}
    </div>
    <div className="flex min-h-8 items-center gap-3 border-t border-border bg-card/60 px-3 py-1 text-xs">
      {message ? <p role="alert" className="text-destructive">{message}</p>
        : notice ? <p role="status" className="text-emerald-400">{notice}</p>
        : <p className="text-muted-foreground">{statusHint[active]}</p>}
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3">{footer}<span className="font-mono text-muted-foreground">rev {project.revision}</span></div>
    </div>
  </section>
}
