import type { ReactNode } from "react"
import { ArrowLeft, Check, ChevronDown, GitCommitHorizontal, Tag, Trash2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/DropdownMenu/DropdownMenu"
import type { LuaProject, LuaRelease } from "./api"
import { smallButton } from "./moduleUi"
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
  /** Opens the full releases table, which also lists releases whose files were removed. */
  onShowAll: () => void
  children?: ReactNode
}

/** The module's runnable builds as a timeline: main on top, then the releases that still have files, newest first. */
export function ModuleReleases({ project, latest, viewing, canTag, canRelease, busy, onView, onTag, onDelete, onShowAll, children }: Props) {
  const main = project.main
  const unreleased = !!main && latest?.sha256 !== main.sha256
  const releases = project.releases.filter(release => release.available)
  return <section className="rounded-xl border border-border/80 bg-card p-5 text-sm shadow-sm" aria-label="Releases">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold">Releases <span className="font-normal text-muted-foreground">{project.releases.length || ""}</span></h2>
      {canTag && <button type="button" className={`${smallButton} inline-flex items-center gap-1`} disabled={busy} onClick={onTag}><Tag className="size-3" /> Tag release</button>}
    </div>
    <p className="mt-1 text-xs text-muted-foreground">Panels run the latest release. Choose main in the panel picker to try unreleased changes.</p>
    <ol className="mt-4">
      {main && <Entry dot={unreleased ? "border-dashed border-muted-foreground bg-card" : "border-muted-foreground bg-muted-foreground"} last={!releases.length}>
        <div className="flex items-baseline gap-2">
          <span className="font-mono font-semibold">main</span>
          <span className="text-xs text-muted-foreground">{unreleased ? "unreleased changes" : `same as ${latest?.tag}`}</span>
        </div>
        <p className="text-xs text-muted-foreground"><span title={exact(main.updated_at)}>Saved {timeAgo(main.updated_at)}</span> · <span className="font-mono" title={main.sha256}>{shortSha(main.sha256)}</span></p>
        <ViewLink active={viewing === MAIN_REF} onClick={() => onView(MAIN_REF)} />
      </Entry>}
      {releases.map((release, index) => {
        const isLatest = release === latest
        return <Entry key={release.tag} last={index === releases.length - 1} dot={isLatest ? "border-emerald-400 bg-emerald-400" : "border-primary bg-primary"}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono font-semibold">{release.tag}</span>
            {isLatest && latestBadge}
          </div>
          <p className="text-xs text-muted-foreground">
            <span title={exact(release.published_at)}>{timeAgo(release.published_at)}</span>
            {release.published_by_author && <> · by <span className="text-foreground/80">{release.published_by_author}</span></>}
            {release.sha256 && <> · <span className="font-mono" title={release.sha256}>{shortSha(release.sha256)}</span></>}
          </p>
          <div className="flex items-center gap-3">
            <ViewLink active={viewing === release.tag} onClick={() => onView(release.tag)} />
            {canRelease && <DeleteButton release={release} busy={busy} onDelete={onDelete} />}
          </div>
        </Entry>
      })}
    </ol>
    {!project.releases.length && <p className="text-xs text-muted-foreground">{canRelease ? "Nothing released yet. Tag main when it is ready." : "Nothing released yet."}</p>}
    {!!project.releases.length && <button type="button" onClick={onShowAll} className="mt-4 text-xs text-primary underline-offset-2 hover:underline">
      See all {project.releases.length} {project.releases.length === 1 ? "release" : "releases"}{project.releases.length > releases.length && `, including ${project.releases.length - releases.length} without files`}</button>}
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

function DeleteButton({ release, busy, onDelete }: { release: LuaRelease; busy: boolean; onDelete: (release: LuaRelease) => void }) {
  return <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50" disabled={busy}
    aria-label={`Delete ${release.tag}`} onClick={() => onDelete(release)}><Trash2 className="size-3" /> Delete</button>
}

/** Every release, newest first, for the main column. Only the newest few keep their files. */
export function ReleasesTable({ project, latest, viewing, canRelease, busy, onView, onDelete, onClose }:
  Pick<Props, "project" | "latest" | "viewing" | "canRelease" | "busy" | "onView" | "onDelete"> & { onClose: () => void }) {
  const head = "px-4 py-2 text-left font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground"
  return <section aria-label="All releases" className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
    <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to files</button>
      <h2 className="text-sm font-medium">Releases <span className="font-normal text-muted-foreground">{project.releases.length}</span></h2>
      <span className="ml-auto text-xs text-muted-foreground">Only the newest releases keep their files.</span>
    </div>
    {!project.releases.length ? <p className="p-4 text-sm text-muted-foreground">Nothing released yet.</p> :
      <div className="overflow-x-auto styled-scrollbar"><table className="w-full text-sm">
        <thead className="border-b border-border/80"><tr>
          <th className={head}>Tag</th><th className={head}>Released</th><th className={`${head} hidden sm:table-cell`}>By</th>
          <th className={`${head} hidden md:table-cell`}>Build</th><th className={`${head} text-right`}>Files</th>
        </tr></thead>
        <tbody className="divide-y divide-border/60">{project.releases.map(release =>
          <tr key={release.tag} className={release.available ? "" : "text-muted-foreground"}>
            <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="font-mono font-semibold">{release.tag}</span>{release === latest && latestBadge}</span></td>
            <td className="whitespace-nowrap px-4 py-2.5" title={exact(release.published_at)}>{timeAgo(release.published_at)}</td>
            <td className="hidden px-4 py-2.5 sm:table-cell">{release.published_by_author ?? "—"}</td>
            <td className="hidden px-4 py-2.5 font-mono text-xs md:table-cell" title={release.sha256}>{release.sha256 ? shortSha(release.sha256) : "—"}</td>
            <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-3">
              {release.available ? <ViewLink active={viewing === release.tag} onClick={() => onView(release.tag)} /> :
                <span className="text-xs text-muted-foreground/70" title="Only the newest releases keep their files">Files removed</span>}
              {canRelease && <DeleteButton release={release} busy={busy} onDelete={onDelete} />}
            </div></td>
          </tr>)}</tbody>
      </table></div>}
  </section>
}

function ViewLink({ active, onClick }: { active: boolean; onClick: () => void }) {
  return active ? <span className="text-xs font-medium text-primary">Viewing files</span> :
    <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={onClick}>View files</button>
}

const latestBadge = <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">Latest</span>

/** Picks which build's files to show: the latest release by default, older releases and main from the menu. */
export function VersionPicker({ project, latest, viewing, onView }: Pick<Props, "project" | "latest" | "onView"> & { viewing: PackageRef }) {
  const main = project.main
  const item = (ref: PackageRef, label: ReactNode, detail: string, disabled = false) =>
    <DropdownMenuItem key={ref} disabled={disabled} onSelect={() => onView(ref)} className="flex items-center gap-2">
      <Check className={`size-3.5 shrink-0 ${viewing === ref ? "" : "invisible"}`} />
      <span className="flex min-w-0 flex-1 items-center gap-2">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>
    </DropdownMenuItem>
  return <DropdownMenu>
    <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent" aria-label="Version">
      {viewing === MAIN_REF ? <GitCommitHorizontal className="size-3.5 text-muted-foreground" /> : <Tag className="size-3.5 text-muted-foreground" />}
      <span className="font-mono font-semibold">{viewing}</span>
      {viewing === latest?.tag && latestBadge}
      <ChevronDown className="size-3.5 text-muted-foreground" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-72">
      <DropdownMenuLabel className="text-xs text-muted-foreground">Releases</DropdownMenuLabel>
      {project.releases.map(release => item(release.tag,
        <><span className="truncate font-mono">{release.tag}</span>{release === latest && latestBadge}</>,
        release.available ? timeAgo(release.published_at) : "files removed", !release.available))}
      {!project.releases.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing released yet.</p>}
      {main && <>
        <DropdownMenuSeparator />
        {item(MAIN_REF, <span className="font-mono">main</span>, latest?.sha256 === main.sha256 ? `same as ${latest.tag}` : "unreleased changes")}
      </>}
    </DropdownMenuContent>
  </DropdownMenu>
}
