import { useIsMobile } from "@/hooks/useIsMobile"
import { CLASS_CSS_VAR, CLASS_DISPLAY, SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay"
import { GuildRatingBoards } from "../Hub/GuildRatings"
import { HubBanner, Segmented } from "../Hub/LeaderboardHub"
import { RatingBoards } from "../Ratings/RatingLeaderboard"
import { ScopeBar } from "../Ratings/ScopeBar"
import type { RatingView } from "../Ratings/ratingThemes"
import { CAREER_TABS, type CareerBoardsState, type CareerFilters } from "./careerLeaderboardModel"
import { careerGuildData, careerLiveData, careerRaids } from "./careerLiveData"

const GUILD_GOLD = "#e6c36a"

const STATUS_TEXT: Record<string, string> = {
  weights_pending: "Mastery and Peak are not available on this site yet. Renown is unaffected.",
  configuration_pending: "Mastery and Peak are not available on this site yet. Renown is unaffected.",
  no_active_raids: "No raids count toward Mastery and Peak yet.",
}

/**
 * The overall career leaderboard: the hub's banner and filters with a Career
 * breadcrumb and one tab per metric, and the hub's own rating boards and
 * tables fed with career data.
 */
export function CareerLeaderboard({ view, onView, filters, onFilters, realm, realms, onRealm, state, request, allHref }: {
  view: RatingView
  onView: (view: RatingView) => void
  filters: CareerFilters
  onFilters: (filters: CareerFilters) => void
  realm: string
  realms: readonly string[]
  onRealm: (realm: string) => void
  state: CareerBoardsState
  /** The request behind `state`, without paging; the full tables page from it. */
  request: URLSearchParams
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
  const raids = careerRaids(state.status === "ready" ? state.data : undefined)
  const roleLabel = filters.role === "all" ? "DPS + Healing" : filters.role === "dps" ? "DPS" : "Healing"

  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      style={guildMode ? { backgroundImage: `radial-gradient(ellipse 90% 520px at 50% 0%, color-mix(in srgb, ${GUILD_GOLD} 7%, transparent), transparent)` } : undefined}
    >
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-3 py-4 sm:px-4 sm:py-8">
        <HubBanner
          guildMode={guildMode}
          // Career spans every raid, so it uses Chronicle's own hero art rather than one raid's.
          background="/c/images/herobackground.avif"
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
        {guildMode ? (
          <GuildRatingBoards
            instanceName="Career"
            view={view}
            onView={onView}
            // No per-raid side boards; Peak's raid bars come from each row.
            allBosses={[]}
            where="Career"
            onBoss={() => undefined}
            data={careerGuildData(state, request)}
          />
        ) : (
          <RatingBoards
            instanceName="Career"
            title="Career"
            // Raids stand in for bosses only where Peak draws a bar per raid; elsewhere they would
            // add empty per-raid side boards.
            bosses={view === "peak" ? raids : []}
            scope={scope}
            onScope={(next) => onFilters({ ...filters, scope: { cls: next.cls, spec: next.spec, subSpec: next.subSpec } })}
            view={view}
            onView={onView}
            period="all"
            live={careerLiveData(state, false, request)}
          />
        )}
      </div>
    </div>
  )
}
