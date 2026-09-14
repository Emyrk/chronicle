const NICE_STEP_FACTORS = [1, 2, 2.5, 5, 10]

export interface BoxPlotScale {
  max: number
  values: number[]
}

export function getBoxPlotScale(dataMax: number, targetIntervals = 6): BoxPlotScale {
  const safeMax = Number.isFinite(dataMax) && dataMax > 0 ? dataMax : 1200
  const roughStep = safeMax / targetIntervals
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalizedStep = roughStep / magnitude
  const factor = NICE_STEP_FACTORS.find((candidate) => candidate >= normalizedStep) ?? 10
  const step = factor * magnitude
  const max = Math.ceil(safeMax / step) * step
  const intervalCount = Math.round(max / step)

  return {
    max,
    values: Array.from({ length: intervalCount + 1 }, (_, index) => index * step),
  }
}

export function formatBoxPlotTick(value: number): string {
  if (Math.abs(value) < 1000) return value.toLocaleString()

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value / 1000)}k`
}
