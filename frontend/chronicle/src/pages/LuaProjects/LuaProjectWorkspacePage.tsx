import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { ArrowLeftRight, BookOpen, GitCompare, PanelLeft, PanelRightClose, PanelRightOpen, Rocket, Save, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { useInstance } from "@/api/queries"
import type { RecentInstancesResponse } from "@/api/typesGenerated"
import { useInferenceCapability } from "@/features/chat/runtime"
import { getProject, publishUnstable, type LuaProject } from "./api"
import { LuaBrowserTest } from "./LuaBrowserTest"
import { panelPackageFromWorkingCopy, validateEditorFiles, type EditorFiles } from "./editorFiles"
import { applyLuaFileEdit, LUA_EDITOR_CAPABILITY, parseLuaFileEdit, type LuaToolFile } from "./luaEditorTools"
import { createCachedDamageProvider } from "./previewStream"
import { parseRunPreviewArgs, runPreview } from "./previewRun"
import { selectPreviewDamage } from "./luaPreviewBounds"
import { runStartupCheck } from "./startupCheck"
import { buildPanelUnits } from "../Guides/runtime/panelUnits"
import { resolveInstanceUnits } from "../Instance/instanceUnits"
import type { LuaSourceEditorHandle, LuaSourceProposal, LuaWorkingCopy } from "./LuaSourceEditor"

const LuaSourceEditor = lazy(() => import("./LuaSourceEditor").then(module => ({ default: module.LuaSourceEditor })))
const LuaWorkshopChat = lazy(() => import("./LuaWorkshopChat").then(module => ({ default: module.LuaWorkshopChat })))
const LuaDiffReview = lazy(() => import("./LuaDiffReview").then(module => ({ default: module.LuaDiffReview })))
const InstanceEncounterPicker = lazy(() => import("@/pages/Instance/InstancePage").then(module => ({ default: module.InstanceEncounterPicker })))
const LuaInstancePreview = lazy(() => import("./LuaInstancePreview").then(module => ({ default: module.LuaInstancePreview })))
const events = createCachedDamageProvider()
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

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** Where the working copy stands relative to the saved draft and the unstable release. */
function releaseStatus(project: LuaProject, copy: LuaWorkingCopy | null): { label: string; tone: string } {
  if (!copy) return { label: "Loading…", tone: "bg-muted-foreground" }
  if (copy.saving) return { label: "Saving…", tone: "bg-sky-400" }
  if (copy.dirty) return { label: "Unsaved changes", tone: "bg-amber-400" }
  if (!copy.saved) return { label: "Not saved yet", tone: "bg-muted-foreground" }
  if (project.unstable?.sha256 === project.draft_sha256) return { label: "Published to unstable", tone: "bg-emerald-500" }
  return { label: "Draft saved · not published", tone: "bg-sky-400" }
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
  const [pickerOpen, setPickerOpen] = useState(true)
  const recent = useQuery({ queryKey: ["lua-editor-recent-instances"],
    queryFn: async () => {
      const response = await fetch("/api/v1/raidlogs/recent?days=60&limit=20")
      if (!response.ok) throw new Error(`Recent instances unavailable (${response.status})`)
      return response.json() as Promise<RecentInstancesResponse>
    }, staleTime: 60_000, retry: false })
  const validInstanceID = instanceIDPattern.test(instanceId)
  const instance = useInstance(instanceId, { enabled: validInstanceID, retry: false })
  const previewUnits = useMemo(() => instance.data && buildPanelUnits(instance.data.players,
    resolveInstanceUnits(instance.data.units, instance.data.names_by_entry, instance.data.summons_by_owner)), [instance.data])
  // Start each newly loaded instance on its first boss kill so the preview runs without extra clicks.
  const [defaultedFor, setDefaultedFor] = useState("")
  if (instance.data && defaultedFor !== instance.data.id) {
    setDefaultedFor(instance.data.id)
    const encounters = instance.data.encounters ?? []
    const first = encounters.find(e => e.boss && e.kill_type !== "wipe" && e.kill_type !== "reset") ?? encounters[0]
    setEncounterIds(first ? [first.id] : [])
  }
  const project = projectQuery.data
  const onUploaded = useCallback(async () => {
    await projectQuery.refetch()
  }, [projectQuery])
  const onWorkingCopy = useCallback((next: LuaWorkingCopy | null) => setCopy(next), [])
  // Save and publish live in the page header so they work from every tab, not just the code editor.
  const editorHandle = useRef<LuaSourceEditorHandle>(null)
  const [publishing, setPublishing] = useState(false)
  const saveDraft = useCallback(async () => {
    const result = await editorHandle.current?.save() ?? { ok: false, error: "The editor is still loading." }
    if (!result.ok) toast.error(result.error ?? "Draft upload failed.")
    return result.ok
  }, [])
  const saveDraftRef = useRef(saveDraft)
  saveDraftRef.current = saveDraft
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveDraftRef.current() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  async function publish() {
    if (publishing || !copy) return
    if (!window.confirm(copy.dirty ? "Save your changes and publish them to the public unstable channel?" : "Publish this draft to the public unstable channel?")) return
    setPublishing(true)
    try {
      if (copy.dirty && !await saveDraft()) return
      const latest = (await projectQuery.refetch()).data
      if (!latest?.draft_sha256) throw new Error("Save a draft before publishing.")
      await publishUnstable(latest.id, latest.revision)
      await projectQuery.refetch()
      toast.success("Unstable release published. Test it in a real instance layout before promoting it to stable.")
    } catch (error) {
      toast.error(errorMessage(error, "Publish failed."))
      await projectQuery.refetch().catch(() => {})
    } finally { setPublishing(false) }
  }
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
  // run_preview replays against whatever the user has selected in the Preview pane.
  const previewRef = useRef({ instanceId, encounterIds, units: previewUnits, encounters: instance.data?.encounters ?? [] })
  previewRef.current = { instanceId: instance.data ? instanceId : "", encounterIds, units: previewUnits, encounters: instance.data?.encounters ?? [] }
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
      run_preview: async (args, { signal }) => {
        const current = requireCopy()
        let requested: string[] | undefined
        try { requested = parseRunPreviewArgs(args).encounterIds }
        catch (error) { return { ok: false, error: errorMessage(error, "Invalid run_preview arguments.") } }
        const { instanceId: previewInstance, units, encounters: available } = previewRef.current
        if (!previewInstance) return { ok: false, error: "An instance must be selected first. Ask the user to pick an instance in the Preview pane." }
        const known = new Set(available.map(encounter => encounter.id))
        const unknown = requested?.filter(id => !known.has(id)) ?? []
        const selected = requested && !unknown.length ? requested : previewRef.current.encounterIds
        const encounters = available.map(encounter => ({ id: encounter.id, name: encounter.name, boss: encounter.boss, kill_type: encounter.kill_type, selected: selected.includes(encounter.id) }))
        if (unknown.length) return { ok: false, error: `Unknown encounter ids: ${unknown.join(", ")}. Choose from encounters.`, encounters }
        if (!selected.length) return { ok: false, error: "No encounters selected. Pass encounter_ids from encounters.", encounters }
        // Show the user what the assistant is previewing; Auto preview follows the same selection.
        if (requested) setEncounterIds(requested)
        let panel
        try { panel = panelPackageFromWorkingCopy(projectQuery.data!, { manifest: current.manifest, lua: current.source }) }
        catch (error) { return { ok: false, error: `The working copy is invalid: ${errorMessage(error, "unknown error")}` } }
        const damage = panel.streams.includes("damage")
          ? selectPreviewDamage(await events.getDamage(previewInstance, { signal }), selected, panel.streamScope) : undefined
        const result = await runPreview({ panel, damage, encounterIds: selected, units }, signal)
        return { ...result, instance_id: previewInstance, encounter_ids: selected, revision: current.revision, encounters }
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
  const status = releaseStatus(project, copy)
  const published = !!copy && !copy.dirty && copy.saved && project.unstable?.sha256 === project.draft_sha256
  const canSave = !!copy && copy.dirty && copy.valid && !copy.saving && !publishing
  const canPublish = !!copy && copy.valid && !copy.saving && !publishing && !published && (copy.dirty || !!project.draft_sha256)

  return <div className="flex flex-col border-b border-border lg:h-[calc(100dvh-70px)] lg:min-h-[560px]">
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
      <Link className="text-xs text-muted-foreground hover:text-foreground" to={`/addons/${encodeURIComponent(project.id)}`}
        onClick={event => { if (copy?.dirty && !window.confirm("Leave the editor and discard unsaved source changes?")) event.preventDefault() }}>← Releases</Link>
      <span aria-hidden className="h-4 w-px bg-border" />
      <h1 className="text-base font-semibold">{project.name}</h1>
      <span className="font-mono text-xs text-muted-foreground">{project.slug}</span>
      <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href="/addons/api" target="_blank" rel="noreferrer"
        title="Addon API reference and FAQ (opens in a new tab)"><BookOpen className="size-3.5" /> API reference</a>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span role="status" className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground" title={copy?.validation || undefined}>
          <span aria-hidden className={`size-2 rounded-full ${status.tone}`} />{status.label}
          {copy && !copy.valid && <span className="text-destructive">· invalid</span>}
        </span>
        <button type="button" disabled={!canSave} onClick={() => void saveDraft()}
          title={`Upload a private draft. Does not run or publish code. (${isMac ? "⌘" : "Ctrl+"}S)`}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${copy?.dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-accent"}`}>
          <Save className="size-3.5" /> {copy?.saving && !publishing ? "Saving…" : "Save draft"}</button>
        <button type="button" disabled={!canPublish} onClick={() => void publish()}
          title={published ? "This draft is already the unstable release." : "Publish the saved draft to the unstable channel. Promote to stable from Releases after testing."}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${!copy?.dirty && canPublish ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-accent"}`}>
          <Rocket className="size-3.5" /> {publishing ? "Publishing…" : copy?.dirty ? "Save & publish" : "Publish unstable"}</button>
      </div>
      <div className="flex items-center gap-1">
        <span className="lg:hidden">{swapButton}</span>
        {!sideOpen && <button type="button" onClick={() => setLayout({ sideOpen: true })} className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent lg:inline-flex">
          <PanelRightOpen className="size-3.5" /> Show side panel
        </button>}
      </div>
    </header>
    <div className={`grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] ${sideOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(360px,min(44%,680px))]" : "lg:grid-cols-1"}`}>
      <div className={`order-1 flex h-10 items-center gap-1 border-y-2 border-foreground/25 bg-black/20 px-2 lg:col-start-2 lg:row-start-1 lg:border-y-0 lg:border-b lg:border-b-border ${sideHidden}`}>
        {(["pane", "preview"] as const).map(tab => <button key={tab} type="button" aria-pressed={sideTab === tab} onClick={() => setSideTab(tab)}
          className={`rounded-md px-2.5 py-1 text-xs ${sideTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab === "preview" ? "Preview" : sideName === "code" ? "Code" : "Chat"}</button>)}
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
            <LuaSourceEditor handleRef={editorHandle} project={project} onUploaded={onUploaded} onWorkingCopy={onWorkingCopy}
              proposedSource={proposal} onProposalResult={onProposalResult}
              footer={localPanel?.value && <LuaBrowserTest key={`${project.revision}:${copy?.revision}`} panel={localPanel.value} />} />
          </Suspense>
        </div>
      </section>
      <section aria-label="Instance preview" className={`${sideTab === "preview" ? "flex" : "hidden"} order-1 h-[70vh] min-w-0 flex-col bg-black/20 lg:col-start-2 lg:row-start-2 lg:h-auto ${sideHidden}`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
          {recent.data && <select aria-label="Recent instance" className="min-w-0 flex-1 basis-56 rounded-md border border-border bg-background px-2 py-1.5 text-xs" value={recent.data.instances.some(item => item.id === instanceId) ? instanceId : ""} onChange={event => selectInstance(event.target.value)}>
            <option value="">Choose a recent instance…</option>
            {recent.data.instances.map(item => <option key={item.id} value={item.id}>{item.name} · {item.realm_name} · {new Date(item.uploaded_at).toLocaleDateString()}</option>)}
          </select>}
          <form className="flex min-w-0 flex-1 basis-56 gap-2" onSubmit={event => { event.preventDefault(); selectInstance(instanceInput.trim()) }}>
            <input aria-label="Instance ID" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs" value={instanceInput} onChange={event => setInstanceInput(event.target.value)} placeholder={recent.data ? "…or paste an instance ID" : "Paste an instance ID"} />
            <button className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50" type="submit" disabled={!instanceInput.trim()}>Load</button>
          </form>
        </div>
        <div className="flex min-h-0 flex-1">
          {instance.data && pickerOpen && <Suspense fallback={<p role="status" className="w-[267px] p-3 text-xs text-muted-foreground">Loading encounters…</p>}>
            <InstanceEncounterPicker apiInstance={instance.data} selectedIds={encounterIds} onChange={setEncounterIds}
              onCollapse={() => setPickerOpen(false)} className="static max-h-none h-full py-3 pl-3" />
          </Suspense>}
          <div className="styled-scrollbar min-w-0 flex-1 space-y-3 overflow-y-auto p-3">
            {instance.data && !pickerOpen && <button type="button" className={paneButton} onClick={() => setPickerOpen(true)}>
              <PanelLeft className="size-3.5" /> Encounters · {encounterIds.length} selected</button>}
            {!instanceId && <p className="text-xs text-muted-foreground">Choose an instance to run your unsaved source against its encounters in the browser.</p>}
            {instanceId && !validInstanceID && <p role="alert" className="text-xs text-destructive">Enter a valid instance UUID.</p>}
            {instance.isFetching && <p role="status" className="text-xs text-muted-foreground">Loading encounters…</p>}
            {instance.isError && <p role="alert" className="text-xs text-destructive">Instance unavailable.</p>}
            {localPanel?.error && <p role="alert" className="text-xs text-destructive">{localPanel.error}</p>}
            {!copy?.valid && copy && <p className="text-xs text-muted-foreground">Fix the source errors to enable previews.</p>}
            {instance.data && encounterIds.length === 0 && <p className="text-xs text-muted-foreground">Select an encounter to preview. Ctrl/⌘-click selects several.</p>}
            {instance.data && localPanel?.value && encounterIds.length > 0 && <Suspense fallback={<p role="status" className="text-xs">Loading local preview…</p>}>
              <LuaInstancePreview panel={localPanel.value} instanceId={instanceId} encounterIds={encounterIds} events={events} units={previewUnits} />
            </Suspense>}
          </div>
        </div>
      </section>
    </div>
  </div>
}
