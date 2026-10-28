import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowLeft, ArrowUpRight, BookOpen, Code2, Download, FileCode, FileImage, FileJson, FileText, FlaskConical, PencilLine, Plus, ShieldCheck, Upload } from "lucide-react"
import { useAuthorizationCheck, useSession } from "@/api/queries"
import { useInferenceContextUsage } from "@/features/chat/api"
import { describeUsage, formatUsage, usageFromApi } from "@/features/chat/usage"
import { createProject, getProject, listProjects, promoteStable, publishUnstable, uploadDraft, type LuaProject, type LuaProjectKind } from "./api"
import { AddonIcon } from "./AddonIcon"
import { defaultRef, formatBytes, isImagePath, manifestSummary, PACKAGE_REFS, packageDownloadURL, packageSha, readPackageFiles, shortSha, type PackageFile, type PackageRef } from "./packageFiles"

/** User-facing names for addon kinds; the API and manifests keep "panel" and "guide". */
const kindLabel = (kind: LuaProjectKind) => kind === "panel" ? "Instance panel" : "Guide"
const card = "rounded-xl border border-border/80 bg-card p-5 shadow-sm"
const button = "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again."
}

export function LuaProjectsPage() {
  const [projects, setProjects] = useState<LuaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [kind, setKind] = useState<LuaProjectKind>("panel")
  const { data: session, isLoading: sessionLoading } = useSession()
  const createPermission = useAuthorizationCheck({ createLuaProject: "chronicle:chronicle#create_lua_project" }, { enabled: !!session })
  const canCreate = createPermission.data?.createLuaProject === true

  useEffect(() => {
    if (sessionLoading) return
    if (!session) { setProjects([]); setLoading(false); return }
    let active = true
    listProjects().then(items => { if (active) setProjects(items) }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, sessionLoading])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    setBusy(true)
    setError("")
    try {
      const project = await createProject(kind, name.trim(), slug.trim())
      setProjects(items => [project, ...items])
      setName("")
      setSlug("")
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return <main className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
    <header className="border-b pb-7">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Creator workspace / Addons</p>
      <h1 className="text-3xl font-semibold tracking-tight">Addons</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Build sandboxed Lua addons for Chronicle with the Addon Workshop. Keep a private draft, share an unstable release for testing, then promote exactly the version you tested.</p>
    </header>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_19rem]">
      <section aria-label="Your addons" className="space-y-3">
        <h2 className="text-lg font-semibold">Your addons</h2>
        {loading ? <p className="text-sm text-muted-foreground">Loading addons…</p> : projects.length === 0 ? <p className={card}>No addons yet. Create one to begin.</p> : projects.map(project =>
          <Link key={project.id} to={`/addons/${encodeURIComponent(project.id)}`} className={`${card} group flex items-center justify-between gap-4 hover:border-primary/50`}>
            <AddonIcon name={project.stable?.icon ?? project.unstable?.icon ?? project.draft_icon} className="size-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1"><span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{kindLabel(project.kind)} · r{project.revision}</span><h3 className="mt-1 font-semibold">{project.name}</h3><p className="font-mono text-xs text-muted-foreground">/{project.slug}</p></div>
            <ArrowUpRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
          </Link>) }
      </section>
      {canCreate ? <form onSubmit={create} className={`${card} h-fit space-y-4`}>
        <div className="flex items-center gap-2"><Plus className="size-4" /><h2 className="font-semibold">New addon</h2></div>
        <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>
        <label className="block text-sm font-medium">Slug<input className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono" value={slug} onChange={event => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required /><span className="mt-1 block text-xs text-muted-foreground">Lowercase letters, numbers and hyphens.</span></label>
        <label className="block text-sm font-medium">Kind<select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={kind} onChange={event => setKind(event.target.value as LuaProjectKind)}><option value="panel">{kindLabel("panel")}</option><option value="guide">{kindLabel("guide")}</option></select></label>
        <button className={button} disabled={busy} type="submit">{busy ? "Creating…" : "Create addon"}</button>
      </form> : <div className={`${card} h-fit text-sm`}>
        {sessionLoading || (session && createPermission.isPending) ? <p>Checking addon creation permission…</p> :
          <p role="alert" className="text-destructive">{!session ? "Sign in to create addons." :
            createPermission.isError ? "Could not check addon creation permission. Please try again." :
              "You do not have permission to create addons. Ask a technical administrator for the Addon Author role."}</p>}
      </div>}
    </div>
  </main>
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
const refLabel: Record<PackageRef, string> = { stable: "Stable", unstable: "Unstable", draft: "Draft" }
const prose = "prose prose-sm dark:prose-invert max-w-none prose-a:text-primary prose-pre:bg-muted/60 prose-pre:text-foreground prose-code:font-normal prose-code:before:content-none prose-code:after:content-none [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5"

function fileIcon(path: string) {
  const className = "size-4 shrink-0 text-muted-foreground"
  if (path === "README.md") return <BookOpen className={className} />
  if (path.endsWith(".json")) return <FileJson className={className} />
  if (path.endsWith(".lua")) return <FileCode className={className} />
  return isImagePath(path) ? <FileImage className={className} /> : <FileText className={className} />
}

/** Renders the package README. Raw HTML is not rendered, and images only load from the package itself. */
function Readme({ text, images }: { text: string; images: ReadonlyMap<string, string> }) {
  const components: Components = {
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
    img: ({ src, alt }) => {
      const url = typeof src === "string" ? images.get(src.replace(/^\.\//, "")) : undefined
      return url ? <img src={url} alt={alt ?? ""} /> : <span className="text-muted-foreground">[{alt || "image"}]</span>
    },
  }
  return <article className={`${prose} p-6`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown></article>
}

function FileViewer({ file, images }: { file: PackageFile; images: ReadonlyMap<string, string> }) {
  const lines = useMemo(() => isImagePath(file.path) ? [] : new TextDecoder().decode(file.bytes).split("\n"), [file])
  if (file.path === "README.md") return <Readme text={lines.join("\n")} images={images} />
  if (isImagePath(file.path)) return <div className="p-6"><img src={images.get(file.path)} alt={file.path} className="max-w-full rounded border border-border" /></div>
  return <div className="styled-scrollbar overflow-x-auto py-3">
    <table className="font-mono text-xs leading-5"><tbody>{lines.map((line, index) => <tr key={index}>
      <td className="select-none px-4 text-right align-top text-muted-foreground/60">{index + 1}</td>
      <td className="whitespace-pre pr-4">{line}</td>
    </tr>)}</tbody></table>
  </div>
}

export function LuaProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [search, setSearch] = useSearchParams()
  const [project, setProject] = useState<LuaProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [archive, setArchive] = useState<File | null>(null)

  useEffect(() => {
    if (!projectId) return
    let active = true
    getProject(projectId).then(value => { if (active) setProject(value) }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  const requested = search.get("ref") as PackageRef | null
  const ref = project && (requested && PACKAGE_REFS.includes(requested) && packageSha(project, requested) ? requested : defaultRef(project))
  const sha = project && ref ? packageSha(project, ref) : null
  const filesQuery = useQuery({
    queryKey: ["lua-package-files", project?.id, ref, sha], enabled: !!project && !!ref && !!sha,
    staleTime: Infinity, // Hash-addressed packages never change.
    queryFn: async ({ signal }) => {
      const response = await fetch(packageDownloadURL(project!, ref!, sha!), { signal, credentials: "same-origin" })
      if (!response.ok) throw new Error(`Package unavailable (${response.status})`)
      return readPackageFiles(new Uint8Array(await response.arrayBuffer()))
    },
  })
  const files = filesQuery.data
  const images = useMemo(() => new Map((files ?? []).filter(file => isImagePath(file.path))
    .map(file => [file.path, URL.createObjectURL(new Blob([new Uint8Array(file.bytes)]))])), [files])
  useEffect(() => () => { for (const url of images.values()) URL.revokeObjectURL(url) }, [images])
  const selected = files?.find(file => file.path === search.get("file")) ?? files?.find(file => file.path === "README.md")
  const about = files ? manifestSummary(files) : null
  // Only the viewer's own Workshop chats count; the query fails quietly without AI access.
  const aiUsage = useInferenceContextUsage("lua_project", project?.id, project?.kind === "panel")

  function show(next: { ref?: PackageRef; file?: string | null }) {
    setSearch(current => {
      const params = new URLSearchParams(current)
      if (next.ref) { params.set("ref", next.ref); params.delete("file") }
      if (next.file) params.set("file", next.file)
      else if (next.file === null) params.delete("file")
      return params
    }, { replace: true })
  }

  async function mutate(action: () => Promise<unknown>, message: string) {
    if (!projectId) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
      setProject(await getProject(projectId))
      setNotice(message)
    } catch (e) {
      setError(errorMessage(e))
      // Conflicts must refresh revision before retry, never blindly reuse an old revision.
      if (e instanceof Error && "status" in e && e.status === 409) {
        getProject(projectId).then(setProject).catch(() => {})
      }
    } finally { setBusy(false) }
  }

  if (!projectId) return <p role="alert">Missing project ID.</p>
  if (loading) return <main className="container mx-auto px-4 py-10">Loading project…</main>
  if (!project) return <main className="container mx-auto px-4 py-10"><Link to="/addons">← Addons</Link><p role="alert">{error || "Addon not found."}</p></main>

  const { stable, unstable } = project
  const draft = project.draft_sha256
  const smallButton = "rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
  const releaseRow = (rowRef: PackageRef, rowSha: string | null, detail: string, action?: ReactNode) =>
    <li key={rowRef} className={`flex items-center gap-3 rounded-md px-2 py-2 ${ref === rowRef ? "bg-muted" : ""}`}>
      <button type="button" disabled={!rowSha} onClick={() => show({ ref: rowRef })} className="min-w-0 flex-1 text-left disabled:cursor-default" title={rowSha ? `View the ${refLabel[rowRef].toLowerCase()} files` : undefined}>
        <span className="flex items-center gap-2 text-sm font-medium">
          {rowRef === "stable" ? <ShieldCheck className="size-4 text-emerald-500" /> : rowRef === "unstable" ? <FlaskConical className="size-4 text-amber-500" /> : <PencilLine className="size-4 text-muted-foreground" />}
          {refLabel[rowRef]}
          {rowSha && <span className="font-mono text-xs font-normal text-muted-foreground" title={rowSha}>{shortSha(rowSha)}</span>}
        </span>
        <span className="block pl-6 text-xs text-muted-foreground">{detail}</span>
      </button>
      {action}
    </li>

  return <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
    <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/addons"><ArrowLeft className="size-4" /> All addons</Link>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-2xl font-semibold"><AddonIcon name={ref === "draft" ? project.draft_icon : ref ? project[ref]?.icon : undefined} className="size-6 text-muted-foreground" />{project.name}
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">{kindLabel(project.kind)}</span></h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">/{project.slug} · revision {project.revision} · updated {formatDate(project.updated_at)}</p>
      </div>
      {project.kind === "panel" && <Link className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" to={`/addons/${encodeURIComponent(project.id)}/edit`}><Code2 className="size-4" /> Open in Addon Workshop</Link>}
    </header>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}{error.includes("revision") && " Reload the project before retrying."}</p>}
    {notice && <p role="status" className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        {!ref || !sha ? <div className={`${card} text-sm text-muted-foreground`}>No files yet. {project.kind === "panel" ? "Open the Addon Workshop to write your first draft, or upload" : "Upload"} a tar archive from Releases.</div> : <>
          <section aria-label="Files" className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
              <div role="tablist" aria-label="Build" className="flex rounded-md border border-border bg-background p-0.5">
                {PACKAGE_REFS.map(option => <button key={option} type="button" role="tab" aria-selected={ref === option} disabled={!packageSha(project, option)} onClick={() => show({ ref: option })}
                  className={`rounded px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${ref === option ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{refLabel[option]}</button>)}
              </div>
              <span className="font-mono text-xs text-muted-foreground" title={sha}>{shortSha(sha)}</span>
              {files && <span className="text-xs text-muted-foreground">{files.length} {files.length === 1 ? "file" : "files"}</span>}
              <a className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={packageDownloadURL(project, ref, sha)} download={`${project.slug}-${shortSha(sha)}.zip`}><Download className="size-3.5" /> Download</a>
            </div>
            {filesQuery.isPending ? <p className="p-4 text-sm text-muted-foreground">Loading files…</p>
              : filesQuery.isError ? <p role="alert" className="p-4 text-sm text-destructive">{filesQuery.error.message}</p>
              : <ul className="divide-y divide-border/60">{files!.map(file => <li key={file.path}>
                <button type="button" onClick={() => show({ file: file.path })} aria-current={selected?.path === file.path}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/60 ${selected?.path === file.path ? "bg-muted" : ""}`}>
                  {fileIcon(file.path)}<span className="min-w-0 flex-1 truncate font-mono text-[13px]">{file.path}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.bytes.byteLength)}</span>
                </button>
              </li>)}</ul>}
          </section>
          {files && <section aria-label={selected?.path ?? "README"} className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium">
              {fileIcon(selected?.path ?? "README.md")}<span className="font-mono text-[13px]">{selected?.path ?? "README.md"}</span>
              {selected && selected.path !== "README.md" && files.some(file => file.path === "README.md") &&
                <button type="button" className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground" onClick={() => show({ file: null })}>Show README</button>}
            </div>
            {selected ? <FileViewer file={selected} images={images} />
              : <p className="p-6 text-sm text-muted-foreground">This build has no README.md. {project.kind === "panel" && <>Add one from the README.md tab in the <Link className="text-primary underline underline-offset-2" to={`/addons/${encodeURIComponent(project.id)}/edit`}>Addon Workshop</Link>.</>}</p>}
          </section>}
        </>}
      </div>
      <aside className="space-y-4">
        <section className={`${card} space-y-3 text-sm`} aria-label="About">
          <h2 className="font-semibold">About</h2>
          {about ? <dl className="space-y-2 text-xs">
            <div><dt className="text-muted-foreground">Streams</dt><dd className="mt-1 flex flex-wrap gap-1">{about.streams.length ? about.streams.map(stream =>
              <span key={stream} className="rounded bg-muted px-1.5 py-0.5 font-mono">{stream}</span>) : <span className="text-muted-foreground">None</span>}</dd></div>
            <div><dt className="text-muted-foreground">Capabilities</dt><dd className="mt-1 font-mono">{about.capabilities.join(", ") || "None"}</dd></div>
            <div><dt className="text-muted-foreground">Replays</dt><dd className="mt-1">{about.streamScope === "instance" ? "Whole instance" : "Selected encounters"}{about.maxEvents !== undefined && `, up to ${about.maxEvents.toLocaleString()} events`}</dd></div>
          </dl> : <p className="text-xs text-muted-foreground">{ref ? "Details appear once the files load." : "Details appear after the first draft."}</p>}
          {aiUsage.data && aiUsage.data.calls > 0 && <div className="text-xs" title={describeUsage(usageFromApi(aiUsage.data))}>
            <p className="text-muted-foreground">AI assistant</p>
            <p className="mt-1 tabular-nums">{formatUsage(usageFromApi(aiUsage.data))}</p>
          </div>}
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">Created {formatDate(project.created_at)} · <Link className="text-primary underline-offset-2 hover:underline" to="/addons/api">API reference</Link></p>
        </section>
        <section className={`${card} space-y-2 text-sm`} aria-label="Releases">
          <h2 className="font-semibold">Releases</h2>
          <ul className="-mx-2 space-y-1">
            {releaseRow("stable", stable?.sha256 ?? null, stable ? `Published ${formatDate(stable.published_at)}` : "Not promoted yet")}
            {releaseRow("unstable", unstable?.sha256 ?? null, unstable ? `Published ${formatDate(unstable.published_at)} · for testing` : "Not published yet",
              unstable && unstable.sha256 !== stable?.sha256 && <button type="button" className={smallButton} disabled={busy}
                onClick={() => { if (window.confirm(`Promote unstable build ${shortSha(unstable.sha256)} to stable? Everyone using this addon gets it.`)) void mutate(() => promoteStable(project.id, project.revision, unstable.sha256), "Stable release promoted.") }}>Promote</button>)}
            {releaseRow("draft", draft, draft ? "Private, saved from the Workshop or an upload" : "No draft saved",
              draft && draft !== unstable?.sha256 && <button type="button" className={smallButton} disabled={busy}
                onClick={() => { if (window.confirm("Publish this draft to the public unstable channel?")) void mutate(() => publishUnstable(project.id, project.revision), "Unstable release published.") }}>Publish</button>)}
          </ul>
          <p className="text-xs text-muted-foreground">Test an unstable build on a real instance before promoting it.</p>
          <details className="border-t border-border pt-3 text-xs">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"><Upload className="size-3.5" /> Upload a tar archive</summary>
            <div className="mt-2 space-y-2">
              <p className="text-muted-foreground">An uncompressed tar with project.json at its root, a Lua entrypoint and an optional README.md. It replaces the draft.</p>
              <input type="file" accept=".tar,application/x-tar" className="block w-full" onChange={event => setArchive(event.target.files?.[0] ?? null)} />
              <button className={smallButton} type="button" disabled={busy || !archive} onClick={() => { if (archive) void mutate(() => uploadDraft(project.id, project.revision, archive), "Draft uploaded. Review it before publishing.") }}>Upload draft</button>
            </div>
          </details>
        </section>
      </aside>
    </div>
  </main>
}
