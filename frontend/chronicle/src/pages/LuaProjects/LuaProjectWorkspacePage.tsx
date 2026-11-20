import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { BookOpen, ChevronLeft, Code2, Eye, GitCompare, PanelRightClose, Rocket, Save, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { useInstance } from "@/api/queries"
import type { RecentInstancesResponse } from "@/api/typesGenerated"
import { useInferenceCapability } from "@/features/chat/runtime"
import { useConfirmLinkNavigation } from "@/hooks/useConfirmLinkNavigation"
import { modulePath, createRelease, getProject, getProjectPage, latestRelease, nextReleaseTag, type LuaProject } from "./api"
import { useModulePage } from "./moduleRoute"
import { LuaBrowserTest } from "./LuaBrowserTest"
import { useOptionalLocalMcp } from "@/features/chat/mcp/LocalMcpProvider"
import { panelPackageFromWorkingCopy, validateEditorFiles, type EditorFiles } from "./editorFiles"
import { applyLuaFileEdit, editorFileKey, LUA_EDITOR_CAPABILITY, parseLuaFileEdit, workingCopyFiles, type LuaToolFile } from "./luaEditorTools"
import { createCachedStreamProvider, loadPreviewStreams } from "./previewStream"
import type { WorkshopChatRequest } from "./LuaWorkshopChat"
import { parseRunPreviewArgs, runPreview } from "./previewRun"
import { runStartupCheck } from "./startupCheck"
import { buildPanelUnits } from "../Guides/runtime/panelUnits"
import { resolveInstanceUnits } from "../Instance/instanceUnits"
import type { LuaSourceEditorHandle, LuaSourceProposal, LuaWorkingCopy } from "./LuaSourceEditor"
import { EncounterStrip } from "./EncounterStrip"
import { PaneResizer } from "./PaneResizer"
import { MIN_SIDE_WIDTH } from "./paneWidth"
import { readPreviewSelection, restoredEncounters, writePreviewSelection } from "./previewSelection"
import { isInstanceIdentifier } from "./instanceIdentifier"
import { ConnectAgentPrompt, WorkshopAgentBar } from "./WorkshopAgentBar"

const LuaSourceEditor = lazy(() => import("./LuaSourceEditor").then(module => ({ default: module.LuaSourceEditor })))
const LuaWorkshopChat = lazy(() => import("./LuaWorkshopChat").then(module => ({ default: module.LuaWorkshopChat })))
const LuaDiffReview = lazy(() => import("./LuaDiffReview").then(module => ({ default: module.LuaDiffReview })))
const LuaInstancePreview = lazy(() => import("./LuaInstancePreview").then(module => ({ default: module.LuaInstancePreview })))
const events = createCachedStreamProvider()
const proposalTimeoutMs = 5_000
const layoutKey = "lua-workshop-layout-v2"

/**
 * The preview owns the canvas; code is an optional view of the same canvas. Browser chat is a
 * secondary drawer: most authors drive the workshop from a local agent over MCP.
 * chatWidth is the drawer's dragged width in px; null keeps the default.
 */
type Layout = { view: "preview" | "code"; chatOpen: boolean; chatWidth: number | null }
type AiEdit = { file: LuaToolFile; before: EditorFiles; after: EditorFiles; revision: number }

function readLayout(): Layout {
  try {
    const value = JSON.parse(localStorage.getItem(layoutKey) ?? "null") as Partial<Layout> | null
    const chatWidth = typeof value?.chatWidth === "number" && Number.isFinite(value.chatWidth) && value.chatWidth >= MIN_SIDE_WIDTH ? value.chatWidth : null
    return { view: value?.view === "code" ? "code" : "preview", chatOpen: value?.chatOpen === true, chatWidth }
  } catch { return { view: "preview", chatOpen: false, chatWidth: null } }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** Where the working copy stands relative to main and the latest release. */
function releaseStatus(project: LuaProject, copy: LuaWorkingCopy | null): { label: string; tone: string } {
  if (!copy) return { label: "Loading…", tone: "bg-muted-foreground" }
  if (copy.saving) return { label: "Saving…", tone: "bg-sky-400" }
  if (copy.dirty) return { label: "Unsaved changes", tone: "bg-amber-400" }
  if (!copy.saved) return { label: "Not saved yet", tone: "bg-muted-foreground" }
  const latest = latestRelease(project)
  if (latest && latest.sha256 === project.main?.sha256) return { label: `Released as ${latest.tag}`, tone: "bg-emerald-500" }
  return { label: latest ? `Saved to main · latest release ${latest.tag}` : "Saved to main · not released yet", tone: "bg-sky-400" }
}

const iconButton = "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"

/** The Workshop at /modules/<author>/<slug>/edit: resolves the module, then opens it by ID. */
export function ModuleWorkspaceByPath() {
  const page = useModulePage()
  if (page.data) return <LuaProjectWorkspacePage projectId={page.data.project.id} />
  return <main className="container mx-auto px-4 py-10 text-sm">{page.isPending ? "Loading module…"
    : <><Link to="/modules">← Modules</Link><p role="alert" className="mt-4">{page.error?.message ?? "Module not found."}</p></>}</main>
}

export default function LuaProjectWorkspacePage({ projectId: resolvedId }: { projectId?: string } = {}) {
  const params = useParams<{ projectId: string }>()
  const projectId = resolvedId ?? params.projectId ?? ""
  const projectQuery = useQuery({ queryKey: ["lua-editor-project", projectId], enabled: !!projectId,
    queryFn: () => getProject(projectId), retry: false })
  // Release needs its own permission; editors without it only save to main.
  const permissionsQuery = useQuery({ queryKey: ["lua-editor-permissions", projectId], enabled: !!projectId,
    queryFn: () => getProjectPage(projectId).then(page => page.permissions), retry: false })
  const canTagReleases = permissionsQuery.data?.release ?? false
  const [copy, setCopy] = useState<LuaWorkingCopy | null>(null)
  const localMcp = useOptionalLocalMcp()
  // The connected-tab guard includes unsaved changes; avoid prompting twice.
  useConfirmLinkNavigation(!!copy?.dirty && !localMcp?.active, "Leave the Module Workshop and discard your unsaved source changes?")
  const [proposal, setProposal] = useState<LuaSourceProposal | null>(null)
  // Reopen the preview on the instance and encounters last used for this module.
  const [savedSelection] = useState(() => readPreviewSelection(projectId))
  const [instanceId, setInstanceId] = useState(savedSelection?.instanceId ?? "")
  const [instanceInput, setInstanceInput] = useState("")
  // Once an instance is loaded the picker collapses to its name; the back button reopens it.
  const [choosingInstance, setChoosingInstance] = useState(false)
  const [encounterIds, setEncounterIds] = useState<string[]>([])
  const recent = useQuery({ queryKey: ["lua-editor-recent-instances"],
    queryFn: async () => {
      const response = await fetch("/api/v1/raidlogs/recent?days=60&limit=20")
      if (!response.ok) throw new Error(`Recent instances unavailable (${response.status})`)
      return response.json() as Promise<RecentInstancesResponse>
    }, staleTime: 60_000, retry: false })
  // A restored instance missing from the recent list shows in the ID box instead of the dropdown.
  const [restoredInput, setRestoredInput] = useState(false)
  if (!restoredInput && recent.data && savedSelection && instanceId === savedSelection.instanceId) {
    setRestoredInput(true)
    if (!recent.data.instances.some(item => item.id === instanceId)) setInstanceInput(instanceId)
  }
  const validInstanceIdentifier = isInstanceIdentifier(instanceId)
  const instance = useInstance(instanceId, { enabled: validInstanceIdentifier, retry: false })
  const previewUnits = useMemo(() => instance.data && buildPanelUnits(instance.data.players,
    resolveInstanceUnits(instance.data.units, instance.data.names_by_entry, instance.data.summons_by_owner)), [instance.data])
  // Start each newly loaded instance on its first boss kill so the preview runs without extra clicks.
  const [defaultedFor, setDefaultedFor] = useState("")
  if (instance.data && defaultedFor !== instance.data.id) {
    const encounters = instance.data.encounters ?? []
    // Only the first load restores the saved encounters; picking another instance starts fresh.
    const restored = !defaultedFor && savedSelection?.instanceId === instance.data.id ? restoredEncounters(savedSelection.encounterIds, encounters) : []
    setDefaultedFor(instance.data.id)
    const first = encounters.find(e => e.boss && e.kill_type !== "wipe" && e.kill_type !== "reset") ?? encounters[0]
    setEncounterIds(restored.length ? restored : first ? [first.id] : [])
  }
  useEffect(() => {
    if (projectId && instance.data && defaultedFor === instance.data.id) {
      writePreviewSelection(projectId, { instanceId: instance.data.id, encounterIds })
    }
  }, [projectId, instance.data, defaultedFor, encounterIds])
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
  // Tagging a release snapshots main; everyone running the module moves to it.
  async function release() {
    if (publishing || !copy || !project) return
    const tag = window.prompt(`${copy.dirty ? "Your changes are saved to main first. " : ""}Tag this release (everyone running the module gets it):`, nextReleaseTag(project.releases))?.trim()
    if (!tag) return
    setPublishing(true)
    try {
      if (copy.dirty && !await saveDraft()) return
      const latest = (await projectQuery.refetch()).data
      if (!latest?.main) throw new Error("Save to main before releasing.")
      await createRelease(latest.id, latest.revision, tag)
      await projectQuery.refetch()
      toast.success(`Released ${tag}. Panels running the module pick it up on their next load.`)
    } catch (error) {
      toast.error(errorMessage(error, "Release failed."))
      await projectQuery.refetch().catch(() => {})
    } finally { setPublishing(false) }
  }
  const [layout, setLayoutState] = useState(readLayout)
  const gridRef = useRef<HTMLDivElement>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  // Browser chat loads only once opened, then stays mounted to keep its thread.
  const [chatMounted, setChatMounted] = useState(() => readLayout().chatOpen)
  const [chatRequest, setChatRequest] = useState<WorkshopChatRequest>()
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
        return { revision: current.revision, files: workingCopyFiles({ lua: current.source, manifest: current.manifest, readme: current.readme }),
          unsaved_changes: current.dirty, validation_error: current.validation || null }
      },
      edit_lua_file: async (args) => {
        const current = requireCopy()
        const project = projectQuery.data!
        const before = { lua: current.source, manifest: current.manifest, readme: current.readme }
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
      save_lua_files: async (args, { signal }) => {
        const current = requireCopy()
        const input = args as { expected_revision?: unknown } | null
        if (!input || !Number.isSafeInteger(input.expected_revision) || input.expected_revision !== current.revision) throw new Error("stale_state")
        signal.throwIfAborted()
        if (!current.valid || current.saving || publishing) return { ok: false, error: "The working copy is invalid or a save/release is in progress." }
        const result = await editorHandle.current?.save(current.revision) ?? { ok: false, error: "The editor is still loading." }
        return { ...result, revision: current.revision, saved_to: "main", released: false }
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
        try { panel = panelPackageFromWorkingCopy(projectQuery.data!, { manifest: current.manifest, lua: current.source, readme: current.readme }) }
        catch (error) { return { ok: false, error: `The working copy is invalid: ${errorMessage(error, "unknown error")}` } }
        const streams = await loadPreviewStreams(events, previewInstance, panel, selected, signal)
        const result = await runPreview({ panel, streams, encounterIds: selected, units }, signal)
        return { ...result, instance_id: previewInstance, encounter_ids: selected, revision: current.revision, encounters }
      },
      run_startup_check: async (_args, { signal }) => {
        const current = requireCopy()
        try {
          return await runStartupCheck(panelPackageFromWorkingCopy(projectQuery.data!, { manifest: current.manifest, lua: current.source, readme: current.readme }), signal)
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
  // A bullet in the tab title keeps unsaved agent edits visible while you work in the agent's terminal.
  const dirty = !!copy?.dirty
  useEffect(() => {
    if (!dirty) return
    const original = document.title
    document.title = `● ${original}`
    return () => { document.title = original }
  }, [dirty])
  const localPanel = useMemo(() => {
    if (!project || !copy?.valid) return null
    try { return { value: panelPackageFromWorkingCopy(project, { manifest: copy.manifest, lua: copy.source, readme: copy.readme }), error: "" } }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid working copy" } }
  }, [project, copy])

  if (projectQuery.isPending) return <div className="container mx-auto p-8 text-sm text-muted-foreground">Loading project editor…</div>
  if (projectQuery.isError || !project) return <div className="container mx-auto p-8" role="alert">Project unavailable or access denied.</div>
  if (project.kind !== "panel") return <div className="container mx-auto p-8" role="alert">Browser source editing currently supports panel projects only.</div>

  const selectInstance = (id: string) => { setInstanceId(id); setEncounterIds([]); setChoosingInstance(false) }
  const { view, chatOpen } = layout
  const chatWidth = dragWidth ?? layout.chatWidth
  const openChat = () => { setChatMounted(true); setLayout({ chatOpen: true }) }
  const toggleChat = () => chatOpen ? setLayout({ chatOpen: false }) : openChat()
  // From the preview's error card: send the explanation to the browser chat and open it.
  const askAssistant = (text: string) => { setChatRequest({ id: Date.now(), text }); openChat() }
  const aiEditCurrent = !!aiEdit && copy?.revision === aiEdit.revision
  const status = releaseStatus(project, copy)
  const released = !!copy && !copy.dirty && copy.saved && !!project.main && latestRelease(project)?.sha256 === project.main.sha256
  const canSave = !!copy && copy.dirty && copy.valid && !copy.saving && !publishing
  const canRelease = !!copy && copy.valid && !copy.saving && !publishing && !released && (copy.dirty || !!project.main)
  const unsaved = !!copy?.dirty && !copy.saving

  return <div className="flex flex-col border-b border-border lg:h-[calc(100dvh-70px)] lg:min-h-[560px]">
    <ConnectAgentPrompt />
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2">
      <Link className="text-xs text-muted-foreground hover:text-foreground" to={modulePath(project)}>← Overview</Link>
      <span aria-hidden className="h-4 w-px bg-border" />
      <h1 className="text-base font-semibold">{project.name}</h1>
      <span className="font-mono text-xs text-muted-foreground">{project.slug}</span>
      <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href="/modules/api" target="_blank" rel="noreferrer"
        title="Module API reference and FAQ (opens in a new tab)"><BookOpen className="size-3.5" /> API reference</a>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {unsaved ? <span role="status" title={copy?.validation || "These files differ from main. Save to keep them."}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-200">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-amber-400" />
          Unsaved · {copy.changed.join(", ")}
          {!copy.valid && <span className="text-destructive">· invalid</span>}
        </span> : <span role="status" className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground" title={copy?.validation || undefined}>
          <span aria-hidden className={`size-2 rounded-full ${status.tone}`} />{status.label}
          {copy && !copy.valid && <span className="text-destructive">· invalid</span>}
        </span>}
        <button type="button" disabled={!canSave} onClick={() => void saveDraft()}
          title={`Save your changes to main. People who choose main run it; everyone else stays on the latest release. (${isMac ? "⌘" : "Ctrl+"}S)`}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${unsaved ? "bg-amber-400 text-black shadow-[0_0_0_3px_rgba(251,191,36,0.25)] hover:bg-amber-300" : "border border-border hover:bg-accent"}`}>
          <Save className="size-3.5" /> {copy?.saving && !publishing ? "Saving…" : "Save to main"}
          {unsaved && <kbd className="rounded bg-black/15 px-1 font-mono text-[10px]">{isMac ? "⌘S" : "Ctrl+S"}</kbd>}</button>
        {canTagReleases && <button type="button" disabled={!canRelease} onClick={() => void release()}
          title={released ? "Main is already the latest release." : "Tag main as a release. Everyone running the module moves to it."}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${!copy?.dirty && canRelease ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-accent"}`}>
          <Rocket className="size-3.5" /> {publishing ? "Releasing…" : copy?.dirty ? "Save & tag release" : "Tag release"}</button>}
      </div>
    </header>
    <WorkshopAgentBar chatOpen={chatOpen} onToggleChat={toggleChat} />
    <div ref={gridRef} style={chatWidth !== null ? { "--workshop-side": `${chatWidth}px` } as CSSProperties : undefined}
      className={`grid flex-1 grid-cols-1 lg:min-h-0 ${!chatOpen ? ""
        // A dragged width still leaves the canvas its minimum when the window shrinks.
        : chatWidth !== null ? "lg:grid-cols-[minmax(0,1fr)_min(var(--workshop-side),calc(100%_-_360px))]"
        : "lg:grid-cols-[minmax(0,1fr)_minmax(320px,min(34%,520px))]"}`}>
      <section aria-label="Module canvas" className="flex min-h-[70vh] min-w-0 flex-col lg:col-start-1 lg:row-start-1 lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          {instance.data && !choosingInstance ? <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setChoosingInstance(true)}
              title="Choose another instance" aria-label="Choose another instance"><ChevronLeft className="size-4" /></button>
            <span className="min-w-0 truncate text-xs" title={instance.data.id}>
              <span className="font-medium">{instance.data.name}</span>
              <span className="text-muted-foreground"> · {instance.data.realm_name}{instance.data.start_time && ` · ${new Date(instance.data.start_time).toLocaleDateString()}`}</span>
            </span>
          </div> : <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {recent.data && <select aria-label="Recent instance" className="min-w-0 flex-1 basis-56 rounded-md border border-border bg-background px-2 py-1.5 text-xs" value={recent.data.instances.some(item => item.id === instanceId) ? instanceId : ""} onChange={event => selectInstance(event.target.value)}>
              <option value="">Choose a recent instance…</option>
              {recent.data.instances.map(item => <option key={item.id} value={item.id}>{item.name} · {item.realm_name} · {new Date(item.uploaded_at).toLocaleDateString()}</option>)}
            </select>}
            <form className="flex min-w-0 flex-1 basis-56 gap-2" onSubmit={event => { event.preventDefault(); selectInstance(instanceInput.trim()) }}>
              <input aria-label="Instance ID or slug" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs" value={instanceInput} onChange={event => setInstanceInput(event.target.value)} placeholder={recent.data ? "…or paste an instance ID or slug" : "Paste an instance ID or slug"} />
              <button className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50" type="submit" disabled={!instanceInput.trim()}>Load</button>
            </form>
            {instance.data && <button type="button" className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setChoosingInstance(false)}>Cancel</button>}
          </div>}
          {aiEdit && <div className="flex min-w-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-0.5 text-[11px]">
            <span className="truncate">Agent edited {aiEdit.file}</span>
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent" onClick={() => {
              const opening = !diffOpen
              setDiffOpen(opening)
              if (opening) setLayout({ view: "code" })
            }}><GitCompare className="size-3" /> Diff</button>
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent disabled:opacity-40" disabled={!aiEditCurrent} onClick={() => void undoAiEdit()}
              title={aiEditCurrent ? "Restore the files from before this edit" : "The working copy changed since this edit; use editor undo (Ctrl+Z) instead"}><Undo2 className="size-3" /> Undo</button>
          </div>}
          <div role="tablist" aria-label="Canvas view" className="ml-auto flex shrink-0 rounded-md border border-border p-0.5">
            {([["preview", "Preview", Eye], ["code", "Code", Code2]] as const).map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={view === value}
              onClick={() => setLayout({ view: value })}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs ${view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="size-3.5" /> {label}</button>)}
          </div>
          {instance.data && view === "preview" && <div className="basis-full"><EncounterStrip encounters={instance.data.encounters ?? []} selectedIds={encounterIds} onChange={setEncounterIds} /></div>}
        </div>
        {/* Preview and code stay mounted, so switching views keeps the editor's state and undo history. */}
        <div role="tabpanel" aria-label="Instance preview" hidden={view !== "preview"} className="styled-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto bg-black/20 p-3">
            {!instanceId && <p className="text-xs text-muted-foreground">Choose an instance to run your unsaved source against its encounters in the browser. Your agent's <code className="font-mono">run_preview</code> uses the same selection.</p>}
            {instanceId && !validInstanceIdentifier && <p role="alert" className="text-xs text-destructive">Enter a valid instance ID or slug.</p>}
            {instance.isFetching && <p role="status" className="text-xs text-muted-foreground">Loading encounters…</p>}
            {instance.isError && <p role="alert" className="text-xs text-destructive">Instance unavailable.</p>}
            {localPanel?.error && <p role="alert" className="text-xs text-destructive">{localPanel.error}</p>}
            {!copy?.valid && copy && <p className="text-xs text-muted-foreground">Fix the source errors to enable previews.</p>}
            {instance.data && encounterIds.length === 0 && <p className="text-xs text-muted-foreground">Select an encounter to preview. Ctrl/⌘-click selects several.</p>}
            {instance.data && localPanel?.value && encounterIds.length > 0 && <Suspense fallback={<p role="status" className="text-xs">Loading local preview…</p>}>
              <LuaInstancePreview panel={localPanel.value} instanceId={instanceId} encounterIds={encounterIds} events={events} units={previewUnits} onAskAssistant={askAssistant} />
            </Suspense>}
        </div>
        <div role="tabpanel" aria-label="Code" hidden={view !== "code"} className="relative min-h-0 flex-1">
          {diffOpen && aiEdit && <div className="absolute inset-x-0 top-0 z-10 max-h-[60%] overflow-hidden border-b border-border bg-background shadow-lg">
            <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
              <span>{aiEdit.file} · before (left), after (right)</span>
              <button type="button" className="hover:text-foreground" onClick={() => setDiffOpen(false)}>Close</button>
            </div>
            <Suspense fallback={<p className="p-3 text-xs">Loading diff…</p>}>
              <LuaDiffReview before={aiEdit.before[editorFileKey(aiEdit.file)]} after={aiEdit.after[editorFileKey(aiEdit.file)]} />
            </Suspense>
          </div>}
          <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Loading code editor…</p>}>
            <LuaSourceEditor handleRef={editorHandle} project={project} onUploaded={onUploaded} onWorkingCopy={onWorkingCopy}
              proposedSource={proposal} onProposalResult={onProposalResult}
              footer={localPanel?.value && <LuaBrowserTest key={`${project.revision}:${copy?.revision}`} panel={localPanel.value} />} />
          </Suspense>
        </div>
      </section>
      {/* Divider between the canvas and the chat drawer; drag it to resize. */}
      {chatOpen && <PaneResizer containerRef={gridRef} width={chatWidth} onDrag={setDragWidth}
        onCommit={width => { setDragWidth(null); setLayout({ chatWidth: width }) }}
        className="hidden lg:col-start-2 lg:row-start-1 lg:block" />}
      {chatMounted && <section aria-label="Browser chat" hidden={!chatOpen} className="h-[70vh] min-w-0 flex-col border-t border-border bg-black/20 lg:col-start-2 lg:row-start-1 lg:h-auto lg:border-t-0 [&:not([hidden])]:flex">
        <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Loading chat…</p>}>
          <LuaWorkshopChat projectId={project.id} projectName={project.name} request={chatRequest}
            windowControls={<button type="button" className={iconButton} onClick={() => setLayout({ chatOpen: false })} title="Close browser chat" aria-label="Close browser chat"><PanelRightClose className="size-4" /></button>}
            onShowCode={view === "code" ? undefined : () => setLayout({ view: "code" })} />
        </Suspense>
      </section>}
    </div>
  </div>
}
