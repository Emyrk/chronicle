import { Link, useNavigate } from "react-router-dom"
import { ArrowUpRight, Star, Users } from "lucide-react"
import { addonPath, latestRelease, type LuaProject } from "./api"
import { AddonIcon } from "./AddonIcon"
import { card, kindLabel } from "./addonUi"
import { timeAgo } from "./packageFiles"

/** One addon in a list. `shared` marks addons someone else owns and shared with the viewer. */
export function AddonCard({ project, shared = false }: { project: LuaProject; shared?: boolean }) {
  const latest = latestRelease(project)
  return <Link to={addonPath(project)} className={`${card} group flex items-center justify-between gap-4 hover:border-primary/50`}>
    <AddonIcon name={latest?.icon ?? project.main?.icon} className="size-6 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{kindLabel(project.kind)} · {latest ? latest.tag : "not released"}</span>
      <h3 className="mt-1 flex items-center gap-2 font-semibold">{project.name}
        {shared && <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground"><Users className="size-3" /> Shared with you</span>}</h3>
      {project.description && <p className="truncate text-sm text-muted-foreground" title={project.description}>{project.description}</p>}
      <p className="truncate font-mono text-xs text-muted-foreground">{addonPath(project)}</p>
    </div>
    <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground" title={`${project.stars} people track this addon`}>
      <Star className={`size-3.5 ${project.starred ? "fill-amber-300 text-amber-300" : ""}`} />{project.stars.toLocaleString()}</span>
    <ArrowUpRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
  </Link>
}

/** The /addons gallery: one row per addon, in the order given. Rows open the addon page. */
export function AddonTable({ projects, ranked }: { projects: LuaProject[]; ranked: boolean }) {
  const navigate = useNavigate()
  const head = "px-3 py-2 text-left font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground"
  return <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
    <table className="w-full text-sm">
      <thead className="border-b border-border/80 bg-muted/30"><tr>
        {ranked && <th className={`${head} w-10 text-right`}>#</th>}
        <th className={`${head} w-full`}>Addon</th>
        <th className={`${head} hidden md:table-cell`}>Author</th>
        <th className={`${head} hidden sm:table-cell`}>Version</th>
        <th className={`${head} hidden lg:table-cell`}>Released</th>
        <th className={`${head} text-right`}>Stars</th>
      </tr></thead>
      <tbody className="divide-y divide-border/60">{projects.map((project, index) => {
        const latest = latestRelease(project)
        return <tr key={project.id} onClick={() => navigate(addonPath(project))} className="group cursor-pointer hover:bg-accent/40">
          {ranked && <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{index + 1}</td>}
          <td className="max-w-0 px-3 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background">
                <AddonIcon name={latest?.icon ?? project.main?.icon} className="size-5 text-muted-foreground group-hover:text-primary" /></span>
              <div className="min-w-0">
                <Link to={addonPath(project)} onClick={event => event.stopPropagation()} className="block truncate font-medium hover:underline">{project.name}</Link>
                <p className="truncate text-xs text-muted-foreground" title={project.description || undefined}>{project.description || kindLabel(project.kind)}<span className="md:hidden">{project.author && ` · by ${project.author}`}</span></p>
              </div>
            </div>
          </td>
          <td className="hidden whitespace-nowrap px-3 py-3 text-muted-foreground md:table-cell">{project.author ?? "Unknown"}</td>
          <td className="hidden px-3 py-3 font-mono text-xs sm:table-cell">{latest?.tag ?? "—"}</td>
          <td className="hidden whitespace-nowrap px-3 py-3 text-muted-foreground lg:table-cell">{latest ? timeAgo(latest.published_at) : "—"}</td>
          <td className="px-3 py-3 text-right" title={`${project.stars} people track this addon`}>
            <span className={`inline-flex items-center gap-1 tabular-nums ${project.starred ? "text-amber-200" : "text-muted-foreground"}`}>
              <Star className={`size-3.5 ${project.starred ? "fill-amber-300 text-amber-300" : ""}`} />{project.stars.toLocaleString()}</span></td>
        </tr>
      })}</tbody>
    </table>
  </div>
}
