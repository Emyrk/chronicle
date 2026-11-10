import { useSearchParams } from "react-router-dom"
import { useCareerLeaderboard } from "@/api/career"
import { useSiteConfig } from "@/api/queries"
import type { RatingView } from "../Ratings/ratingThemes"
import { CareerLeaderboard } from "./CareerLeaderboard"
import type { CareerBoardsState } from "./careerLeaderboardModel"

const VIEWS: RatingView[] = ["overview", "mastery", "peak", "renown"]

/** /leaderboards/career: the overall career boards, with the view in `?view=`. */
export function CareerLeaderboardPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get("view") as RatingView | null
  const view = requested && VIEWS.includes(requested) ? requested : "overview"
  const { data: config } = useSiteConfig()
  const query = useCareerLeaderboard(config?.tenant?.id, 100)
  const state: CareerBoardsState = query.data
    ? { status: "ready", data: query.data }
    : query.isError
      ? { status: "error", error: query.error.message }
      : { status: "loading" }
  const onView = (next: RatingView) => {
    const updated = new URLSearchParams(params)
    if (next === "overview") updated.delete("view")
    else updated.set("view", next)
    setParams(updated, { replace: true })
  }
  return <CareerLeaderboard view={view} onView={onView} state={state} />
}
