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

  if (projectQuery.isPending) return <div className="container mx-auto p-8 text-sm text-muted-foreground">Loading project editor…</div>
  if (projectQuery.isError || !project) return <div className="container mx-auto p-8" role="alert">Project unavailable or access denied.</div>
  if (project.kind !== "panel") return <div className="container mx-auto p-8" role="alert">Browser source editing currently supports panel projects only.</div>

  const toggleEncounter = (id: string) => setEncounterIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : ids.length >= 3 ? ids : [...ids, id])
  const selectInstance = (id: string) => { setInstanceId(id); setEncounterIds([]) }

  return <div className="flex flex-col border-b border-border lg:h-[calc(100dvh-70px)] lg:min-h-[560px]">
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
      <Link className="text-xs text-muted-foreground hover:text-foreground" to={`/lua-projects/${encodeURIComponent(project.id)}`}
        onClick={event => { if (copy?.dirty && !window.confirm("Leave the editor and discard unsaved source changes?")) event.preventDefault() }}>← Releases</Link>
      <span aria-hidden className="h-4 w-px bg-border" />
      <h1 className="text-base font-semibold">{project.name}</h1>
      <span className="font-mono text-xs text-muted-foreground">{project.slug}</span>
      <span className="ml-auto text-xs text-muted-foreground">Edit and test locally. Saving uploads a private draft; publishing is separate.</span>
    </header>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,40%)]">
      <div className="h-[65vh] min-h-0 lg:h-auto">
        <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Loading code editor…</p>}>
          <LuaSourceEditor project={project} onUploaded={onUploaded} onWorkingCopy={onWorkingCopy}
            proposedSource={proposal} onProposalResult={onProposalResult} />
        </Suspense>
      </div>
      <aside className="styled-scrollbar min-h-0 divide-y divide-border overflow-y-auto border-t border-border bg-card/40 lg:border-l lg:border-t-0" aria-label="Test and preview">
        <section className="space-y-3 p-4" aria-label="Instance preview setup">
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
        </section>
        {localPanel?.value && <Suspense fallback={<p role="status" className="p-4 text-xs">Loading browser test…</p>}>
          <LuaBrowserTest key={`${project.revision}:${copy?.revision}`} panel={localPanel.value} />
        </Suspense>}
        {copy?.valid && <Suspense fallback={<p role="status" className="p-4 text-xs">Loading AI assistant…</p>}>
          <LuaEditorAssistant project={project} source={copy.source} revisionToken={copy.revision}
            onApply={(source) => {
              setProposalError("")
              setProposal({ id: crypto.randomUUID(), source, expectedRevision: copy.revision })
            }} />
        </Suspense>}
        {proposalError && <p role="alert" className="p-4 text-sm text-destructive">{proposalError}</p>}
      </aside>
    </div>
  </div>
}
