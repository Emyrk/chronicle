import { useState, type FormEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { Trash2, UserPlus } from "lucide-react"
import { describeUsage, formatUsage, usageFromApi, addUsage, type ChatUsage } from "@/features/chat/usage"
import { getContributorUsage, listContributors, putContributor, removeContributor, urlNameInput, type LuaContributorPermission, type LuaProject, type LuaProjectContributor } from "./api"
import { card, errorMessage, smallButton } from "./addonUi"

const PERMISSIONS: { id: LuaContributorPermission; label: string; title: string }[] = [
  { id: "edit", label: "Edit", title: "Open the Workshop and save drafts" },
  { id: "publish_unstable", label: "Publish unstable", title: "Publish a draft to the unstable channel" },
  { id: "publish", label: "Promote", title: "Promote the unstable release to stable" },
]

const contributorName = (contributor: LuaProjectContributor) => contributor.author || contributor.username

/** People the owner shared the addon with. Anyone who can edit sees the list; only the owner changes it. */
export function AddonContributors({ project, canManage }: { project: Pick<LuaProject, "id" | "author">; canManage: boolean }) {
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

  return <section className={`${card} space-y-3 text-sm`} aria-label="Contributors">
    <h2 className="font-semibold">Contributors</h2>
    {project.author && <p className="text-xs text-muted-foreground">Owned by <span className="font-mono">{project.author}</span>, who can do everything.</p>}
    {query.isPending ? <p className="text-xs text-muted-foreground">Loading…</p>
      : query.isError ? <p role="alert" className="text-xs text-destructive">{query.error.message}</p>
      : query.data.length === 0 ? <p className="text-xs text-muted-foreground">{canManage ? "Not shared with anyone yet." : "No other contributors."}</p>
      : <ul className="-mx-1 space-y-1">{query.data.map(contributor => <li key={contributor.user_id} className="rounded-md px-1 py-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium" title={contributor.username}>{contributorName(contributor)}</span>
          {canManage && contributor.author && <button type="button" className="text-muted-foreground hover:text-destructive disabled:opacity-50" disabled={busy}
            aria-label={`Remove ${contributorName(contributor)}`} onClick={() => void save(() => removeContributor(project.id, contributor.author!))}><Trash2 className="size-3.5" /></button>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">{PERMISSIONS.map(permission => {
          const on = contributor.permissions.includes(permission.id)
          if (!canManage) return on && <span key={permission.id} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{permission.label}</span>
          const next = toggle(contributor.permissions as LuaContributorPermission[], permission.id)
          return <button key={permission.id} type="button" title={permission.title} aria-pressed={on} disabled={busy || !contributor.author || next.length === 0}
            onClick={() => void save(() => putContributor(project.id, contributor.author!, next))}
            className={`rounded px-1.5 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{permission.label}</button>
        })}</div>
      </li>)}</ul>}
    {canManage && <form onSubmit={add} className="space-y-2 border-t border-border pt-3">
      <label className="block text-xs font-medium">Share with an author name
        <input className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs" value={author} placeholder="their-author-name"
          onChange={event => setAuthor(urlNameInput(event.target.value))} required />
      </label>
      <div className="flex flex-wrap gap-1">{PERMISSIONS.map(permission => <button key={permission.id} type="button" title={permission.title} aria-pressed={grants.includes(permission.id)}
        onClick={() => setGrants(current => toggle(current, permission.id))}
        className={`rounded px-1.5 py-0.5 text-[11px] ${grants.includes(permission.id) ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{permission.label}</button>)}</div>
      <button type="submit" className={`${smallButton} inline-flex items-center gap-1.5`} disabled={busy || !author || grants.length === 0}><UserPlus className="size-3.5" /> Share</button>
      <p className="text-[11px] text-muted-foreground">They need an author name, which they claim on the Addons page.</p>
    </form>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
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
