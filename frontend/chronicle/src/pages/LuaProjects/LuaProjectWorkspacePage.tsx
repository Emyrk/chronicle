import { lazy, Suspense, useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { useInstance } from "@/api/queries"
import type { RecentInstancesResponse } from "@/api/typesGenerated"
import { getProject } from "./api"
import { panelPackageFromWorkingCopy } from "./editorFiles"
import { fetchPreviewDamage } from "./previewStream"
import type { LuaSourceProposal, LuaWorkingCopy } from "./LuaSourceEditor"

const LuaSourceEditor = lazy(() => import("./LuaSourceEditor").then(module => ({ default: module.LuaSourceEditor })))
const LuaEditorAssistant = lazy(() => import("./LuaEditorAssistant").then(module => ({ default: module.LuaEditorAssistant })))
const LuaInstancePreview = lazy(() => import("./LuaInstancePreview").then(module => ({ default: module.LuaInstancePreview })))
const LuaBrowserTest = lazy(() => import("./LuaBrowserTest").then(module => ({ default: module.LuaBrowserTest })))
const events = { getDamage: fetchPreviewDamage }
const instanceIDPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export default function LuaProjectWorkspacePage() {
  const { projectId = "" } = useParams<{ projectId: string }>()
  const projectQuery = useQuery({ queryKey: ["lua-editor-project", projectId], enabled: !!projectId,
    queryFn: () => getProject(projectId), retry: false })
  const [copy, setCopy] = useState<LuaWorkingCopy | null>(null)
  const [proposal, setProposal] = useState<LuaSourceProposal | null>(null)
  const [proposalError, setProposalError] = useState("")
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
  const onProposalResult = useCallback((id: string, applied: boolean) => {
    setProposal(current => current?.id === id ? null : current)
    if (!applied) setProposalError("The working copy changed. AI edit was not applied.")
    else setProposalError("")
  }, [])
  const localPanel = useMemo(() => {
    if (!project || !copy?.valid) return null
    try { return { value: panelPackageFromWorkingCopy(project, { manifest: copy.manifest, lua: copy.source }), error: "" } }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid working copy" } }
  }, [project, copy])

  if (projectQuery.isPending) return <main className="container mx-auto p-8">Loading project editor…</main>
  if (projectQuery.isError || !project) return <main className="container mx-auto p-8" role="alert">Project unavailable or access denied.</main>
  if (project.kind !== "panel") return <main className="container mx-auto p-8" role="alert">Browser source editing currently supports panel projects only.</main>

  return <main className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><Link className="text-xs text-muted-foreground hover:text-foreground" to={`/lua-projects/${encodeURIComponent(project.id)}`}
        onClick={event => { if (copy?.dirty && !window.confirm("Leave the editor and discard unsaved source changes?")) event.preventDefault() }}>← Project releases</Link>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Lua workshop / private working copy</p>
        <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1></div>
      <p className="text-sm text-muted-foreground">Edit, test, then save. Publishing remains a separate action.</p>
    </header>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]">
      <Suspense fallback={<p role="status">Loading code editor…</p>}>
        <LuaSourceEditor project={project} onUploaded={onUploaded} onWorkingCopy={onWorkingCopy}
          proposedSource={proposal} onProposalResult={onProposalResult} />
      </Suspense>
      <div className="space-y-5">
        {copy?.valid && <Suspense fallback={<p role="status">Loading AI assistant…</p>}>
          <LuaEditorAssistant project={project} source={copy.source} revisionToken={copy.revision}
            onApply={(source) => {
              setProposalError("")
              setProposal({ id: crypto.randomUUID(), source, expectedRevision: copy.revision })
            }} />
        </Suspense>}
        {proposalError && <p role="alert" className="text-sm text-destructive">{proposalError}</p>}
        {localPanel?.value && <Suspense fallback={<p role="status">Loading browser test…</p>}>
          <LuaBrowserTest key={`${project.revision}:${copy?.revision}`} panel={localPanel.value} />
        </Suspense>}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Instance preview setup">
          <h2 className="font-semibold">Preview on an instance</h2>
          <p className="text-xs text-muted-foreground">Choose a recent instance or enter an instance ID. The browser downloads a bounded damage stream and processes only the selected encounters when you run the preview.</p>
          {recent.data && <label className="block text-sm">Recent instance
            <select className="mt-1 w-full rounded-md border bg-background p-2" value={instanceId} onChange={event => { setInstanceId(event.target.value); setEncounterIds([]) }}>
              <option value="">Choose an instance</option>
              {recent.data.instances.map(item => <option key={item.id} value={item.id}>{item.name} · {item.realm_name} · {new Date(item.uploaded_at).toLocaleDateString()}</option>)}
            </select>
          </label>}
          <form onSubmit={event => { event.preventDefault(); setInstanceId(instanceInput.trim()); setEncounterIds([]) }}>
            <label className="block text-sm">Or enter an instance ID
              <input className="mt-1 w-full rounded-md border bg-background p-2 font-mono text-xs" value={instanceInput} onChange={event => setInstanceInput(event.target.value)} placeholder="Paste an instance ID" />
            </label>
            <button className="mt-2 rounded-md border px-3 py-1 text-xs hover:bg-accent" type="submit">Select instance</button>
          </form>
          {instanceId && !validInstanceID && <p role="alert" className="text-xs text-destructive">Enter a valid instance UUID.</p>}
          {instance.isFetching && <p role="status" className="text-xs text-muted-foreground">Loading instance encounters…</p>}
          {instance.isError && <p role="alert" className="text-sm text-destructive">Instance unavailable.</p>}
          {instance.data && <fieldset className="space-y-2"><legend className="text-sm font-medium">Encounters (up to three)</legend>
            <div className="styled-scrollbar max-h-52 space-y-1 overflow-auto rounded-md border p-2">
              {instance.data.encounters.map(encounter => <label key={encounter.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={encounterIds.includes(encounter.id)} disabled={!encounterIds.includes(encounter.id) && encounterIds.length >= 3}
                  onChange={event => setEncounterIds(ids => event.target.checked ? [...ids, encounter.id] : ids.filter(id => id !== encounter.id))} />
                <span>{encounter.name}</span>
              </label>)}
            </div>
          </fieldset>}
          {localPanel?.error && <p role="alert" className="text-sm text-destructive">{localPanel.error}</p>}
          {instance.data && localPanel?.value && encounterIds.length > 0 && <Suspense fallback={<p role="status">Loading local preview…</p>}>
            <LuaInstancePreview panel={localPanel.value} instanceId={instanceId} encounterIds={encounterIds} events={events} />
          </Suspense>}
        </section>
      </div>
    </div>
  </main>
}
