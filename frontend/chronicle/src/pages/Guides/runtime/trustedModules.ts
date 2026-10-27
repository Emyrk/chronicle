// These modules belong to the host, never to uploaded ZIPs. They are loaded only by require().
const MODULES: Readonly<Record<string, string>> = Object.freeze({
  "chronicle/v1/events/damage.lua": `
    local M = {}
    -- The host owns the stream and projects only source, target, amount, offsetMs, encounterId, selected.
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
    return M
  `,
})

export function isReservedLuaPath(path: string): boolean {
  return path === "chronicle" || path.startsWith("chronicle/") || path.startsWith("chronicle.")
}

export function trustedLuaModule(path: string): string | undefined {
  return Object.hasOwn(MODULES, path) ? MODULES[path] : undefined
}
