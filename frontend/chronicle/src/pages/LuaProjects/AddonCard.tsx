import { Link } from "react-router-dom"
import { ArrowUpRight, Star, Users } from "lucide-react"
import { addonPath, latestRelease, type LuaProject } from "./api"
import { AddonIcon } from "./AddonIcon"
import { card, kindLabel } from "./addonUi"

/** One addon in a list. `shared` marks addons someone else owns and shared with the viewer. */
export function AddonCard({ project, shared = false, showAuthor = false }: { project: LuaProject; shared?: boolean; showAuthor?: boolean }) {
  const latest = latestRelease(project)
  return <Link to={addonPath(project)} className={`${card} group flex items-center justify-between gap-4 hover:border-primary/50`}>
    <AddonIcon name={latest?.icon ?? project.main?.icon} className="size-6 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{kindLabel(project.kind)} · {latest ? latest.tag : "not released"}</span>
      <h3 className="mt-1 flex items-center gap-2 font-semibold">{project.name}
        {shared && <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground"><Users className="size-3" /> Shared with you</span>}</h3>
      <p className="truncate font-mono text-xs text-muted-foreground">{showAuthor && project.author ? `by ${project.author}` : addonPath(project)}</p>
    </div>
    <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground" title={`${project.stars} people track this addon`}>
      <Star className={`size-3.5 ${project.starred ? "fill-amber-300 text-amber-300" : ""}`} />{project.stars.toLocaleString()}</span>
    <ArrowUpRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
  </Link>
}
