import { Link } from "react-router-dom"
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
      <p className="truncate font-mono text-xs text-muted-foreground">{addonPath(project)}</p>
    </div>
    <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground" title={`${project.stars} people track this addon`}>
      <Star className={`size-3.5 ${project.starred ? "fill-amber-300 text-amber-300" : ""}`} />{project.stars.toLocaleString()}</span>
    <ArrowUpRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
  </Link>
}

/** One addon in the gallery: icon, name, author, then how many track it and its latest release. */
export function AddonTile({ project }: { project: LuaProject }) {
  const latest = latestRelease(project)
  return <Link to={addonPath(project)} className="group flex flex-col rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30">
    <div className="flex items-start justify-between gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background">
        <AddonIcon name={latest?.icon ?? project.main?.icon} className="size-6 text-muted-foreground group-hover:text-primary" /></span>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums ${project.starred ? "border-amber-300/40 bg-amber-300/10 text-amber-200" : "border-border text-muted-foreground"}`}
        title={`${project.stars} people track this addon`}>
        <Star className={`size-3.5 ${project.starred ? "fill-amber-300 text-amber-300" : ""}`} />{project.stars.toLocaleString()}</span>
    </div>
    <h3 className="mt-3 truncate font-semibold">{project.name}</h3>
    <p className="truncate text-sm text-muted-foreground">{project.author ? `by ${project.author}` : "Unknown author"}</p>
    <p className="mt-auto truncate pt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
      {kindLabel(project.kind)}{latest && <> · {latest.tag} · {timeAgo(latest.published_at)}</>}</p>
  </Link>
}
