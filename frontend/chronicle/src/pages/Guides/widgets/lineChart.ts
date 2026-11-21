import { exact, finite, record, SceneValidationError, string } from "../protocol/validators"
import { arrayLength, choice, fieldColor, fieldNumber, fieldString, flag, numberOrAuto, optionalColor, requireTable, text, withElement, withField } from "./optionTypes"
import { defineWidget, type OptionType } from "./types"

export const MAX_LINE_CHART_SERIES = 12
/** Points across every series of one chart. */
export const MAX_LINE_CHART_POINTS = 2_000
export const MAX_LINE_CHART_MARKERS = 32

export const lineChartFormat = choice(["number", "compact", "seconds", "duration", "percent"], "ChronicleLineChartFormat")
export const lineChartCurve = choice(["linear", "monotoneX", "step", "natural", "basis"], "ChronicleLineChartCurve")
export type LineChartFormat = (typeof lineChartFormat.values)[number]
export type LineChartCurve = (typeof lineChartCurve.values)[number]

export interface LineSeries { name: string; color?: string; points: Array<{ x: number; y: number }> }
export interface LineMarker { x: number; label?: string; color?: string }

const lineSeries: OptionType<LineSeries[]> = {
  luaType: "ChronicleLineSeries[]",
  optional: false,
  definitions: `---@class ChronicleLineSeries
---@field name string Unique series name, shown in the legend and hover readout.
---@field color? string|number[] "#rrggbb" or {r, g, b, a} with components from 0 through 1. Defaults to a palette color.
---@field points number[][] Points as {x, y} or {x = x, y = y}. At most ${MAX_LINE_CHART_POINTS} points across all series.`,
  read(context, state, index, label) {
    requireTable(context, state, index, label)
    const names = new Set<string>()
    let total = 0
    const count = arrayLength(context, state, index, MAX_LINE_CHART_SERIES, label)
    return Array.from({ length: count }, (_, offset) => withElement(context, state, index, offset + 1, (seriesIndex) => {
      requireTable(context, state, seriesIndex, `${label} entry ${offset + 1}`)
      const name = fieldString(context, state, seriesIndex, "name", "series name")
      if (!name) return context.fail(state, `${label} entry ${offset + 1} needs a name`)
      if (names.has(name)) context.fail(state, `series name '${name}' is used twice`)
      names.add(name)
      const series: LineSeries = { name, points: [] }
      const seriesColor = fieldColor(context, state, seriesIndex, "color", `series '${name}' color`)
      if (seriesColor !== undefined) series.color = seriesColor
      series.points = withField(context, state, seriesIndex, "points", (pointsIndex) => {
        requireTable(context, state, pointsIndex, `series '${name}' points`)
        const pointCount = context.lua.lua_rawlen(state, pointsIndex) as number
        total += pointCount
        if (total > MAX_LINE_CHART_POINTS) context.fail(state, `line chart supports at most ${MAX_LINE_CHART_POINTS} points across all series`)
        return Array.from({ length: pointCount }, (_, p) => withElement(context, state, pointsIndex, p + 1, (pointIndex) => {
          const pointLabel = `series '${name}' point ${p + 1}`
          requireTable(context, state, pointIndex, pointLabel)
          const keyed = withField(context, state, pointIndex, "x", (x) => !context.lua.lua_isnil(state, x))
          return {
            x: fieldNumber(context, state, pointIndex, keyed ? "x" : 1, `${pointLabel} x`),
            y: fieldNumber(context, state, pointIndex, keyed ? "y" : 2, `${pointLabel} y`),
          }
        }))
      })
      return series
    }))
  },
  validate(value, label) {
    if (!Array.isArray(value) || value.length > MAX_LINE_CHART_SERIES) throw new SceneValidationError(`${label} must be an array of at most ${MAX_LINE_CHART_SERIES} series`)
    const names = new Set<string>()
    let total = 0
    value.forEach((rawSeries, index) => {
      const seriesLabel = `${label}[${index}]`
      const series = record(rawSeries, seriesLabel)
      exact(series, ["name", "color", "points"], seriesLabel)
      const name = string(series.name, `${seriesLabel}.name`, 128)
      if (names.has(name)) throw new SceneValidationError(`${seriesLabel}.name must be unique`)
      names.add(name)
      optionalColor(series.color, `${seriesLabel}.color`)
      if (!Array.isArray(series.points)) throw new SceneValidationError(`${seriesLabel}.points must be an array`)
      total += series.points.length
      if (total > MAX_LINE_CHART_POINTS) throw new SceneValidationError(`${label} exceeds ${MAX_LINE_CHART_POINTS} points`)
      series.points.forEach((rawPoint, pointIndex) => {
        const pointLabel = `${seriesLabel}.points[${pointIndex}]`
        const point = record(rawPoint, pointLabel)
        exact(point, ["x", "y"], pointLabel)
        finite(point.x, `${pointLabel}.x`)
        finite(point.y, `${pointLabel}.y`)
      })
    })
  },
  example: `{ { name = "Jaina", color = "#69ccf0", points = { {0, 0}, {5, 1200} } }, { name = "Thrall", points = { { x = 0, y = 10 } } } }`,
}

const lineMarkers: OptionType<LineMarker[]> = {
  luaType: "ChronicleLineMarker[]",
  optional: false,
  definitions: `---@class ChronicleLineMarker
---@field x number Position on the x axis.
---@field label? string Text drawn beside the marker line.
---@field color? string|number[] "#rrggbb" or {r, g, b, a}.`,
  read(context, state, index, label) {
    requireTable(context, state, index, label)
    const count = arrayLength(context, state, index, MAX_LINE_CHART_MARKERS, label)
    return Array.from({ length: count }, (_, offset) => withElement(context, state, index, offset + 1, (markerIndex) => {
      const markerLabel = `marker ${offset + 1}`
      requireTable(context, state, markerIndex, markerLabel)
      const marker: LineMarker = { x: fieldNumber(context, state, markerIndex, "x", `${markerLabel} x`) }
      const markerText = fieldString(context, state, markerIndex, "label", `${markerLabel} label`)
      if (markerText !== undefined) marker.label = markerText
      const markerColor = fieldColor(context, state, markerIndex, "color", `${markerLabel} color`)
      if (markerColor !== undefined) marker.color = markerColor
      return marker
    }))
  },
  validate(value, label) {
    if (!Array.isArray(value) || value.length > MAX_LINE_CHART_MARKERS) throw new SceneValidationError(`${label} must be an array of at most ${MAX_LINE_CHART_MARKERS} markers`)
    value.forEach((rawMarker, index) => {
      const markerLabel = `${label}[${index}]`
      const marker = record(rawMarker, markerLabel)
      exact(marker, ["x", "label", "color"], markerLabel)
      finite(marker.x, `${markerLabel}.x`)
      if (marker.label !== undefined) text().validate(marker.label, `${markerLabel}.label`)
      optionalColor(marker.color, `${markerLabel}.color`)
    })
  },
  example: `{ { x = 30, label = "Phase 2", color = "#ffcc00" } }`,
}

export const lineChartSpec = defineWidget({
  kind: "line-chart",
  luaType: "LineChart",
  helper: "lineChart",
  luaClass: "ChronicleLineChart",
  doc: "Numeric series drawn with Chronicle's line chart, the Timeline panel's renderer. Hovering shows every visible series' value at that x; viewers can click legend entries to hide series.",
  defaultSize: { width: 480, height: 240 },
  defaults: { series: [] },
  required: ["series"],
  setters: [
    { method: "SetSeries", args: [{ prop: "series", type: lineSeries }], doc: `Replace every series. At most ${MAX_LINE_CHART_SERIES} series and ${MAX_LINE_CHART_POINTS} points in total.` },
    { method: "SetMarkers", args: [{ prop: "markers", type: lineMarkers }], doc: `Replace the vertical marker lines, such as phase changes. At most ${MAX_LINE_CHART_MARKERS}.` },
    { method: "SetXFormat", args: [{ prop: "xFormat", type: lineChartFormat }], doc: "Choose how x values are written on the axis and in the hover readout. Defaults to \"number\"." },
    { method: "SetYFormat", args: [{ prop: "yFormat", type: lineChartFormat }], doc: "Choose how y values are written. Defaults to \"compact\" (1.2k, 3.4M)." },
    { method: "SetCurve", args: [{ prop: "curve", type: lineChartCurve }], doc: "Set the line interpolation. Defaults to \"monotoneX\"." },
    { method: "SetArea", args: [{ prop: "area", type: flag(), doc: "Defaults to true." }], doc: "Fill the area under each line." },
    { method: "SetShowPoints", args: [{ prop: "showPoints", type: flag(), doc: "Defaults to true." }], doc: "Draw a dot at every point." },
    { method: "SetStacked", args: [{ prop: "stacked", type: flag(), doc: "Defaults to true." }], doc: "Stack series on top of each other. Stacked charts are always filled." },
    { method: "SetLegend", args: [{ prop: "legend", type: flag(), doc: "Defaults to true." }], doc: "Show or hide the legend. Shown by default." },
    {
      method: "SetAxisLabels",
      args: [{ prop: "xLabel", type: text({ optional: true, example: "Time" }) }, { prop: "yLabel", type: text({ optional: true, example: "DPS" }) }],
      doc: "Label the axes. nil or \"\" removes a label.",
    },
    { method: "SetXRange", args: [{ prop: "xMin", type: numberOrAuto() }, { prop: "xMax", type: numberOrAuto() }], doc: "Fix the x axis range. nil means fit the data." },
    { method: "SetYRange", args: [{ prop: "yMin", type: numberOrAuto() }, { prop: "yMax", type: numberOrAuto() }], doc: "Fix the y axis range. nil means fit the data. The minimum defaults to 0." },
  ],
})
