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

---@class ChronicleButton: ChronicleFrame
local ChronicleButton = {}

---Set the button label.
---@param text string
function ChronicleButton:SetText(text) end

---A floating panel Chronicle draws outside your module's panel, so it is never cut off by the panel's size. It looks like Chronicle's own pinned breakouts: a title bar the viewer can drag and a close button. Create it with CreateFrame("Breakout", id); it is always top-level and starts hidden. Put Frames, FontStrings, Textures and Buttons inside it, then call Show(), usually from an OnClick handler.
---@class ChronicleBreakout: ChronicleFrame
local ChronicleBreakout = {}

---Set the text in the title bar.
---@param title? string
function ChronicleBreakout:SetTitle(title) end

---Open beside this frame (to its right, else its left, else below it). nil opens beside the panel.
---@param frame? ChronicleRegion
function ChronicleBreakout:SetAnchor(frame) end

---Register OnClose, which runs after the viewer closes the breakout with its close button. The breakout is already hidden when it runs. Requires the input capability.
---@param script "OnClose"
---@param callback fun(self:ChronicleBreakout)
function ChronicleBreakout:SetScript(script, callback) end

---Spell data from Chronicle.GetSpell.
---@class ChronicleSpellInfo
---@field id integer
---@field name string
---@field rank? string For example "Rank 4".
---@field icon? string Icon name for Texture:SetIcon.

-- BEGIN GENERATED WIDGET DEFINITIONS
-- Generated from src/pages/Guides/widgets. Run pnpm generate:lua-api after changing a widget spec.

---@class ChroniclePlayerMetricRow
---@field playerID string Player GUID used for Chronicle specialization and cosmetic enrichment.
---@field playerName string Display name.
---@field className string Upper-case class token such as "MAGE".
---@field specialization? string Optional specialization label when Chronicle cannot infer one.
---@field value number Primary total before optional per-second conversion.
---@field stackedValue? number Optional secondary total, such as overhealing.
---@field dimmed? boolean Reduce this row's visual prominence.

---@alias ChroniclePlayerMetricChartType "damage"|"healing"|"taken"|"mitigation"

---@class ChronicleLineSeries
---@field name string Unique series name, shown in the legend and hover readout.
---@field color? string|number[] "#rrggbb" or {r, g, b, a} with components from 0 through 1. Defaults to a palette color.
---@field suffix? string Appended to this series' values in the hover readout, such as "/s". Up to 16 characters.
---@field points number[][] Points as {x, y} or {x = x, y = y}. At most 2000 points across all series.

---@class ChronicleLineMarker
---@field x number Position on the x axis.
---@field label? string Text drawn beside the marker line.
---@field color? string|number[] "#rrggbb" or {r, g, b, a}.
---@field tooltip? string Hover text; newlines start new lines. Hovering the marker shows it.
---@field style? "dashed"|"solid"|"dotted" Line style. Defaults to "dashed".
---@field icon? "none"|"triangle"|"dot" Drawn at the top of the line. Defaults to "none".

---@class ChronicleLineBand
---@field from number Start of the shaded range on the x axis.
---@field to number End of the range; at least `from`.
---@field label? string Drawn at the top of the band, such as a phase name.
---@field color? string|number[] "#rrggbb" or {r, g, b, a}. Defaults to violet.
---@field opacity? number Fill opacity from 0 through 1. Defaults to 0.08.
---@field tooltip? string Shown in the hover readout while the pointer is inside the band.

---@alias ChronicleLineChartFormat "number"|"compact"|"seconds"|"duration"|"percent"

---@alias ChronicleLineChartCurve "linear"|"monotoneX"|"step"|"natural"|"basis"

---@alias ChronicleLineChartTimeSelection "off"|"seconds"|"milliseconds"

---Chronicle's standard player meter, with class colors and icons.
---@class ChroniclePlayerMetricChart: ChronicleRegion
local ChroniclePlayerMetricChart = {}

---Replace every row in the chart. At most 100 rows.
---@param data ChroniclePlayerMetricRow[]
function ChroniclePlayerMetricChart:SetData(data) end

---Choose the standard Chronicle player metric presentation.
---@param type ChroniclePlayerMetricChartType
function ChroniclePlayerMetricChart:SetChartType(type) end

---Display values per second using the configured duration.
---@param perSecond? boolean
function ChroniclePlayerMetricChart:SetPerSecond(perSecond) end

---Set the duration used for per-second conversion, in milliseconds.
---@param durationMillis number
function ChroniclePlayerMetricChart:SetDuration(durationMillis) end

---Set the title used by Chronicle-owned chart surfaces.
---@param panelTitle string
function ChroniclePlayerMetricChart:SetPanelTitle(panelTitle) end

---Set the label for stacked secondary values.
---@param stackedLabel string
function ChroniclePlayerMetricChart:SetStackedLabel(stackedLabel) end

---Override the value suffix.
---@param valueSuffix string
function ChroniclePlayerMetricChart:SetValueSuffix(valueSuffix) end

---Hide primary value badges whose value is zero.
---@param hideZeroValue? boolean
function ChroniclePlayerMetricChart:SetHideZeroValue(hideZeroValue) end

---Set row height in pixels, from 12 through 128.
---@param rowHeight number
function ChroniclePlayerMetricChart:SetRowHeight(rowHeight) end

---Numeric series drawn with Chronicle's line chart, the Timeline panel's renderer. Hovering shows every visible series' value at that x; viewers can click legend entries to hide series.
---@class ChronicleLineChart: ChronicleRegion
local ChronicleLineChart = {}

---Replace every series. At most 12 series and 2000 points in total.
---@param series ChronicleLineSeries[]
function ChronicleLineChart:SetSeries(series) end

---Replace the vertical marker lines, such as phase changes. At most 32.
---@param markers ChronicleLineMarker[]
function ChronicleLineChart:SetMarkers(markers) end

---Replace the shaded x ranges drawn behind the lines, such as phases or a background measure. At most 64.
---@param bands ChronicleLineBand[]
function ChronicleLineChart:SetBands(bands) end

---Choose how x values are written on the axis and in the hover readout. Defaults to "number".
---@param xFormat ChronicleLineChartFormat
function ChronicleLineChart:SetXFormat(xFormat) end

---Choose how y values are written. Defaults to "compact" (1.2k, 3.4M).
---@param yFormat ChronicleLineChartFormat
function ChronicleLineChart:SetYFormat(yFormat) end

---Set the line interpolation. Defaults to "monotoneX".
---@param curve ChronicleLineChartCurve
function ChronicleLineChart:SetCurve(curve) end

---Fill the area under each line.
---@param area? boolean Defaults to true.
function ChronicleLineChart:SetArea(area) end

---Draw a dot at every point.
---@param showPoints? boolean Defaults to true.
function ChronicleLineChart:SetShowPoints(showPoints) end

---Stack series on top of each other. Stacked charts are always filled.
---@param stacked? boolean Defaults to true.
function ChronicleLineChart:SetStacked(stacked) end

---Size the chart to fill its parent frame (or the whole panel), ignoring SetPoint and SetSize.
---@param fillParent? boolean Defaults to true.
function ChronicleLineChart:SetFillParent(fillParent) end

---Let viewers drag across the chart to set the page's time range, like the Line Chart panel; double-click clears it. The selected range is highlighted. Use Chronicle.OnTimeRangeChanged to react to it.
---@param timeSelection ChronicleLineChartTimeSelection What the x axis measures: fight time in "seconds" or "milliseconds". "off" (the default) disables selection.
function ChronicleLineChart:SetTimeSelection(timeSelection) end

---Show or hide the legend. Shown by default.
---@param legend? boolean Defaults to true.
function ChronicleLineChart:SetLegend(legend) end

---Label the axes. nil or "" removes a label.
---@param xLabel? string
---@param yLabel? string
function ChronicleLineChart:SetAxisLabels(xLabel, yLabel) end

---Fix the x axis range. nil means fit the data.
---@param xMin? number
---@param xMax? number
function ChronicleLineChart:SetXRange(xMin, xMax) end

---Fix the y axis range. nil means fit the data. The minimum defaults to 0.
---@param yMin? number
---@param yMax? number
function ChronicleLineChart:SetYRange(yMin, yMax) end

---Create a retained UI object. parent defaults to UIParent.
---@param frameType "Frame"|"FontString"|"Texture"|"Button"|"Breakout"|"PlayerMetricChart"|"LineChart"
---@param id? string
---@param parent? ChronicleFrame
---@return ChronicleFrame|ChronicleFontString|ChronicleTexture|ChronicleButton|ChronicleBreakout|ChroniclePlayerMetricChart|ChronicleLineChart object
function CreateFrame(frameType, id, parent) end

-- END GENERATED WIDGET DEFINITIONS

---@type ChronicleFrame
UIParent = UIParent

---@class Chronicle
Chronicle = {}

---Test a combat-event message against the viewer's panel filters without mutating it. No active filters, or filter_mode none, returns true. Invalid messages raise an API error.
---@param message table A supported combat-event message received by Panel:OnEvent.
---@return boolean matches
function Chronicle.Filter(message) end

---Set the page's time range filter, which every panel on the instance page uses. Times are milliseconds from encounter start, like event.offsetMs; nil leaves a bound open. Needs the input capability and works only inside an OnClick handler, so a module cannot move the range on its own. Ranges past the end of the selected encounters are clamped.
---@param startMs? number
---@param endMs? number Must be at least startMs.
function Chronicle.SetTimeRange(startMs, endMs) end

---Clear the page's time range filter. Same rules as Chronicle.SetTimeRange.
function Chronicle.ClearTimeRange() end

---Call `callback(startMs, endMs)` whenever the page's time range changes, for example when a viewer drags across a chart or moves the time slider. Bounds are nil when open; both are nil when the range is cleared. It is also called right after loading if a range is already set. It is not called for the module's own Chronicle.SetTimeRange, and cannot call SetTimeRange itself. Registering again replaces the previous callback.
---@param callback fun(startMs: number?, endMs: number?)
function Chronicle.OnTimeRangeChanged(callback) end

---Look up a spell's name, rank and icon. Chronicle fetches spell data from its server, so `callback(spell)` runs later, after the current callback returns; `spell` is nil when Chronicle has no data for that ID. A spell this module has already looked up calls back immediately. Each run may look up at most 1,000 different spells.
---@param spellId integer
---@param callback fun(spell: ChronicleSpellInfo?)
function Chronicle.GetSpell(spellId, callback) end

---Return the page's current time range in milliseconds from encounter start. Either bound is nil when open; both are nil when no range is set.
---@return number? startMs
---@return number? endMs
function Chronicle.GetTimeRange() end
