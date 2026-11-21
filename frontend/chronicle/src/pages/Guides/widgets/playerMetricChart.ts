import { boolean, bounded, displayText, exact, record, SceneValidationError, string, MAX_ID_LENGTH } from "../protocol/validators"
import { arrayLength, choice, fieldBoolean, fieldNumber, fieldOptionalNumber, fieldString, flag, number, requireTable, text, withElement } from "./optionTypes"
import { defineWidget, type OptionType } from "./types"

export const MAX_PLAYER_METRIC_ROWS = 100

export const playerMetricChartType = choice(["damage", "healing", "taken", "mitigation"], "ChroniclePlayerMetricChartType")

export interface PlayerMetricRow {
  playerID: string
  playerName: string
  className: string
  specialization: string
  value: number
  stackedValue?: number
  dimmed?: boolean
}

const playerMetricRows: OptionType<PlayerMetricRow[]> = {
  luaType: "ChroniclePlayerMetricRow[]",
  optional: false,
  definitions: `---@class ChroniclePlayerMetricRow
---@field playerID string Player GUID used for Chronicle specialization and cosmetic enrichment.
---@field playerName string Display name.
---@field className string Upper-case class token such as "MAGE".
---@field specialization? string Optional specialization label when Chronicle cannot infer one.
---@field value number Primary total before optional per-second conversion.
---@field stackedValue? number Optional secondary total, such as overhealing.
---@field dimmed? boolean Reduce this row's visual prominence.`,
  read(context, state, index, label) {
    requireTable(context, state, index, label)
    const count = arrayLength(context, state, index, MAX_PLAYER_METRIC_ROWS, "player metric chart")
    return Array.from({ length: count }, (_, offset) => withElement(context, state, index, offset + 1, (rowIndex) => {
      requireTable(context, state, rowIndex, "player metric data rows")
      const required = (field: string) => fieldString(context, state, rowIndex, field, `player metric row ${field}`)
        ?? context.fail(state, `player metric row ${field} must be a string`)
      const row: PlayerMetricRow = {
        playerID: required("playerID"),
        playerName: required("playerName"),
        className: required("className").toUpperCase(),
        specialization: fieldString(context, state, rowIndex, "specialization", "player metric row specialization") ?? "",
        value: fieldNumber(context, state, rowIndex, "value", "player metric row value"),
      }
      const stackedValue = fieldOptionalNumber(context, state, rowIndex, "stackedValue", "player metric row stackedValue")
      if (stackedValue !== undefined) row.stackedValue = stackedValue
      const dimmed = fieldBoolean(context, state, rowIndex, "dimmed", "player metric row dimmed")
      if (dimmed !== undefined) row.dimmed = dimmed
      return row
    }))
  },
  validate(value, label) {
    if (!Array.isArray(value) || value.length > MAX_PLAYER_METRIC_ROWS) {
      throw new SceneValidationError(`${label} must be an array of at most ${MAX_PLAYER_METRIC_ROWS} rows`)
    }
    value.forEach((rawRow, index) => {
      const rowLabel = `${label}[${index}]`
      const row = record(rawRow, rowLabel)
      exact(row, ["playerID", "playerName", "className", "specialization", "value", "stackedValue", "dimmed"], rowLabel)
      string(row.playerID, `${rowLabel}.playerID`, MAX_ID_LENGTH)
      displayText(row.playerName, `${rowLabel}.playerName`)
      string(row.className, `${rowLabel}.className`, 32)
      if (row.specialization !== undefined) displayText(row.specialization, `${rowLabel}.specialization`)
      bounded(row.value, 0, Number.MAX_SAFE_INTEGER, `${rowLabel}.value`)
      if (row.stackedValue !== undefined) bounded(row.stackedValue, 0, Number.MAX_SAFE_INTEGER, `${rowLabel}.stackedValue`)
      if (row.dimmed !== undefined) boolean(row.dimmed, `${rowLabel}.dimmed`)
    })
  },
  example: `{ { playerID = "0x1", playerName = "Jaina", className = "mage", value = 120000 } }`,
}

export const playerMetricChartSpec = defineWidget({
  kind: "player-metric-chart",
  luaType: "PlayerMetricChart",
  helper: "playerMetricChart",
  luaClass: "ChroniclePlayerMetricChart",
  doc: "Chronicle's standard player meter, with class colors and icons.",
  defaultSize: { width: 320, height: 240 },
  defaults: { data: [], type: "damage", perSecond: false, hideZeroValue: false, rowHeight: 30 },
  required: ["data", "type"],
  setters: [
    { method: "SetData", args: [{ prop: "data", type: playerMetricRows }], doc: `Replace every row in the chart. At most ${MAX_PLAYER_METRIC_ROWS} rows.` },
    { method: "SetChartType", args: [{ prop: "type", type: playerMetricChartType }], doc: "Choose the standard Chronicle player metric presentation." },
    { method: "SetPerSecond", args: [{ prop: "perSecond", type: flag(false) }], doc: "Display values per second using the configured duration." },
    { method: "SetDuration", args: [{ prop: "durationMillis", type: number({ min: 0, max: Number.MAX_SAFE_INTEGER, example: 60_000 }) }], doc: "Set the duration used for per-second conversion, in milliseconds." },
    { method: "SetPanelTitle", args: [{ prop: "panelTitle", type: text({ example: "Damage Done" }) }], doc: "Set the title used by Chronicle-owned chart surfaces." },
    { method: "SetStackedLabel", args: [{ prop: "stackedLabel", type: text({ example: "Overhealing" }) }], doc: "Set the label for stacked secondary values." },
    { method: "SetValueSuffix", args: [{ prop: "valueSuffix", type: text({ example: " DPS" }) }], doc: "Override the value suffix." },
    { method: "SetHideZeroValue", args: [{ prop: "hideZeroValue", type: flag(false) }], doc: "Hide primary value badges whose value is zero." },
    { method: "SetRowHeight", args: [{ prop: "rowHeight", type: number({ min: 12, max: 128, example: 30 }) }], doc: "Set row height in pixels, from 12 through 128." },
  ],
})
