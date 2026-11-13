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
    /** Chosen boss Peak scores, including zeros for missed bosses. */
    peakComponents?: readonly { encounter_name: string; score: number }[]
    /** Real kill metadata, when published. No synthetic timestamps on live pages. */
    /** The one-boss peak kill: its duration, date, and (while listed) its log instance. */
    peakRun?: { ms: number; date: string; log?: string }
  }[]
  /** Optional because cursor-based published endpoints may not return a count. */
  total?: number
  page: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

/** How Peak's per-component bars and breakdown read. */
export interface PeakComponentLabels {
  /** Plural noun, lower case: "bosses". */
  noun: string
  /** Column header: "Boss peaks". */
  header: string
  /** Header note: "mean of 8, misses count 0". */
  note: (count: number) => string
  /** The breakdown dialog's description. */
  description: (count: number) => string
}

/** The default: Peak is the plain mean of every boss, misses counting 0. */
export const BOSS_PEAK_LABELS: PeakComponentLabels = {
  noun: "bosses",
  header: "Boss peaks",
  note: (count) => `mean of ${count}, misses count 0`,
  description: (count) => `Peak is the mean of all ${count} bosses' best scores; a boss without a kill counts as 0.`,
}

/** Supply already-fetched data; the host owns API queries, cursor state, and exact cohort mapping. */
export interface RatingLiveData {
  /** Peak's components when they are not bosses (career boards use weighted raids). */
  peakLabels?: PeakComponentLabels
  /** New summary reads do not imply that a historical catch-up worker exists. */
  catchupStatus?: boolean
  cohort?: RatingLiveCohort
  board: (selection: RatingLiveSelection) => RatingLiveState<RatingLiveBoard>
  page?: (selection: RatingLiveSelection & { query: string; page: number }) => RatingLiveState<RatingLivePage>
  /** Fetch an authoritative ranked page for the Storybook full-list table. */
  loadPage?: (selection: RatingLiveSelection & { query: string; page: number }) => Promise<RatingLivePage>
  /** Stable API/cohort/realm identity for the full-list query cache. */
  pageKey?: string
}
