import { useSearchParams } from "react-router-dom"
import { useCareerLeaderboard } from "@/api/career"
import { useSiteConfig } from "@/api/queries"
import { useHubSummary } from "../Hub/hubSummaryAdapter"
import type { RatingView } from "../Ratings/ratingThemes"
import { CareerLeaderboard } from "./CareerLeaderboard"
import { careerLeaderboardParams, type CareerBoardsState, type CareerFilters, type CareerRole } from "./careerLeaderboardModel"

const VIEWS: RatingView[] = ["overview", "peak", "mastery", "renown"]
const ROLES: CareerRole[] = ["all", "dps", "healing"]
const ALL_REALMS = "All realms"

/** /leaderboards/career: every filter lives in the URL so shared links keep it. */
export function CareerLeaderboardPage() {
  const [params, setParams] = useSearchParams()
  const { data: config } = useSiteConfig()
  // The same request the leaderboards landing makes, so its realm list is usually cached.
  const summary = useHubSummary({ tab: "overview", realmIDs: [], performance: "dps" }, config !== undefined)
  const realms = summary.data?.realms ?? []

  const requestedView = params.get("view") as RatingView | null
  const view = requestedView && VIEWS.includes(requestedView) ? requestedView : "overview"
  const guilds = params.get("subject") === "guilds"
  const requestedRole = params.get("role") as CareerRole | null
  const realm = realms.find((r) => r.id === params.get("realm"))
  const filters: CareerFilters = {
    subject: guilds ? "guilds" : "characters",
    role: !guilds && requestedRole && ROLES.includes(requestedRole) ? requestedRole : "all",
    scope: guilds ? {} : { cls: params.get("class") ?? undefined, spec: params.get("spec") ?? undefined, subSpec: params.get("sub_spec") ?? undefined },
    realmID: realm?.id,
  }
  // The boards show each metric's top; the full tables page separately.
  const request = careerLeaderboardParams(filters, 25)
  const query = useCareerLeaderboard(config?.tenant?.id, request)
  const state: CareerBoardsState = query.data
    ? { status: "ready", data: query.data }
    : query.isError
      ? { status: "error", error: query.error.message }
      : { status: "loading" }

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }
  return (
    <CareerLeaderboard
      view={view}
      onView={(next) => update({ view: next === "overview" ? undefined : next })}
      filters={filters}
      onFilters={(next) => update({
        subject: next.subject === "guilds" ? "guilds" : undefined,
        role: next.role === "all" ? undefined : next.role,
        class: next.scope.cls,
        spec: next.scope.spec,
        sub_spec: next.scope.subSpec,
      })}
      realm={realm?.name ?? ALL_REALMS}
      realms={[ALL_REALMS, ...realms.map((r) => r.name)]}
      onRealm={(name) => update({ realm: realms.find((r) => r.name === name)?.id })}
      state={state}
      request={request}
      allHref="/leaderboards"
    />
  )
}
