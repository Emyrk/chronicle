import { PANEL_STREAMS, type PanelStream } from "./panelEvents"

/** chronicle.v1.events.<stream>: onEvent for one stream, plus the shared onComplete. */
const streamModule = (stream: PanelStream) => `
    local M = {}
    function M.onEvent(callback)
      Panel:OnEvent("${stream}", callback)
    end
    -- Called once after the last event of the replay; draw final totals here.
    function M.onComplete(callback)
      Panel:OnComplete(callback)
    end
    return M
  `

// These modules belong to the host, never to uploaded ZIPs. They are loaded only by require().
const MODULES: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(PANEL_STREAMS.map(stream => [`chronicle/v1/events/${stream}.lua`, streamModule(stream)])),
  // Every declared stream through one callback; event.stream says which.
  "chronicle/v1/events.lua": `
    local M = {}
    function M.onEvent(callback)
      Panel:OnEvent(callback)
    end
    function M.onComplete(callback)
      Panel:OnComplete(callback)
    end
    return M
  `,
  "chronicle/v1/events/damage.lua": `
    local M = {}
    function M.onEvent(callback)
      Panel:OnEvent("damage", callback)
    end
    -- Called once after the last event of the replay; draw final totals here.
    function M.onComplete(callback)
      Panel:OnComplete(callback)
    end
    function M.bySource(onUpdate)
      local totals = {}
      M.onEvent(function(event)
        totals[event.source] = (totals[event.source] or 0) + event.amount
        onUpdate(event.source, totals[event.source])
      end)
      return totals
    end
    return M
  `,
  "chronicle/v1/ui.lua": `
    local M = {}
    function M.metric(parent, id, label, value, x, y)
      local box = CreateFrame("Frame", id, parent or UIParent)
      box:SetPoint("TOPLEFT", UIParent, "TOPLEFT", x or 0, y or 0)
      box:SetSize(180, 52)
      local title = box:CreateFontString(id .. "-label")
      title:SetPoint("TOPLEFT", box, "TOPLEFT", 4, -2)
      title:SetText(label)
      local amount = box:CreateFontString(id .. "-value")
      amount:SetPoint("TOPLEFT", box, "TOPLEFT", 4, -24)
      amount:SetFontSize(20)
      amount:SetText(tostring(value))
      return { frame = box, set = function(v) amount:SetText(tostring(v)) end }
    end
    function M.table(parent, id, rows, x, y)
      assert(#rows <= 50, "table row limit exceeded")
      local frame = CreateFrame("Frame", id, parent or UIParent)
      frame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", x or 0, y or 0)
      frame:SetSize(320, math.max(1, #rows * 24))
      for i, row in ipairs(rows) do
        local cell = frame:CreateFontString(id .. "-row-" .. i)
        cell:SetPoint("TOPLEFT", frame, "TOPLEFT", 4, -(i - 1) * 24)
        cell:SetSize(310, 22)
        cell:SetText(tostring(row[1]) .. "    " .. tostring(row[2]))
      end
      return frame
    end
    function M.bars(parent, id, rows, x, y)
      assert(#rows <= 50, "chart row limit exceeded")
      local frame = CreateFrame("Frame", id, parent or UIParent)
      frame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", x or 0, y or 0)
      frame:SetSize(320, math.max(1, #rows * 28))
      for i, row in ipairs(rows) do
        local bar = CreateFrame("Frame", id .. "-bar-" .. i, frame)
        bar:SetPoint("TOPLEFT", frame, "TOPLEFT", 0, -(i - 1) * 28)
        bar:SetSize(math.max(1, math.min(310, tonumber(row[2]) or 0)), 24)
        bar:SetBackgroundColor(0.15, 0.5, 0.75, 0.8)
        local label = bar:CreateFontString(id .. "-bar-label-" .. i)
        label:SetText(tostring(row[1]) .. " " .. tostring(row[2]))
      end
      return frame
    end
    function M.playerMetricChart(parent, id, options)
      options = options or {}
      local chart = CreateFrame("PlayerMetricChart", id, parent or UIParent)
      chart:SetPoint("TOPLEFT", parent or UIParent, "TOPLEFT", options.x or 0, options.y or 0)
      chart:SetSize(options.width or 320, options.height or 240)
      chart:SetChartType(options.type or "damage")
      chart:SetPerSecond(options.perSecond or false)
      chart:SetHideZeroValue(options.hideZeroValue or false)
      chart:SetRowHeight(options.rowHeight or 30)
      if options.durationMillis ~= nil then chart:SetDuration(options.durationMillis) end
      if options.panelTitle ~= nil then chart:SetPanelTitle(options.panelTitle) end
      if options.stackedLabel ~= nil then chart:SetStackedLabel(options.stackedLabel) end
      if options.valueSuffix ~= nil then chart:SetValueSuffix(options.valueSuffix) end
      chart:SetData(options.data or {})
      return chart
    end
    function M.lineChart(parent, id, options)
      options = options or {}
      local chart = CreateFrame("LineChart", id, parent or UIParent)
      chart:SetPoint("TOPLEFT", parent or UIParent, "TOPLEFT", options.x or 0, options.y or 0)
      chart:SetSize(options.width or 480, options.height or 240)
      if options.xFormat ~= nil then chart:SetXFormat(options.xFormat) end
      if options.yFormat ~= nil then chart:SetYFormat(options.yFormat) end
      if options.curve ~= nil then chart:SetCurve(options.curve) end
      if options.area ~= nil then chart:SetArea(options.area) end
      if options.showPoints ~= nil then chart:SetShowPoints(options.showPoints) end
      if options.stacked ~= nil then chart:SetStacked(options.stacked) end
      if options.legend ~= nil then chart:SetLegend(options.legend) end
      if options.xLabel ~= nil or options.yLabel ~= nil then chart:SetAxisLabels(options.xLabel, options.yLabel) end
      if options.xMin ~= nil or options.xMax ~= nil then chart:SetXRange(options.xMin, options.xMax) end
      if options.yMin ~= nil or options.yMax ~= nil then chart:SetYRange(options.yMin, options.yMax) end
      if options.markers ~= nil then chart:SetMarkers(options.markers) end
      chart:SetSeries(options.series or {})
      return chart
    end
    return M
  `,
})

export function isReservedLuaPath(path: string): boolean {
  return path === "chronicle" || path.startsWith("chronicle/") || path.startsWith("chronicle.")
}

export function trustedLuaModule(path: string): string | undefined {
  return Object.hasOwn(MODULES, path) ? MODULES[path] : undefined
}
