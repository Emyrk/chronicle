import type { LiveRatingCohort } from "./liveRatingAdapter"
import type { RatingBoardData, RatingEntry, RatingMetric, RatingPeriod, RatingScope } from "./ratingBoards.fixtures"

/** Exact class/spec subset of a published raid cohort; all-class views omit this field. */
export type RatingLiveCohort = LiveRatingCohort & Required<Pick<LiveRatingCohort, "playerClass" | "spec" | "subSpec" | "performance">>

export type RatingLiveSelection = {
  scope: RatingScope
  metric: RatingMetric
  period: RatingPeriod
  cohort?: RatingLiveCohort
}

export type RatingLiveState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T }

export type RatingLiveBoard = Omit<RatingBoardData, "total"> & { total?: number }

export type RatingLivePage = {
  /** Ranks are assigned by the server, not recomputed after a search or page change. */
  rows: readonly {
    rank: number
    entry: RatingEntry
    scores?: Partial<Record<RatingMetric, RatingEntry>>
    /** Real kill metadata, when published. No synthetic timestamps on live pages. */
    peakRun?: { ms: number; date: string }
  }[]
  /** Optional because cursor-based published endpoints may not return a count. */
  total?: number
  page: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

/** Supply already-fetched data; the host owns API queries, cursor state, and exact cohort mapping. */
export interface RatingLiveData {
  /** Realm-filtered pages have no published global rank number. */
  ranksKnown?: boolean
  cohort?: RatingLiveCohort
  board: (selection: RatingLiveSelection) => RatingLiveState<RatingLiveBoard>
  page: (selection: RatingLiveSelection & { query: string; page: number }) => RatingLiveState<RatingLivePage>
}
