import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowLeft, BookOpen, Code2, Download, FileCode, FileImage, FileJson, FileText, GitCommitHorizontal, Tag, Trash2, Upload } from "lucide-react"
import { addonPath, createRelease, deleteRelease, latestRelease, nextReleaseTag, uploadDraft } from "./api"
import { AddonIcon } from "./AddonIcon"
import { AddonAiUsage, AddonContributors } from "./AddonTeam"
import { useAddonPage } from "./addonRoute"
import { card, errorMessage, kindLabel, smallButton } from "./addonUi"
import { browsableRefs, defaultRef, formatBytes, isImagePath, MAIN_REF, manifestSummary, packageDownloadURL, packageSha, readPackageFiles, shortSha, type PackageFile, type PackageRef } from "./packageFiles"

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
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
  const { projectId } = useParams<{ projectId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useSearchParams()
  const pageQuery = useAddonPage()
  const project = pageQuery.data?.project ?? null
  const can = pageQuery.data?.permissions
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [archive, setArchive] = useState<File | null>(null)

  // /addons/<id> keeps working, but shows the addon's named address once it has one.
  useEffect(() => {
    if (projectId && project?.author) navigate(addonPath(project) + location.search, { replace: true })
  }, [projectId, project, navigate, location.search])

  const requested = search.get("ref") as PackageRef | null
  const ref = project && (requested && packageSha(project, requested) ? requested : defaultRef(project))
  const sha = project && ref ? packageSha(project, ref) : null
  const filesQuery = useQuery({
    queryKey: ["lua-package-files", project?.id, ref, sha], enabled: !!project && !!ref && !!sha,
    staleTime: Infinity, // Hash-addressed packages never change.
    queryFn: async ({ signal }) => {
      const response = await fetch(packageDownloadURL(project!, sha!), { signal, credentials: "same-origin" })
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

  // The default build stays out of the URL, so the page keeps following the latest release.
  function show(next: { ref?: PackageRef | null; file?: string | null }) {
    setSearch(current => {
      const params = new URLSearchParams(current)
      if (next.ref !== undefined) {
        if (next.ref && project && next.ref !== defaultRef(project)) params.set("ref", next.ref)
        else params.delete("ref")
        params.delete("file")
      }
      if (next.file) params.set("file", next.file)
      else if (next.file === null) params.delete("file")
      return params
    }, { replace: true })
  }

  async function mutate(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
      await pageQuery.refetch()
      setNotice(message)
    } catch (e) {
      setError(errorMessage(e))
      // Conflicts must refresh revision before retry, never blindly reuse an old revision.
      if (e instanceof Error && "status" in e && e.status === 409) void pageQuery.refetch()
    } finally { setBusy(false) }
  }

  if (pageQuery.isPending) return <main className="container mx-auto px-4 py-10">Loading addon…</main>
  if (!project || !can) return <main className="container mx-auto px-4 py-10"><Link to="/addons">← Addons</Link><p role="alert" className="mt-4">{pageQuery.error ? errorMessage(pageQuery.error) : "Addon not found."}</p></main>

  const latest = latestRelease(project)
  const refs = browsableRefs(project)
  const refIcon = ref === MAIN_REF ? project.main?.icon : project.releases.find(release => release.tag === ref)?.icon
  const workshop = addonPath(project, "/edit")
  const canTag = can.release && !!project.main && latest?.sha256 !== project.main.sha256
  const tagRelease = () => {
    const tag = window.prompt("Tag this release. Everyone running the addon gets it:", nextReleaseTag(project.releases))?.trim()
    if (tag) void mutate(async () => { await createRelease(project.id, project.revision, tag); show({ ref: null }) }, `Released ${tag}.`)
  }

  return <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
    <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/addons"><ArrowLeft className="size-4" /> All addons</Link>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-2xl font-semibold"><AddonIcon name={refIcon} className="size-6 text-muted-foreground" />{project.name}
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">{kindLabel(project.kind)}</span></h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {project.author ? <>by <span className="font-mono">{project.author}</span></> : "Unnamed author"}
          {can.edit && <span className="font-mono"> · /{project.slug} · revision {project.revision}</span>} · updated {formatDate(project.updated_at)}
        </p>
      </div>
      {project.kind === "panel" && can.edit && <Link className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" to={workshop}><Code2 className="size-4" /> Open in Addon Workshop</Link>}
    </header>
    {can.manage && !project.author && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      This addon has no named address yet. <Link className="text-primary underline underline-offset-2" to="/addons">Claim an author name</Link> to publish it at /addons/&lt;you&gt;/{project.slug}.</p>}
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}{error.includes("revision") && " Reload the project before retrying."}</p>}
    {notice && <p role="status" className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        {!ref || !sha ? <div className={`${card} text-sm text-muted-foreground`}>{can.edit
          ? <>No files yet. {project.kind === "panel" ? "Open the Addon Workshop and save to main, or upload" : "Upload"} a tar archive from Releases.</>
          : "This addon has not been published yet."}</div> : <>
          <section aria-label="Files" className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
              <div role="tablist" aria-label="Build" className="flex flex-wrap rounded-md border border-border bg-background p-0.5">
                {refs.map(option => <button key={option} type="button" role="tab" aria-selected={ref === option} onClick={() => show({ ref: option })}
                  className={`rounded px-2.5 py-1 font-mono text-xs font-medium ${ref === option ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{option}</button>)}
              </div>
              <span className="font-mono text-xs text-muted-foreground" title={sha}>{shortSha(sha)}</span>
              {files && <span className="text-xs text-muted-foreground">{files.length} {files.length === 1 ? "file" : "files"}</span>}
              <a className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={packageDownloadURL(project, sha)} download={`${project.slug}-${shortSha(sha)}.zip`}><Download className="size-3.5" /> Download</a>
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
              : <p className="p-6 text-sm text-muted-foreground">This build has no README.md. {project.kind === "panel" && can.edit && <>Add one from the README.md tab in the <Link className="text-primary underline underline-offset-2" to={workshop}>Addon Workshop</Link>.</>}</p>}
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
          </dl> : <p className="text-xs text-muted-foreground">{ref ? "Details appear once the files load." : "Details appear once a build exists."}</p>}
          {/* Cost stays with the people building the addon; visitors never see it. */}
          {can.edit && project.kind === "panel" && <AddonAiUsage projectId={project.id} />}
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">Created {formatDate(project.created_at)} · <Link className="text-primary underline-offset-2 hover:underline" to="/addons/api">API reference</Link></p>
        </section>
        <section className={`${card} space-y-2 text-sm`} aria-label="Releases">
          <h2 className="font-semibold">Releases</h2>
          <p className="text-xs text-muted-foreground">Panels run the latest release. Choose main in the panel picker to try unreleased changes.</p>
          <ul className="-mx-2 space-y-0.5">
            {project.main && <li className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${ref === MAIN_REF ? "bg-muted" : ""}`}>
              <button type="button" onClick={() => show({ ref: MAIN_REF })} className="min-w-0 flex-1 text-left" title="View the files saved to main">
                <span className="flex items-center gap-2 font-medium"><GitCommitHorizontal className="size-4 text-muted-foreground" /><span className="font-mono">main</span>
                  <span className="font-mono text-xs font-normal text-muted-foreground" title={project.main.sha256}>{shortSha(project.main.sha256)}</span></span>
                <span className="block pl-6 text-xs text-muted-foreground">Saved {formatDate(project.main.updated_at)}{latest?.sha256 === project.main.sha256 && ` · same as ${latest.tag}`}</span>
              </button>
              {canTag && <button type="button" className={`${smallButton} inline-flex items-center gap-1`} disabled={busy} onClick={tagRelease}><Tag className="size-3" /> Tag release</button>}
            </li>}
            {project.releases.map(release => <li key={release.tag} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${ref === release.tag ? "bg-muted" : ""} ${release.available ? "" : "opacity-50"}`}>
              <button type="button" disabled={!release.available} onClick={() => show({ ref: release.tag })} className="min-w-0 flex-1 text-left disabled:cursor-default"
                title={release.available ? `View the ${release.tag} files` : "Only the newest releases keep their files"}>
                <span className="flex items-center gap-2 font-medium"><Tag className="size-4 text-muted-foreground" /><span className="truncate font-mono">{release.tag}</span>
                  {release === latest && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-normal text-emerald-500">latest</span>}</span>
                <span className="block pl-6 text-xs text-muted-foreground">{formatDate(release.published_at)}{release.available ? "" : " · no longer available"}</span>
              </button>
              {can.release && <button type="button" className="text-muted-foreground hover:text-destructive disabled:opacity-50" disabled={busy} aria-label={`Delete ${release.tag}`}
                onClick={() => { if (window.confirm(release === latest ? `Delete ${release.tag}? Panels fall back to the previous release that still has files.` : `Delete ${release.tag}?`)) void mutate(() => deleteRelease(project.id, release.tag), `Deleted ${release.tag}.`) }}>
                <Trash2 className="size-3.5" /></button>}
            </li>)}
          </ul>
          {!project.releases.length && <p className="text-xs text-muted-foreground">{can.release ? "Nothing released yet. Tag main when it is ready." : "Nothing released yet."}</p>}
          {can.edit && <details className="border-t border-border pt-3 text-xs">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"><Upload className="size-3.5" /> Upload a tar archive</summary>
            <div className="mt-2 space-y-2">
              <p className="text-muted-foreground">An uncompressed tar with project.json at its root, a Lua entrypoint and an optional README.md. It replaces main.</p>
              <input type="file" accept=".tar,application/x-tar" className="block w-full" onChange={event => setArchive(event.target.files?.[0] ?? null)} />
              <button className={smallButton} type="button" disabled={busy || !archive} onClick={() => { if (archive) void mutate(() => uploadDraft(project.id, project.revision, archive), "Uploaded to main.") }}>Upload draft</button>
            </div>
          </details>}
        </section>
        {can.edit && <AddonContributors project={project} canManage={can.manage} />}
      </aside>
    </div>
  </main>
}
