import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { ArrowLeftRight, GitCompare, PanelRightClose, PanelRightOpen, Undo2 } from "lucide-react"
import { useInstance } from "@/api/queries"
import type { RecentInstancesResponse } from "@/api/typesGenerated"
import { useInferenceCapability } from "@/features/chat/runtime"
import { getProject } from "./api"
import { LuaBrowserTest } from "./LuaBrowserTest"
import { panelPackageFromWorkingCopy, validateEditorFiles, type EditorFiles } from "./editorFiles"
import { applyLuaFileEdit, LUA_EDITOR_CAPABILITY, parseLuaFileEdit, type LuaToolFile } from "./luaEditorTools"
import { fetchPreviewDamage } from "./previewStream"
import { runStartupCheck } from "./startupCheck"
import type { LuaSourceProposal, LuaWorkingCopy } from "./LuaSourceEditor"

const LuaSourceEditor = lazy(() => import("./LuaSourceEditor").then(module => ({ default: module.LuaSourceEditor })))
const LuaWorkshopChat = lazy(() => import("./LuaWorkshopChat").then(module => ({ default: module.LuaWorkshopChat })))
const LuaDiffReview = lazy(() => import("./LuaDiffReview").then(module => ({ default: module.LuaDiffReview })))
const LuaInstancePreview = lazy(() => import("./LuaInstancePreview").then(module => ({ default: module.LuaInstancePreview })))
const events = { getDamage: fetchPreviewDamage }
const instanceIDPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const proposalTimeoutMs = 5_000
const layoutKey = "lua-workshop-layout"

type Layout = { focus: "chat" | "code"; sideOpen: boolean }
type AiEdit = { file: LuaToolFile; before: EditorFiles; after: EditorFiles; revision: number }

function readLayout(): Layout {
  try {
    const value = JSON.parse(localStorage.getItem(layoutKey) ?? "null") as Partial<Layout> | null
    return { focus: value?.focus === "code" ? "code" : "chat", sideOpen: value?.sideOpen !== false }
  } catch { return { focus: "chat", sideOpen: true } }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

const iconButton = "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
const paneButton = "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"

export default function LuaProjectWorkspacePage() {
  const { projectId = "" } = useParams<{ projectId: string }>()
  const projectQuery = useQuery({ queryKey: ["lua-editor-project", projectId], enabled: !!projectId,
    queryFn: () => getProject(projectId), retry: false })
  const [copy, setCopy] = useState<LuaWorkingCopy | null>(null)
  const [proposal, setProposal] = useState<LuaSourceProposal | null>(null)
  const [instanceId, setInstanceId] = useState("")
  const [instanceInput, setInstanceInput] = useState("")
  const [encounterIds, setEncounterIds] = useState<string[]>([])
  const recent = useQuery({ queryKey: ["lua-editor-recent-instances"],
    queryFn: async () => {
      const response = await fetch("/api/v1/raidlogs/recent?days=60&limit=20")
      if (!response.ok) throw new Error(`Recent instances unavailable (${response.status})`)
      return response.json() as Promise<RecentInstancesResponse>
    }, staleTime: 60_000, retry: false })
  const validInstanceID = instanceIDPattern.test(instanceId)
  const instance = useInstance(instanceId, { enabled: validInstanceID, retry: false })
  const project = projectQuery.data
  const onUploaded = useCallback(async () => {
    await projectQuery.refetch()
  }, [projectQuery])
  const onWorkingCopy = useCallback((next: LuaWorkingCopy | null) => setCopy(next), [])
  const [layout, setLayoutState] = useState(readLayout)
  const [sideTab, setSideTab] = useState<"pane" | "preview">("pane")
  const [aiEdit, setAiEdit] = useState<AiEdit | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const setLayout = useCallback((next: Partial<Layout>) => setLayoutState(current => {
    const value = { ...current, ...next }
    try { localStorage.setItem(layoutKey, JSON.stringify(value)) } catch { /* per-viewer preference only */ }
    return value
  }), [])

  // AI tools and undo push whole-file proposals into the editor and wait for its revision check.
  const copyRef = useRef(copy)
  copyRef.current = copy
  const pendingProposals = useRef(new Map<string, (result: { applied: boolean; revision: number }) => void>())
  const propose = useCallback((files: EditorFiles, expectedRevision: number) => {
    const id = crypto.randomUUID()
    return new Promise<{ applied: boolean; revision: number }>(resolve => {
      const timer = setTimeout(() => { pendingProposals.current.delete(id); resolve({ applied: false, revision: expectedRevision }) }, proposalTimeoutMs)
      pendingProposals.current.set(id, result => { clearTimeout(timer); resolve(result) })
      setProposal({ id, files, expectedRevision })
    })
  }, [])
  const onProposalResult = useCallback((id: string, applied: boolean, revision: number) => {
    setProposal(current => current?.id === id ? null : current)
    pendingProposals.current.get(id)?.({ applied, revision })
    pendingProposals.current.delete(id)
  }, [])
  const requireCopy = () => {
    const current = copyRef.current
    if (!current) throw new Error("capability_unavailable: The editor is still loading.")
    return current
  }
  useInferenceCapability({
    ...LUA_EDITOR_CAPABILITY,
    scope: { type: "lua_project", id: projectId },
    available: () => !!copyRef.current && !!projectQuery.data,
    tools: {
      read_lua_files: () => {
        const current = requireCopy()
        return { revision: current.revision, files: { "main.lua": current.source, "project.json": current.manifest },
          unsaved_changes: current.dirty, validation_error: current.validation || null }
      },
      edit_lua_file: async (args) => {
        const current = requireCopy()
        const project = projectQuery.data!
        const before = { lua: current.source, manifest: current.manifest }
        let edit, after: EditorFiles
        try {
          edit = parseLuaFileEdit(args)
          if (edit.expectedRevision !== current.revision) throw new Error("stale_state")
          after = applyLuaFileEdit(before, edit)
        } catch (error) {
          if (error instanceof Error && error.message === "stale_state") throw error
          return { applied: false, error: errorMessage(error, "Invalid edit.") }
        }
        const result = await propose(after, current.revision)
        if (!result.applied) throw new Error("stale_state")
        setAiEdit({ file: edit.file, before, after, revision: result.revision })
        setDiffOpen(false)
        let validation: string | null = null
        try { validateEditorFiles(project, after) } catch (error) { validation = errorMessage(error, "Invalid working copy.") }
        return { applied: true, revision: result.revision, validation_error: validation }
      },
      run_startup_check: async (_args, { signal }) => {
        const current = requireCopy()
        try {
          return await runStartupCheck(panelPackageFromWorkingCopy(projectQuery.data!, { manifest: current.manifest, lua: current.source }), signal)
        } catch (error) {
          if (signal.aborted) throw error
          return { ok: false, message: `The working copy is invalid: ${errorMessage(error, "unknown error")}` }
        }
      },
    },
  })
  async function undoAiEdit() {
    if (!aiEdit || copy?.revision !== aiEdit.revision) return
    const result = await propose(aiEdit.before, aiEdit.revision)
    if (result.applied) setAiEdit(null)
  }
  const localPanel = useMemo(() => {
    if (!project || !copy?.valid) return null
    try { return { value: panelPackageFromWorkingCopy(project, { manifest: copy.manifest, lua: copy.source }), error: "" } }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid working copy" } }
  }, [project, copy])

  if (projectQuery.isPending) return <div className="container mx-auto p-8 text-sm text-muted-foreground">Loading project editor…</div>
  if (projectQuery.isError || !project) return <div className="container mx-auto p-8" role="alert">Project unavailable or access denied.</div>
  if (project.kind !== "panel") return <div className="container mx-auto p-8" role="alert">Browser source editing currently supports panel projects only.</div>

  const toggleEncounter = (id: string) => setEncounterIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : ids.length >= 3 ? ids : [...ids, id])
  const selectInstance = (id: string) => { setInstanceId(id); setEncounterIds([]) }
  const { focus, sideOpen } = layout
  const sideName = focus === "chat" ? "code" : "chat"
  const swap = () => { setLayout({ focus: sideName, sideOpen: true }); setSideTab("pane") }
  const showSidePane = (pane: "chat" | "code") => { if (pane !== focus) setSideTab("pane") }
  // Chat and code stay mounted and move between grid cells, so the editor keeps its state and undo history.
  // Preview always lives in the side column; on narrow screens the side column stacks below the main pane.
  const sideHidden = sideOpen ? "" : "lg:hidden"
  const paneClass = (pane: "chat" | "code") => pane === focus
    ? "flex min-h-[70vh] min-w-0 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:min-h-0"
    : `${sideTab === "pane" ? "flex" : "hidden"} order-1 h-[70vh] min-w-0 flex-col bg-black/20 lg:col-start-2 lg:row-start-2 lg:h-auto ${sideHidden}`
  const swapButton = <button type="button" className={paneButton} onClick={swap} title="Swap which of code and chat is in the main area">
    <ArrowLeftRight className="size-3.5" /> Swap code &amp; chat</button>
  const mainControls = (pane: "chat" | "code") => pane === focus ? <span className="max-lg:hidden">{swapButton}</span> : undefined
  const aiEditCurrent = !!aiEdit && copy?.revision === aiEdit.revision

  return <div className="flex flex-col border-b border-border lg:h-[calc(100dvh-70px)] lg:min-h-[560px]">
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
      <Link className="text-xs text-muted-foreground hover:text-foreground" to={`/lua-projects/${encodeURIComponent(project.id)}`}
        onClick={event => { if (copy?.dirty && !window.confirm("Leave the editor and discard unsaved source changes?")) event.preventDefault() }}>← Releases</Link>
      <span aria-hidden className="h-4 w-px bg-border" />
      <h1 className="text-base font-semibold">{project.name}</h1>
      <span className="font-mono text-xs text-muted-foreground">{project.slug}</span>
      {copy?.dirty && focus === "chat" && (!sideOpen || sideTab === "preview") && <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-300">Unsaved changes</span>}
      <div className="ml-auto flex items-center gap-1">
        <span className="lg:hidden">{swapButton}</span>
        {!sideOpen && <button type="button" onClick={() => setLayout({ sideOpen: true })} className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent lg:inline-flex">
          <PanelRightOpen className="size-3.5" /> Show side panel
        </button>}
      </div>
    </header>
    <div className={`grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] ${sideOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(360px,min(44%,680px))]" : "lg:grid-cols-1"}`}>
      <div className={`order-1 flex h-10 items-center gap-1 border-y-2 border-foreground/25 bg-black/20 px-2 lg:col-start-2 lg:row-start-1 lg:border-y-0 lg:border-b lg:border-b-border ${sideHidden}`}>
        {(["pane", "preview"] as const).map(tab => <button key={tab} type="button" aria-pressed={sideTab === tab} onClick={() => setSideTab(tab)}
          className={`rounded-md px-2.5 py-1 text-xs ${sideTab === tab ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab === "preview" ? "Preview" : sideName === "code" ? "Code" : "Chat"}</button>)}
        <div className="ml-auto flex items-center gap-1 max-lg:hidden">
          {swapButton}
          <button type="button" className={iconButton} onClick={() => setLayout({ sideOpen: false })} title="Hide side panel" aria-label="Hide side panel"><PanelRightClose className="size-4" /></button>
        </div>
      </div>
      {/* Visible divider between the main area and the side column. */}
      <div aria-hidden className={`pointer-events-none z-10 hidden border-l-2 border-foreground/25 lg:col-start-2 lg:row-span-2 lg:row-start-1 ${sideOpen ? "lg:block" : ""}`} />
      <section className={paneClass("chat")} aria-label="Workshop chat">
        <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Loading chat…</p>}>
          <LuaWorkshopChat projectId={project.id} projectName={project.name} windowControls={mainControls("chat")}
            onShowCode={focus === "chat" ? swap : undefined} />
        </Suspense>
      </section>
      <section className={paneClass("code")} aria-label="Code">
        {(focus === "code" || aiEdit) && <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
          {aiEdit && <div className="flex min-w-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-0.5 text-[11px]">
            <span className="truncate">AI edited {aiEdit.file}</span>
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent" onClick={() => { showSidePane("code"); setDiffOpen(open => !open) }}><GitCompare className="size-3" /> Diff</button>
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent disabled:opacity-40" disabled={!aiEditCurrent} onClick={() => void undoAiEdit()}
              title={aiEditCurrent ? "Restore the files from before this AI edit" : "The working copy changed since this edit; use editor undo (Ctrl+Z) instead"}><Undo2 className="size-3" /> Undo</button>
          </div>}
          <div className="ml-auto flex items-center">{mainControls("code")}</div>
        </div>}
        <div className="relative min-h-0 flex-1">
          {diffOpen && aiEdit && <div className="absolute inset-x-0 top-0 z-10 max-h-[60%] overflow-hidden border-b border-border bg-background shadow-lg">
            <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
              <span>{aiEdit.file} · before (left), after (right)</span>
              <button type="button" className="hover:text-foreground" onClick={() => setDiffOpen(false)}>Close</button>
            </div>
            <Suspense fallback={<p className="p-3 text-xs">Loading diff…</p>}>
              <LuaDiffReview before={aiEdit.file === "main.lua" ? aiEdit.before.lua : aiEdit.before.manifest} after={aiEdit.file === "main.lua" ? aiEdit.after.lua : aiEdit.after.manifest} />
            </Suspense>
          </div>}
          <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Loading code editor…</p>}>
            <LuaSourceEditor project={project} onUploaded={onUploaded} onWorkingCopy={onWorkingCopy}
              proposedSource={proposal} onProposalResult={onProposalResult}
              footer={localPanel?.value && <LuaBrowserTest key={`${project.revision}:${copy?.revision}`} panel={localPanel.value} />} />
          </Suspense>
        </div>
      </section>
      <section aria-label="Instance preview" className={`${sideTab === "preview" ? "block" : "hidden"} order-1 styled-scrollbar h-[70vh] min-w-0 overflow-y-auto bg-black/20 lg:col-start-2 lg:row-start-2 lg:h-auto ${sideHidden}`}>
        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Preview on an instance</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Runs your unsaved source in the browser against up to three encounters.</p>
          </div>
          {recent.data && <select aria-label="Recent instance" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" value={recent.data.instances.some(item => item.id === instanceId) ? instanceId : ""} onChange={event => selectInstance(event.target.value)}>
            <option value="">Choose a recent instance…</option>
            {recent.data.instances.map(item => <option key={item.id} value={item.id}>{item.name} · {item.realm_name} · {new Date(item.uploaded_at).toLocaleDateString()}</option>)}
          </select>}
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); selectInstance(instanceInput.trim()) }}>
            <input aria-label="Instance ID" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs" value={instanceInput} onChange={event => setInstanceInput(event.target.value)} placeholder={recent.data ? "…or paste an instance ID" : "Paste an instance ID"} />
            <button className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50" type="submit" disabled={!instanceInput.trim()}>Load</button>
          </form>
          {instanceId && !validInstanceID && <p role="alert" className="text-xs text-destructive">Enter a valid instance UUID.</p>}
          {instance.isFetching && <p role="status" className="text-xs text-muted-foreground">Loading encounters…</p>}
          {instance.isError && <p role="alert" className="text-xs text-destructive">Instance unavailable.</p>}
          {instance.data && <fieldset>
            <legend className="mb-1.5 flex w-full text-xs text-muted-foreground">Encounters<span className="ml-auto font-mono">{encounterIds.length}/3</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {instance.data.encounters.map(encounter => {
                const selected = encounterIds.includes(encounter.id)
                return <button key={encounter.id} type="button" aria-pressed={selected} disabled={!selected && encounterIds.length >= 3} onClick={() => toggleEncounter(encounter.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 ${selected ? "border-primary bg-primary/20 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{encounter.name}</button>
              })}
            </div>
          </fieldset>}
          {localPanel?.error && <p role="alert" className="text-xs text-destructive">{localPanel.error}</p>}
          {!copy?.valid && copy && <p className="text-xs text-muted-foreground">Fix the source errors to enable previews.</p>}
          {instance.data && localPanel?.value && encounterIds.length > 0 && <Suspense fallback={<p role="status" className="text-xs">Loading local preview…</p>}>
            <LuaInstancePreview panel={localPanel.value} instanceId={instanceId} encounterIds={encounterIds} events={events} />
          </Suspense>}
        </div>
      </section>
    </div>
  </div>
}
