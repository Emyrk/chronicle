import { useState, type FormEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Trash2, UserPlus } from "lucide-react"
import { describeUsage, formatUsage, usageFromApi, addUsage, type ChatUsage } from "@/features/chat/usage"
import { getContributorUsage, listContributors, putContributor, removeContributor, urlNameInput, type LuaContributorPermission, type LuaProject, type LuaProjectContributor } from "./api"
import { errorMessage, smallButton } from "./addonUi"

const PERMISSIONS: { id: LuaContributorPermission; label: string; title: string }[] = [
  { id: "edit", label: "Edit", title: "Open the Workshop and save to main" },
  { id: "release", label: "Release", title: "Tag main as a release, and delete releases" },
]

const contributorName = (contributor: LuaProjectContributor) => contributor.author || contributor.username

/** People the owner shared the addon with, in the main column. Anyone who can edit sees the list; only the owner changes it. */
export function AddonContributors({ project, canManage, onClose }: { project: Pick<LuaProject, "id" | "author">; canManage: boolean; onClose: () => void }) {
  const query = useQuery({ queryKey: ["addon-contributors", project.id], queryFn: () => listContributors(project.id) })
  const [author, setAuthor] = useState("")
  const [grants, setGrants] = useState<LuaContributorPermission[]>(["edit"])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function save(action: () => Promise<LuaProjectContributor[]>) {
    setBusy(true); setError("")
    try { await action(); await query.refetch(); return true }
    catch (reason) { setError(errorMessage(reason)); return false }
    finally { setBusy(false) }
  }
  async function add(event: FormEvent) {
    event.preventDefault()
    if (await save(() => putContributor(project.id, author, grants))) setAuthor("")
  }
  const toggle = (list: LuaContributorPermission[], id: LuaContributorPermission) =>
    list.includes(id) ? list.filter(item => item !== id) : [...list, id]
  const chip = (on: boolean) => `rounded px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`

  return <section aria-label="Contributors" className="overflow-hidden rounded-xl border border-border/80 bg-card text-sm shadow-sm">
    <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to files</button>
      <h2 className="text-sm font-medium">Contributors <span className="font-normal text-muted-foreground">{query.data?.length || ""}</span></h2>
      {project.author && <span className="ml-auto text-xs text-muted-foreground">Owned by <span className="font-mono">{project.author}</span>, who can do everything.</span>}
    </div>
    {query.isPending ? <p className="p-4 text-muted-foreground">Loading…</p>
      : query.isError ? <p role="alert" className="p-4 text-destructive">{query.error.message}</p>
      : query.data.length === 0 ? <p className="p-4 text-muted-foreground">{canManage ? "Not shared with anyone yet." : "No other contributors."}</p>
      : <ul className="divide-y divide-border/60">{query.data.map(contributor => <li key={contributor.user_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate font-medium" title={contributor.username}>{contributorName(contributor)}</span>
        <div className="flex flex-wrap gap-1">{PERMISSIONS.map(permission => {
          const on = contributor.permissions.includes(permission.id)
          if (!canManage) return on && <span key={permission.id} className="rounded bg-muted px-2 py-0.5 text-xs">{permission.label}</span>
          const next = toggle(contributor.permissions as LuaContributorPermission[], permission.id)
          return <button key={permission.id} type="button" title={permission.title} aria-pressed={on} disabled={busy || !contributor.author || next.length === 0}
            onClick={() => void save(() => putContributor(project.id, contributor.author!, next))} className={chip(on)}>{permission.label}</button>
        })}</div>
        {canManage && contributor.author && <button type="button" className="text-muted-foreground hover:text-destructive disabled:opacity-50" disabled={busy}
          aria-label={`Remove ${contributorName(contributor)}`} onClick={() => void save(() => removeContributor(project.id, contributor.author!))}><Trash2 className="size-4" /></button>}
      </li>)}</ul>}
    {canManage && <form onSubmit={add} className="space-y-2 border-t border-border bg-muted/10 px-4 py-3">
      <label className="block text-xs font-medium" htmlFor="contributor-author">Share with an author name</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="contributor-author" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 font-mono text-xs sm:max-w-xs" value={author} placeholder="their-author-name"
          onChange={event => setAuthor(urlNameInput(event.target.value))} required />
        <div className="flex gap-1">{PERMISSIONS.map(permission => <button key={permission.id} type="button" title={permission.title} aria-pressed={grants.includes(permission.id)}
          onClick={() => setGrants(current => toggle(current, permission.id))} className={chip(grants.includes(permission.id))}>{permission.label}</button>)}</div>
        <button type="submit" className={`${smallButton} inline-flex items-center gap-1.5`} disabled={busy || !author || grants.length === 0}><UserPlus className="size-3.5" /> Share</button>
      </div>
      <p className="text-[11px] text-muted-foreground">They need an author name, which they claim on the Addons page.</p>
    </form>}
    {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
  </section>
}

/** AI assistant usage on the addon, per person. Hidden when the viewer has no AI access. */
export function AddonAiUsage({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["addon-ai-usage", projectId], queryFn: () => getContributorUsage(projectId), retry: false })
  if (!query.data?.length) return null
  const rows = query.data.map(row => ({ name: row.author || row.username, usage: usageFromApi(row.usage) }))
  const total = rows.reduce<ChatUsage | undefined>((sum, row) => addUsage(sum, row.usage), undefined)!
  return <div className="text-xs">
    <p className="text-muted-foreground">AI assistant</p>
    <p className="mt-1 tabular-nums" title={describeUsage(total)}>{formatUsage(total)}</p>
    {rows.length > 1 && <ul className="mt-1 space-y-0.5 text-muted-foreground">{rows.map(row =>
      <li key={row.name} className="flex justify-between gap-2 tabular-nums" title={describeUsage(row.usage)}><span className="truncate">{row.name}</span><span>{formatUsage(row.usage)}</span></li>)}</ul>}
  </div>
}
