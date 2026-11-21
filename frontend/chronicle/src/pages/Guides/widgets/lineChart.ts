import { bounded, exact, finite, record, SceneValidationError, string } from "../protocol/validators"
import { arrayLength, choice, fieldColor, fieldNumber, fieldOptionalNumber, fieldString, flag, numberOrAuto, optionalColor, requireTable, text, withElement, withField } from "./optionTypes"
import { defineWidget, type LuaReadContext, type LuaState, type OptionType } from "./types"

export const MAX_LINE_CHART_SERIES = 12
/** Points across every series of one chart. */
export const MAX_LINE_CHART_POINTS = 2_000
export const MAX_LINE_CHART_MARKERS = 32
export const MAX_LINE_CHART_BANDS = 64
const MAX_SUFFIX_LENGTH = 16

export const lineChartFormat = choice(["number", "compact", "seconds", "duration", "percent"], "ChronicleLineChartFormat")
export const lineChartCurve = choice(["linear", "monotoneX", "step", "natural", "basis"], "ChronicleLineChartCurve")
export type LineChartFormat = (typeof lineChartFormat.values)[number]
export type LineChartCurve = (typeof lineChartCurve.values)[number]
export const lineChartTimeSelection = choice(["off", "seconds", "milliseconds"], "ChronicleLineChartTimeSelection")
export type LineChartTimeSelection = (typeof lineChartTimeSelection.values)[number]
const MARKER_STYLES = ["dashed", "solid", "dotted"] as const
const MARKER_ICONS = ["none", "triangle", "dot"] as const
export type LineMarkerStyle = (typeof MARKER_STYLES)[number]
export type LineMarkerIcon = (typeof MARKER_ICONS)[number]

export interface LineSeries { name: string; color?: string; suffix?: string; points: Array<{ x: number; y: number }> }
export interface LineMarker { x: number; label?: string; color?: string; tooltip?: string; style?: LineMarkerStyle; icon?: LineMarkerIcon }
export interface LineBand { from: number; to: number; label?: string; color?: string; opacity?: number; tooltip?: string }

/** Reads an optional string field restricted to `values` (case-insensitive). */
function fieldChoice<T extends string>(context: LuaReadContext, state: LuaState, tableIndex: number, field: string, values: readonly T[], label: string): T | undefined {
  const raw = fieldString(context, state, tableIndex, field, label)
  if (raw === undefined) return undefined
  const match = values.find((value) => value.toLowerCase() === raw.toLowerCase())
  if (!match) context.fail(state, `${label} must be one of ${values.join(", ")}`)
  return match
}

function validateChoice(value: unknown, values: readonly string[], label: string) {
  if (value !== undefined && !values.includes(value as string)) throw new SceneValidationError(`${label} must be one of ${values.join(", ")}`)
}

function optionalText(value: unknown, label: string) {
  if (value !== undefined) text().validate(value, label)
}

const lineSeries: OptionType<LineSeries[]> = {
  luaType: "ChronicleLineSeries[]",
  optional: false,
  definitions: `---@class ChronicleLineSeries
---@field name string Unique series name, shown in the legend and hover readout.
---@field color? string|number[] "#rrggbb" or {r, g, b, a} with components from 0 through 1. Defaults to a palette color.
---@field suffix? string Appended to this series' values in the hover readout, such as "/s". Up to ${MAX_SUFFIX_LENGTH} characters.
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
      const suffix = fieldString(context, state, seriesIndex, "suffix", `series '${name}' suffix`)
      if (suffix !== undefined) {
        if (suffix.length > MAX_SUFFIX_LENGTH) context.fail(state, `series '${name}' suffix must be at most ${MAX_SUFFIX_LENGTH} characters`)
        series.suffix = suffix
      }
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
      exact(series, ["name", "color", "suffix", "points"], seriesLabel)
      const name = string(series.name, `${seriesLabel}.name`, 128)
      if (names.has(name)) throw new SceneValidationError(`${seriesLabel}.name must be unique`)
      names.add(name)
      optionalColor(series.color, `${seriesLabel}.color`)
      if (series.suffix !== undefined) string(series.suffix, `${seriesLabel}.suffix`, MAX_SUFFIX_LENGTH)
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
  example: `{ { name = "Jaina", color = "#69ccf0", suffix = "/s", points = { {0, 0}, {5, 1200} } }, { name = "Thrall", points = { { x = 0, y = 10 } } } }`,
}

const lineMarkers: OptionType<LineMarker[]> = {
  luaType: "ChronicleLineMarker[]",
  optional: false,
  definitions: `---@class ChronicleLineMarker
---@field x number Position on the x axis.
---@field label? string Text drawn beside the marker line.
---@field color? string|number[] "#rrggbb" or {r, g, b, a}.
---@field tooltip? string Hover text; newlines start new lines. Hovering the marker shows it.
---@field style? "dashed"|"solid"|"dotted" Line style. Defaults to "dashed".
---@field icon? "none"|"triangle"|"dot" Drawn at the top of the line. Defaults to "none".`,
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
      const tooltip = fieldString(context, state, markerIndex, "tooltip", `${markerLabel} tooltip`)
      if (tooltip !== undefined) marker.tooltip = tooltip
      const style = fieldChoice(context, state, markerIndex, "style", MARKER_STYLES, `${markerLabel} style`)
      if (style !== undefined) marker.style = style
      const icon = fieldChoice(context, state, markerIndex, "icon", MARKER_ICONS, `${markerLabel} icon`)
      if (icon !== undefined) marker.icon = icon
      return marker
    }))
  },
  validate(value, label) {
    if (!Array.isArray(value) || value.length > MAX_LINE_CHART_MARKERS) throw new SceneValidationError(`${label} must be an array of at most ${MAX_LINE_CHART_MARKERS} markers`)
    value.forEach((rawMarker, index) => {
      const markerLabel = `${label}[${index}]`
      const marker = record(rawMarker, markerLabel)
      exact(marker, ["x", "label", "color", "tooltip", "style", "icon"], markerLabel)
      finite(marker.x, `${markerLabel}.x`)
      optionalText(marker.label, `${markerLabel}.label`)
      optionalColor(marker.color, `${markerLabel}.color`)
      optionalText(marker.tooltip, `${markerLabel}.tooltip`)
      validateChoice(marker.style, MARKER_STYLES, `${markerLabel}.style`)
      validateChoice(marker.icon, MARKER_ICONS, `${markerLabel}.icon`)
    })
  },
  example: `{ { x = 30, label = "Phase 2", color = "#ffcc00" }, { x = 42, color = "#ef4444", style = "dotted", icon = "triangle", tooltip = "Jaina died\\nThrall died" } }`,
}

const lineBands: OptionType<LineBand[]> = {
  luaType: "ChronicleLineBand[]",
  optional: false,
  definitions: `---@class ChronicleLineBand
---@field from number Start of the shaded range on the x axis.
---@field to number End of the range; at least \`from\`.
---@field label? string Drawn at the top of the band, such as a phase name.
---@field color? string|number[] "#rrggbb" or {r, g, b, a}. Defaults to violet.
---@field opacity? number Fill opacity from 0 through 1. Defaults to 0.08.
---@field tooltip? string Shown in the hover readout while the pointer is inside the band.`,
  read(context, state, index, label) {
    requireTable(context, state, index, label)
    const count = arrayLength(context, state, index, MAX_LINE_CHART_BANDS, label)
    return Array.from({ length: count }, (_, offset) => withElement(context, state, index, offset + 1, (bandIndex) => {
      const bandLabel = `band ${offset + 1}`
      requireTable(context, state, bandIndex, bandLabel)
      const band: LineBand = {
        from: fieldNumber(context, state, bandIndex, "from", `${bandLabel} from`),
        to: fieldNumber(context, state, bandIndex, "to", `${bandLabel} to`),
      }
      if (band.to < band.from) context.fail(state, `${bandLabel} 'to' must be at least 'from'`)
      const bandText = fieldString(context, state, bandIndex, "label", `${bandLabel} label`)
      if (bandText !== undefined) band.label = bandText
      const bandColor = fieldColor(context, state, bandIndex, "color", `${bandLabel} color`)
      if (bandColor !== undefined) band.color = bandColor
      const opacity = fieldOptionalNumber(context, state, bandIndex, "opacity", `${bandLabel} opacity`)
      if (opacity !== undefined) {
        if (!(opacity >= 0 && opacity <= 1)) context.fail(state, `${bandLabel} opacity must be between 0 and 1`)
        band.opacity = opacity
      }
      const tooltip = fieldString(context, state, bandIndex, "tooltip", `${bandLabel} tooltip`)
      if (tooltip !== undefined) band.tooltip = tooltip
      return band
    }))
  },
  validate(value, label) {
    if (!Array.isArray(value) || value.length > MAX_LINE_CHART_BANDS) throw new SceneValidationError(`${label} must be an array of at most ${MAX_LINE_CHART_BANDS} bands`)
    value.forEach((rawBand, index) => {
      const bandLabel = `${label}[${index}]`
      const band = record(rawBand, bandLabel)
      exact(band, ["from", "to", "label", "color", "opacity", "tooltip"], bandLabel)
      const from = finite(band.from, `${bandLabel}.from`)
      if (finite(band.to, `${bandLabel}.to`) < from) throw new SceneValidationError(`${bandLabel}.to must be at least from`)
      optionalText(band.label, `${bandLabel}.label`)
      optionalColor(band.color, `${bandLabel}.color`)
      if (band.opacity !== undefined) bounded(band.opacity, 0, 1, `${bandLabel}.opacity`)
      optionalText(band.tooltip, `${bandLabel}.tooltip`)
    })
  },
  example: `{ { from = 0, to = 45, label = "Phase 1" }, { from = 45, to = 90, label = "Phase 2", color = "#6366f1", opacity = 0.1, tooltip = "Whelps" } }`,
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
    { method: "SetBands", args: [{ prop: "bands", type: lineBands }], doc: `Replace the shaded x ranges drawn behind the lines, such as phases or a background measure. At most ${MAX_LINE_CHART_BANDS}.` },
    { method: "SetXFormat", args: [{ prop: "xFormat", type: lineChartFormat }], doc: "Choose how x values are written on the axis and in the hover readout. Defaults to \"number\"." },
    { method: "SetYFormat", args: [{ prop: "yFormat", type: lineChartFormat }], doc: "Choose how y values are written. Defaults to \"compact\" (1.2k, 3.4M)." },
    { method: "SetCurve", args: [{ prop: "curve", type: lineChartCurve }], doc: "Set the line interpolation. Defaults to \"monotoneX\"." },
    { method: "SetArea", args: [{ prop: "area", type: flag(), doc: "Defaults to true." }], doc: "Fill the area under each line." },
    { method: "SetShowPoints", args: [{ prop: "showPoints", type: flag(), doc: "Defaults to true." }], doc: "Draw a dot at every point." },
    { method: "SetStacked", args: [{ prop: "stacked", type: flag(), doc: "Defaults to true." }], doc: "Stack series on top of each other. Stacked charts are always filled." },
    { method: "SetFillParent", args: [{ prop: "fillParent", type: flag(), doc: "Defaults to true." }], doc: "Size the chart to fill its parent frame (or the whole panel), ignoring SetPoint and SetSize." },
    {
      method: "SetTimeSelection",
      args: [{ prop: "timeSelection", type: lineChartTimeSelection, doc: "What the x axis measures: fight time in \"seconds\" or \"milliseconds\". \"off\" (the default) disables selection." }],
      doc: "Let viewers drag across the chart to set the page's time range, like the Line Chart panel; double-click clears it. The selected range is highlighted. Use Chronicle.OnTimeRangeChanged to react to it.",
    },
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
