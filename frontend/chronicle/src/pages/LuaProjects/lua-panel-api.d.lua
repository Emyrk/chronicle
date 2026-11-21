---@meta

-- Chronicle Module API type definitions for Lua Language Server.
-- This file is documentation-only. Chronicle injects these globals at runtime.

---@alias ChronicleAnchor "TOPLEFT"|"TOP"|"TOPRIGHT"|"LEFT"|"CENTER"|"RIGHT"|"BOTTOMLEFT"|"BOTTOM"|"BOTTOMRIGHT"
---@alias ChronicleLayer "BACKGROUND"|"ARTWORK"|"OVERLAY"|number

---@class ChronicleRegion
local ChronicleRegion = {}

---Anchor this object within its parent. relativeTo and relativePoint are accepted for WoW compatibility but currently ignored.
---@param point ChronicleAnchor
---@param relativeTo? ChronicleRegion
---@param relativePoint? ChronicleAnchor
---@param x? number
---@param y? number
function ChronicleRegion:SetPoint(point, relativeTo, relativePoint, x, y) end

---Set this object's width and height in pixels.
---@param width number
---@param height number
function ChronicleRegion:SetSize(width, height) end

---Set this object's width in pixels.
---@param width number
function ChronicleRegion:SetWidth(width) end

---Set this object's height in pixels.
---@param height number
function ChronicleRegion:SetHeight(height) end

---Move this object to another frame.
---@param parent ChronicleFrame
function ChronicleRegion:SetParent(parent) end

---Set opacity from 0 through 1.
---@param alpha number
function ChronicleRegion:SetAlpha(alpha) end

---Set draw order using a named layer or numeric z-index.
---@param layer ChronicleLayer
function ChronicleRegion:SetLayer(layer) end

---Set the border color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleRegion:SetBorderColor(red, green, blue, alpha) end

---Show this object.
function ChronicleRegion:Show() end

---Hide this object.
function ChronicleRegion:Hide() end

---Return whether this object is shown.
---@return boolean shown
function ChronicleRegion:IsShown() end

---Remove this object, every object parented to it, and their callbacks. Their IDs can be reused afterwards.
function ChronicleRegion:Destroy() end

---Show plain text when the pointer rests on this object. Chronicle draws it, so hovering never runs Lua. Works on Frame, FontString, Texture and Button; newlines start new lines. nil or "" removes it.
---@param text? string Up to 4 KiB.
function ChronicleRegion:SetTooltip(text) end

---@class ChronicleFrame: ChronicleRegion
local ChronicleFrame = {}

---Create a text object parented to this frame.
---@param id? string
---@return ChronicleFontString text
function ChronicleFrame:CreateFontString(id) end

---Create a texture object parented to this frame.
---@param id? string
---@return ChronicleTexture texture
function ChronicleFrame:CreateTexture(id) end

---Set foreground color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleFrame:SetColor(red, green, blue, alpha) end

---Set background color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleFrame:SetBackgroundColor(red, green, blue, alpha) end

---Register a supported callback. OnClick requires the input capability.
---@param script "OnClick"|"OnSizeChanged"
---@param callback fun(self:ChronicleFrame,...)
function ChronicleFrame:SetScript(script, callback) end

---@class ChronicleFontString: ChronicleRegion
local ChronicleFontString = {}

---Set displayed text, up to 4 KiB.
---@param text string
function ChronicleFontString:SetText(text) end

---Set font size in pixels.
---@param size number
function ChronicleFontString:SetFontSize(size) end

---Set text color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleFontString:SetColor(red, green, blue, alpha) end

---@class ChronicleTexture: ChronicleRegion
local ChronicleTexture = {}

---Render an image declared in project.json assets. The path is package-local and never treated as a URL.
---@param path string
function ChronicleTexture:SetTexture(path) end

---Render the current dataset's icon for a spell ID.
---@param spellId integer
---@param tooltip? boolean Show Chronicle's spell tooltip on hover. Defaults to false.
function ChronicleTexture:SetSpell(spellId, tooltip) end

---Render the current dataset's icon for an item ID.
---@param itemId integer
---@param tooltip? boolean Show Chronicle's item tooltip on hover. Defaults to false.
function ChronicleTexture:SetItem(itemId, tooltip) end

---Render a named icon from Chronicle's current dataset CDN. Names contain only ASCII letters, numbers, underscores, and hyphens. Paths and URLs are rejected.
---@param iconName string Example: "inv_sword_39".
function ChronicleTexture:SetIcon(iconName) end

---@alias ChroniclePlayerMetricChartType "damage"|"healing"|"taken"|"mitigation"

---@class ChroniclePlayerMetricRow
---@field playerID string Player GUID used for Chronicle specialization and cosmetic enrichment.
---@field playerName string Display name.
---@field className string Upper-case class token such as "MAGE".
---@field specialization? string Optional specialization label when Chronicle cannot infer one.
---@field value number Primary total before optional per-second conversion.
---@field stackedValue? number Optional secondary total, such as overhealing.
---@field dimmed? boolean Reduce this row's visual prominence.

---@class ChroniclePlayerMetricChart: ChronicleRegion
local ChroniclePlayerMetricChart = {}

---Replace every row in the chart. At most 100 rows.
---@param data ChroniclePlayerMetricRow[]
function ChroniclePlayerMetricChart:SetData(data) end

---Choose the standard Chronicle player metric presentation.
---@param chartType ChroniclePlayerMetricChartType
function ChroniclePlayerMetricChart:SetChartType(chartType) end

---Display values per second using the configured duration.
---@param enabled boolean
function ChroniclePlayerMetricChart:SetPerSecond(enabled) end

---Set the duration used for per-second conversion, in milliseconds.
---@param durationMillis number
function ChroniclePlayerMetricChart:SetDuration(durationMillis) end

---Set the title used by Chronicle-owned chart surfaces.
---@param title string
function ChroniclePlayerMetricChart:SetPanelTitle(title) end

---Set the label for stacked secondary values.
---@param label string
function ChroniclePlayerMetricChart:SetStackedLabel(label) end

---Override the value suffix.
---@param suffix string
function ChroniclePlayerMetricChart:SetValueSuffix(suffix) end

---Hide primary value badges whose value is zero.
---@param hidden boolean
function ChroniclePlayerMetricChart:SetHideZeroValue(hidden) end

---Set row height in pixels, from 12 through 128.
---@param height number
function ChroniclePlayerMetricChart:SetRowHeight(height) end

---@alias ChronicleLineChartFormat "number"|"compact"|"seconds"|"duration"|"percent"
---@alias ChronicleLineChartCurve "linear"|"monotoneX"|"step"|"natural"|"basis"

---@class ChronicleLineSeries
---@field name string Unique series name, shown in the legend and hover readout.
---@field color? string|number[] "#rrggbb" or {r, g, b, a} with components from 0 through 1. Defaults to a Chronicle palette color.
---@field points number[][] Points as {x, y} or {x = x, y = y}. At most 2,000 points across all series.

---@class ChronicleLineMarker
---@field x number Position on the x axis.
---@field label? string Text drawn beside the marker line.
---@field color? string|number[] "#rrggbb" or {r, g, b, a}.

---@class ChronicleLineChart: ChronicleRegion
local ChronicleLineChart = {}

---Replace every series. At most 12 series and 2,000 points in total. Hovering shows each series' value at that x.
---@param series ChronicleLineSeries[]
function ChronicleLineChart:SetSeries(series) end

---Replace the vertical marker lines, such as phase changes. At most 32.
---@param markers ChronicleLineMarker[]
function ChronicleLineChart:SetMarkers(markers) end

---Choose how x values are written on the axis and in the hover readout. Defaults to "number".
---@param format ChronicleLineChartFormat
function ChronicleLineChart:SetXFormat(format) end

---Choose how y values are written. Defaults to "compact" (1.2k, 3.4M).
---@param format ChronicleLineChartFormat
function ChronicleLineChart:SetYFormat(format) end

---Set the line interpolation. Defaults to "monotoneX".
---@param curve ChronicleLineChartCurve
function ChronicleLineChart:SetCurve(curve) end

---Fill the area under each line.
---@param enabled? boolean Defaults to true.
function ChronicleLineChart:SetArea(enabled) end

---Draw a dot at every point.
---@param enabled? boolean Defaults to true.
function ChronicleLineChart:SetShowPoints(enabled) end

---Stack series on top of each other. Stacked charts are always filled.
---@param enabled? boolean Defaults to true.
function ChronicleLineChart:SetStacked(enabled) end

---Show the legend. Viewers can click legend entries to hide series. Shown by default.
---@param enabled? boolean Defaults to true.
function ChronicleLineChart:SetLegend(enabled) end

---Label the axes. nil or "" removes a label.
---@param xLabel? string
---@param yLabel? string
function ChronicleLineChart:SetAxisLabels(xLabel, yLabel) end

---Fix the x axis range. nil means fit the data.
---@param min? number
---@param max? number
function ChronicleLineChart:SetXRange(min, max) end

---Fix the y axis range. nil means fit the data. The minimum defaults to 0.
---@param min? number
---@param max? number
function ChronicleLineChart:SetYRange(min, max) end

---@class ChronicleButton: ChronicleFrame
local ChronicleButton = {}

---Set the button label.
---@param text string
function ChronicleButton:SetText(text) end

---Create a retained UI object. parent defaults to UIParent.
---@param frameType "Frame"|"FontString"|"Texture"|"Button"|"PlayerMetricChart"|"LineChart"
---@param id? string
---@param parent? ChronicleFrame
---@return ChronicleFrame|ChronicleFontString|ChronicleTexture|ChronicleButton|ChroniclePlayerMetricChart|ChronicleLineChart object
function CreateFrame(frameType, id, parent) end

---@type ChronicleFrame
UIParent = UIParent

---@class Chronicle
Chronicle = {}

---Test a combat-event message against the viewer's panel filters without mutating it. No active filters, or filter_mode none, returns true. Invalid messages raise an API error.
---@param message table A supported combat-event message received by Panel:OnEvent.
---@return boolean matches
function Chronicle.Filter(message) end
