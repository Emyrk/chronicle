export type RankingsCohortMode = "spec" | "class" | "disabled"

export function defaultHideUnknowns(cohortMode: RankingsCohortMode): boolean {
  return cohortMode !== "class"
}

export function parseHideUnknowns(value: string | null, cohortMode: RankingsCohortMode): boolean {
  if (value === "show") return false
  if (value === "hide") return true
  return defaultHideUnknowns(cohortMode)
}

export function unknownsParamForValue(hideUnknowns: boolean, cohortMode: RankingsCohortMode): string | null {
  if (hideUnknowns === defaultHideUnknowns(cohortMode)) return null
  return hideUnknowns ? "hide" : "show"
}

export function defaultGroupByClass(cohortMode: RankingsCohortMode): boolean {
  return cohortMode === "class"
}

export function parseGroupByClass(value: string | null, cohortMode: RankingsCohortMode): boolean {
  if (value === "class") return true
  if (value === "spec") return false
  return defaultGroupByClass(cohortMode)
}

export function groupByParamForValue(groupByClass: boolean, cohortMode: RankingsCohortMode): string | null {
  if (groupByClass === defaultGroupByClass(cohortMode)) return null
  return groupByClass ? "class" : "spec"
}
