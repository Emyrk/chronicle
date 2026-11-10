import type { CSSProperties, ReactNode } from "react"
import type { CareerLeaderboardBoard, CareerLeaderboardEntry, CareerLeaderboardRaid } from "@/api/typesGenerated"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/lib/utils"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { CLASS_CSS_VAR, CLASS_DISPLAY, SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay"
import { GuildName } from "../Hub/GuildRatings"
import { HubBanner, Segmented, SkeletonRows } from "../Hub/LeaderboardHub"
import { SpecIcon } from "../Ratings/RatingParts"
import { ratingEntryAttributes } from "../Ratings/ratingEntities"
import { ScopeBar } from "../Ratings/ScopeBar"
import { METRIC_THEMES, type RatingView } from "../Ratings/ratingThemes"
import {
  CAREER_METRICS,
  CAREER_TABS,
  careerRatingEntry,
  raidLabel,
  type CareerBoardsState,
  type CareerFilters,
  type CareerMetric,
} from "./careerLeaderboardModel"

const GUILD_GOLD = "#e6c36a"

const STATUS_TEXT: Record<string, string> = {
  weights_pending: "Mastery and Peak are not available on this site yet. Renown is unaffected.",
  configuration_pending: "Mastery and Peak are not available on this site yet. Renown is unaffected.",
  no_active_raids: "No raids count toward Mastery and Peak yet.",
}

/**
 * The overall career leaderboard: the hub's banner and filters with a Career
 * breadcrumb and one tab per metric. Ranks are not shown, matching the hub.
 */
export function CareerLeaderboard({ view, onView, filters, onFilters, realm, realms, onRealm, state, allHref }: {
  view: RatingView
  onView: (view: RatingView) => void
  filters: CareerFilters
  onFilters: (filters: CareerFilters) => void
  realm: string
  realms: readonly string[]
  onRealm: (realm: string) => void
  state: CareerBoardsState
  allHref?: string
}) {
  const isMobile = useIsMobile()
  const guildMode = filters.subject === "guilds"
  const { scope } = filters
  const crumbs = [
    { label: "Career" },
    ...(scope.cls ? [{ label: CLASS_DISPLAY[scope.cls], color: CLASS_CSS_VAR[scope.cls] }] : []),
    ...(scope.spec ? [{ label: scope.spec, color: CLASS_CSS_VAR[scope.cls!] }] : []),
  ]
  const status = state.status === "ready" ? state.data.status : undefined
  const notice = status && status !== "ready" ? STATUS_TEXT[status] ?? "Mastery and Peak are not available yet." : undefined
  const roleLabel = filters.role === "all" ? "DPS + Healing" : filters.role === "dps" ? "DPS" : "Healing"

  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      style={guildMode ? { backgroundImage: `radial-gradient(ellipse 90% 520px at 50% 0%, color-mix(in srgb, ${GUILD_GOLD} 7%, transparent), transparent)` } : undefined}
    >
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-3 py-4 sm:px-4 sm:py-8">
        <HubBanner
          guildMode={guildMode}
          background={getInstanceBackground("")}
          allHref={allHref}
          crumbs={crumbs}
          title={<h1 className="truncate font-wow text-xl sm:text-3xl">Career</h1>}
          realm={realm}
          realms={realms}
          onRealm={onRealm}
          subtitle={
            <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
              {guildMode
                ? "Every raid, weighted. Guild Mastery and Peak come from kill times."
                : "Every raid, weighted. Mastery and Peak come from each character's strongest spec; Renown adds up every spec."}
            </p>
          }
          tabs={CAREER_TABS}
          activeTab={view}
          onTab={onView}
          filters={
            <ScopeBar
              scope={scope}
              showBoss={false}
              classDisabled={guildMode ? "Guild ratings don't split by class. Switch to Characters to filter by class." : undefined}
              specs={scope.cls ? [...(SPEC_BY_CLASS[scope.cls] ?? [])] : []}
              onChange={(next) => onFilters({ ...filters, scope: { cls: next.cls, spec: next.spec, subSpec: next.subSpec } })}
              compact={isMobile}
              compactSummary={[scope.cls ? CLASS_DISPLAY[scope.cls] : undefined, scope.spec, guildMode ? undefined : roleLabel, guildMode ? "Guilds" : "Characters"].filter(Boolean).join(" · ")}
              extra={
                <>
                  {!guildMode && (
                    <Segmented
                      label="Role"
                      value={filters.role}
                      options={[
                        { value: "all", label: "All" },
                        { value: "dps", label: "DPS", color: "#e5484d" },
                        { value: "healing", label: "Healing", color: "#46a758" },
                      ]}
                      onChange={(role) => onFilters({ ...filters, role })}
                    />
                  )}
                  <Segmented
                    label="Rank"
                    value={filters.subject}
                    options={[
                      { value: "characters", label: "Characters", color: "#5b9bd5" },
                      { value: "guilds", label: "Guilds", color: GUILD_GOLD },
                    ]}
                    // Guild boards don't split by class, spec, or role.
                    onChange={(subject) => onFilters({ ...filters, subject, ...(subject === "guilds" ? { scope: {}, role: "all" } : {}) })}
                  />
                </>
              }
            />
          }
        />
        {notice && <p role="status" className="px-1 text-sm text-muted-foreground">{notice}</p>}
        {state.status === "error" ? (
          <p role="alert" className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{state.error}</p>
        ) : view === "overview" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {CAREER_METRICS.map((m) => (
              <OverviewBoard key={m} metric={m} guilds={guildMode} board={state.status === "ready" ? state.data[m] : undefined} onViewAll={() => onView(m)} />
            ))}
          </div>
        ) : (
          <FullBoard metric={view} guilds={guildMode} board={state.status === "ready" ? state.data[view] : undefined} />
        )}
      </div>
    </div>
  )
}

function boardTitle(metric: CareerMetric) {
  const theme = METRIC_THEMES[metric]
  return (
    <span className="flex items-center gap-2 font-semibold" style={{ color: theme.accent }}>
      <theme.icon className="size-4" />
      {metric === "mastery" ? "Mastery" : theme.label}
    </span>
  )
}

function value(entry: CareerLeaderboardEntry, metric: CareerMetric): number {
  return (metric === "renown" ? entry.renown : entry[metric]) ?? 0
}

/** One subject's identity: a character's spec icon, class-colored name, and guild; or a guild's logo. */
function SubjectName({ entry, metric, guilds, size }: { entry: CareerLeaderboardEntry; metric: CareerMetric; guilds: boolean; size: "sm" | "lg" }) {
  if (guilds) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <GuildName guild={entry.name} guildId={entry.subject_id} logo={entry.logo_url || undefined} size={size === "lg" ? "size-6" : "size-5"} />
      </span>
    )
  }
  const rating = careerRatingEntry(entry, metric)
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <SpecIcon cls={rating.cls} spec={rating.spec} className={cn("shrink-0 rounded-sm", size === "lg" ? "size-6" : "size-5")} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-medium" style={{ color: CLASS_CSS_VAR[rating.cls] }} {...ratingEntryAttributes(rating)}>{rating.name}</span>
          {rating.guild && <span className="min-w-0 truncate text-xs text-muted-foreground">&lt;{rating.guild}&gt;</span>}
        </span>
        {size === "lg" && (
          <span className="block truncate text-[11px] text-muted-foreground">{[rating.spec, entry.realm_name].filter(Boolean).join(" · ")}</span>
        )}
      </span>
    </span>
  )
}

function OverviewBoard({ metric, guilds, board, onViewAll }: { metric: CareerMetric; guilds: boolean; board?: CareerLeaderboardBoard; onViewAll: () => void }) {
  const theme = METRIC_THEMES[metric]
  const entries = board?.entries.slice(0, 10) ?? []
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={`${theme.label} career board`}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        {boardTitle(metric)}
        {!!board?.total && (
          <button type="button" onClick={onViewAll} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground hover:underline">
            All {board.total.toLocaleString()} →
          </button>
        )}
      </header>
      {!board ? <SkeletonRows rows={10} /> : entries.length === 0 ? <Empty /> : (
        <ol>
          {entries.map((e) => (
            <li key={e.subject_id} className="flex items-center gap-3 border-b border-white/5 px-4 py-2 last:border-b-0">
              <span className="min-w-0 flex-1 text-sm"><SubjectName entry={e} metric={metric} guilds={guilds} size="sm" /></span>
              <span className="shrink-0 font-mono text-sm tabular-nums">{theme.format(value(e, metric))}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const cell = "px-3 py-2 text-right font-mono text-muted-foreground tabular-nums"
const head = "px-3 py-2.5 text-right font-medium whitespace-nowrap"

function FullBoard({ metric, guilds, board }: { metric: CareerMetric; guilds: boolean; board?: CareerLeaderboardBoard }) {
  const theme = METRIC_THEMES[metric]
  const entries = board?.entries ?? []
  return (
    <section className="overflow-hidden rounded-xl border bg-card" style={{ "--metric": theme.accent } as CSSProperties} aria-label={`${theme.label} career board`}>
      <header className="border-b px-5 py-4">
        {boardTitle(metric)}
        <p className="mt-0.5 text-xs text-muted-foreground">{CAREER_TABS.find((t) => t.id === metric)?.description}</p>
      </header>
      {!board ? <SkeletonRows rows={10} /> : entries.length === 0 ? <Empty /> : (
        <div className="styled-scrollbar overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-2.5 text-left font-medium">{guilds ? "Guild" : "Character"}</th>
                <th className={head}>{metric === "mastery" ? "Mastery" : theme.label}</th>
                {metric === "mastery" && (
                  <>
                    <th className={cn(head, "hidden sm:table-cell")} title="Best performance against the benchmark, weighted across raids">Peak</th>
                    <th className={cn(head, "hidden sm:table-cell")} title="Typical performance against the benchmark, weighted across raids">Form</th>
                    <th className={cn(head, "hidden sm:table-cell")} title="The lower end of play, weighted across raids">Floor</th>
                    <th className={cn(head, "hidden sm:table-cell")} title="Bosses with a kill, across every weighted raid">Kills</th>
                  </>
                )}
                {metric === "peak" && <th className={cn(head, "hidden text-left sm:table-cell")}>By raid</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.subject_id} className="border-b border-white/5 last:border-b-0">
                  <td className="max-w-0 px-5 py-2.5"><SubjectName entry={e} metric={metric} guilds={guilds} size="lg" /></td>
                  <td className="px-3 py-2 text-right font-mono text-base tabular-nums">{theme.format(value(e, metric))}</td>
                  {metric === "mastery" && (
                    <>
                      <td className={cn(cell, "hidden sm:table-cell")}>{e.peak?.toFixed(1) ?? "—"}</td>
                      <td className={cn(cell, "hidden sm:table-cell")}>{e.form?.toFixed(1) ?? "—"}</td>
                      <td className={cn(cell, "hidden sm:table-cell")}>{e.floor?.toFixed(1) ?? "—"}</td>
                      <td className={cn(cell, "hidden sm:table-cell")}><KillProgress entry={e} /></td>
                    </>
                  )}
                  {metric === "peak" && <td className="hidden px-3 py-2 sm:table-cell"><RaidBars raids={e.raids} name={e.name} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {board && board.total > entries.length && (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">Showing the top {entries.length.toLocaleString()} of {board.total.toLocaleString()}.</p>
      )}
    </section>
  )
}

function Empty() {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">No one yet.</p>
}

/** Bosses with a kill out of every boss in the weighted raids, with the per-raid split on hover. */
function KillProgress({ entry }: { entry: CareerLeaderboardEntry }) {
  if (entry.bosses_killed == null || entry.bosses == null) return <>—</>
  return (
    <HoverDetail
      trigger={`${entry.bosses_killed}/${entry.bosses}`}
      label={`${entry.bosses_killed} of ${entry.bosses} bosses killed`}
    >
      <div className="mb-1 font-semibold">Bosses killed</div>
      <table className="font-mono tabular-nums">
        <tbody>
          {entry.raids.map((r) => (
            <tr key={raidLabel(r)} className={r.kills === 0 ? "text-zinc-500" : undefined}>
              <td className="pr-4 font-sans">{raidLabel(r)}</td>
              <td className="text-right">{r.bosses_killed ?? "—"}/{r.bosses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </HoverDetail>
  )
}

/** Peak by raid, one bar each (heaviest raid first); raids without kills are flat stubs. */
function RaidBars({ raids, name }: { raids: readonly CareerLeaderboardRaid[]; name: string }) {
  if (raids.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <HoverDetail
      label={`Peak by raid for ${name}`}
      trigger={
        <span aria-hidden className="flex h-6 items-end gap-0.5">
          {raids.map((r) => (
            <span
              key={raidLabel(r)}
              className={cn("w-2 rounded-[1px]", r.kills > 0 ? "bg-[color:var(--metric)]" : "h-px bg-white/20")}
              style={r.kills > 0 ? { height: `${Math.max(12, Math.min(100, r.peak))}%`, opacity: r.peak >= 100 ? 0.9 : 0.55 } : undefined}
            />
          ))}
        </span>
      }
    >
      <div className="mb-1 font-semibold">Peak by raid</div>
      <table className="font-mono tabular-nums">
        <thead>
          <tr className="text-zinc-400">
            <th className="pr-4 text-left font-normal">Raid</th>
            <th className="pr-4 text-right font-normal">Weight</th>
            <th className="text-right font-normal">Peak</th>
          </tr>
        </thead>
        <tbody>
          {raids.map((r) => (
            <tr key={raidLabel(r)} className={r.kills === 0 ? "text-zinc-500" : undefined}>
              <td className="pr-4 font-sans">{raidLabel(r)}</td>
              <td className="pr-4 text-right">×{r.weight}</td>
              <td className="text-right">{r.kills > 0 ? r.peak.toFixed(1) : "0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-zinc-400">Weighted by raid; raids without kills count as zero.</div>
    </HoverDetail>
  )
}

function HoverDetail({ trigger, label, children }: { trigger: ReactNode; label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={label} className="inline-flex cursor-help">{trigger}</span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-none px-3 py-2.5">{children}</TooltipContent>
    </Tooltip>
  )
}
