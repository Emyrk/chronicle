import { Link, useNavigate } from "react-router-dom"
import { Star, Users } from "lucide-react"
import { modulePath, latestRelease, type LuaProject } from "./api"
import { badge, kindDot, kindLabel } from "./moduleUi"
import { timeAgo } from "./packageFiles"
import { fitsSite, MODULE_FLAVOR_TAGS, useSiteFlavor } from "./moduleFlavor"

/** One module in a GitHub-repo-style list: name and description up top, a colored kind dot and stats below. */
function ModuleRow({ project, rank, showAuthor, shared }: { project: LuaProject; rank?: number; showAuthor: boolean; shared: boolean }) {
  const navigate = useNavigate()
  const latest = latestRelease(project)
  const site = useSiteFlavor()
  return <li onClick={() => navigate(modulePath(project))} className="group flex cursor-pointer items-start gap-3 px-4 py-4 hover:bg-accent/30">
    {rank !== undefined && <span data-rank={rank} className="w-5 shrink-0 pt-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{rank}</span>}
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link to={modulePath(project)} onClick={event => event.stopPropagation()} className="truncate text-base text-sky-400 group-hover:underline">
          {showAuthor && project.author && <span>{project.author} / </span>}<span className="font-semibold">{project.name}</span></Link>
        {shared && <span className={badge}><Users className="size-3" /> Shared with you</span>}
        {!fitsSite(project, site) && <span className={`${badge} border-destructive/60 text-destructive`} title="This site does not use every flavor tag, so only you see it listed here.">Not on this site</span>}
      </div>
      {project.description && <p className="mt-0.5 truncate text-sm text-muted-foreground" title={project.description}>{project.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${kindDot(project.kind)}`} />{kindLabel(project.kind)}</span>
        {MODULE_FLAVOR_TAGS.filter(({ tag }) => project.flavor?.includes(tag)).map(({ tag, label, hint }) =>
          <span key={tag} title={hint} className={site.includes(tag) ? "" : "text-destructive"}>{label}</span>)}
        <span className="inline-flex items-center gap-1" title={`${project.stars} people track this module`}>
          <Star className={`size-3.5 ${project.starred ? "fill-amber-300 text-amber-300" : ""}`} />{project.stars.toLocaleString()}</span>
        <span className="whitespace-nowrap">{latest ? `${latest.tag} · updated ${timeAgo(latest.published_at)}` : "Not released"}</span>
      </div>
    </div>
  </li>
}

/**
 * A GitHub-repo-list style list of modules: `ranked` numbers them in the order given (popular order),
 * `showAuthor` is for cross-author listings, and `shared` marks every row as owned by someone else.
 */
export function ModuleList({ projects, ranked = false, showAuthor = false, shared = false }: { projects: LuaProject[]; ranked?: boolean; showAuthor?: boolean; shared?: boolean }) {
  return <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card">
    {projects.map((project, index) => <ModuleRow key={project.id} project={project} rank={ranked ? index + 1 : undefined} showAuthor={showAuthor} shared={shared} />)}
  </ul>
}
