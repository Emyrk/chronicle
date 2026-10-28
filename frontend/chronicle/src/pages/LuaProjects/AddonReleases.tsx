import type { ReactNode } from "react"
import { Tag, Trash2 } from "lucide-react"
import type { LuaProject, LuaRelease } from "./api"
import { smallButton } from "./addonUi"
import { MAIN_REF, shortSha, timeAgo, type PackageRef } from "./packageFiles"

const exact = (iso: string) => new Date(iso).toLocaleString()

type Props = {
  project: LuaProject
  latest?: LuaRelease
  /** The build whose files the page shows. */
  viewing: PackageRef | null
  canTag: boolean
  canRelease: boolean
  busy: boolean
  onView: (ref: PackageRef) => void
  onTag: () => void
  onDelete: (release: LuaRelease) => void
  children?: ReactNode
}

/** The addon's release history as a timeline: main on top when it has unreleased changes, then every tag, newest first. */
export function AddonReleases({ project, latest, viewing, canTag, canRelease, busy, onView, onTag, onDelete, children }: Props) {
  const main = project.main
  const unreleased = !!main && latest?.sha256 !== main.sha256
  return <section className="rounded-xl border border-border/80 bg-card p-5 text-sm shadow-sm" aria-label="Releases">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold">Releases <span className="font-normal text-muted-foreground">{project.releases.length || ""}</span></h2>
      {canTag && <button type="button" className={`${smallButton} inline-flex items-center gap-1`} disabled={busy} onClick={onTag}><Tag className="size-3" /> Tag release</button>}
    </div>
    <p className="mt-1 text-xs text-muted-foreground">Panels run the latest release. Choose main in the panel picker to try unreleased changes.</p>
    <ol className="mt-4">
      {main && <Entry dot={unreleased ? "border-dashed border-muted-foreground bg-card" : "border-muted-foreground bg-muted-foreground"} last={!project.releases.length}>
        <div className="flex items-baseline gap-2">
          <span className="font-mono font-semibold">main</span>
          <span className="text-xs text-muted-foreground">{unreleased ? "unreleased changes" : `same as ${latest?.tag}`}</span>
        </div>
        <p className="text-xs text-muted-foreground"><span title={exact(main.updated_at)}>Saved {timeAgo(main.updated_at)}</span> · <span className="font-mono" title={main.sha256}>{shortSha(main.sha256)}</span></p>
        <ViewLink active={viewing === MAIN_REF} onClick={() => onView(MAIN_REF)} />
      </Entry>}
      {project.releases.map((release, index) => {
        const isLatest = release === latest
        return <Entry key={release.tag} last={index === project.releases.length - 1}
          dot={!release.available ? "border-border bg-card" : isLatest ? "border-emerald-400 bg-emerald-400" : "border-primary bg-primary"}>
          <div className={`flex flex-wrap items-baseline gap-x-2 ${release.available ? "" : "opacity-60"}`}>
            <span className="font-mono font-semibold">{release.tag}</span>
            {isLatest && <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">Latest</span>}
            {!release.available && <span className="text-xs text-muted-foreground">no longer available</span>}
          </div>
          <p className={`text-xs text-muted-foreground ${release.available ? "" : "opacity-60"}`}>
            <span title={exact(release.published_at)}>{timeAgo(release.published_at)}</span>
            {release.published_by_author && <> · by <span className="text-foreground/80">{release.published_by_author}</span></>}
            {release.sha256 && <> · <span className="font-mono" title={release.sha256}>{shortSha(release.sha256)}</span></>}
          </p>
          <div className="flex items-center gap-3">
            {release.available ? <ViewLink active={viewing === release.tag} onClick={() => onView(release.tag)} /> :
              <span className="text-xs text-muted-foreground/70" title="Only the newest releases keep their files">Files removed</span>}
            {canRelease && <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50" disabled={busy}
              aria-label={`Delete ${release.tag}`} onClick={() => onDelete(release)}><Trash2 className="size-3" /> Delete</button>}
          </div>
        </Entry>
      })}
    </ol>
    {!project.releases.length && <p className="text-xs text-muted-foreground">{canRelease ? "Nothing released yet. Tag main when it is ready." : "Nothing released yet."}</p>}
    {children}
  </section>
}

function Entry({ dot, last, children }: { dot: string; last: boolean; children: ReactNode }) {
  return <li className="relative pb-4 pl-6 last:pb-0">
    {!last && <span aria-hidden="true" className="absolute left-[5px] top-4 bottom-0 w-px bg-border" />}
    <span aria-hidden="true" className={`absolute left-0 top-1 size-[11px] rounded-full border-2 ${dot}`} />
    <div className="space-y-0.5">{children}</div>
  </li>
}

function ViewLink({ active, onClick }: { active: boolean; onClick: () => void }) {
  return active ? <span className="text-xs font-medium text-primary">Viewing files</span> :
    <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={onClick}>View files</button>
}
