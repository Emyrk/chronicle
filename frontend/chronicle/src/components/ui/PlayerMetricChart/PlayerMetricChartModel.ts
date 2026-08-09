export interface PlayerMetricChartData {
  playerID: string
  playerName: string
  className: string
  specialization: string
  specializationIconUrl?: string
  value: number
  // stackedValue is used for overhealing.
  stackedValue?: number
  // dimmed reduces visual prominence (used for filtering)
  dimmed?: boolean
}

export interface PlayerMetricChartRow extends PlayerMetricChartData {
  color: string
  rank: number
  displayValue: number
  displayStackedValue?: number
}

export interface PlayerMetricChartModel {
  chartData: PlayerMetricChartRow[]
  maximumValue: number
  summedValue: number
}

export function displayMetricValue(
  value: number,
  perSecond: boolean | undefined,
  durationMillis: number | undefined,
): number {
  if (!perSecond) return value
  if (!durationMillis || durationMillis <= 0) return 0
  return (value / durationMillis) * 1000
}

export function createPlayerMetricChartModel(
  data: PlayerMetricChartData[],
  perSecond: boolean | undefined,
  durationMillis: number | undefined,
): PlayerMetricChartModel {
  const summedValue = data.reduce((sum, item) => sum + item.value, 0) || 1
  const maxEffective = data.length === 0
    ? 0
    : Math.max(...data.map((item) => item.value))
  const maximumValue = maxEffective ? maxEffective / 0.75 : 1

  const sorted = [...data].sort((a, b) => {
    if (a.dimmed !== b.dimmed) {
      return a.dimmed ? 1 : -1
    }
    const valueDifference = b.value - a.value
    if (valueDifference !== 0) return valueDifference
    return a.playerID.localeCompare(b.playerID)
  })

  return {
    maximumValue,
    summedValue,
    chartData: sorted.map((item, index) => ({
      ...item,
      rank: index + 1,
      color: `var(--color-class-${item.className.toLowerCase()})`,
      displayValue: displayMetricValue(item.value, perSecond, durationMillis),
      displayStackedValue: item.stackedValue === undefined
        ? undefined
        : displayMetricValue(item.stackedValue, perSecond, durationMillis),
    })),
  }
}
