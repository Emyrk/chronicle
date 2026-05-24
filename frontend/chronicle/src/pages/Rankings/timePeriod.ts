export type TimePeriod = "all" | "90d" | "30d" | "7d"

export function getTimePeriodDays(period: TimePeriod): number | null {
  switch (period) {
    case "7d": return 7
    case "30d": return 30
    case "90d": return 90
    default: return null
  }
}
