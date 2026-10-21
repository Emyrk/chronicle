-- Chronicle's Onyxia package is intentionally authored entirely in Lua.
-- Tactics for Turtle WoW 1.18.1 are community-sourced and should be checked
-- against current raid logs; exact add timing and threat rules remain uncertain.

local GREEN = {0.13, 0.77, 0.37, 0.78}
local RED = {0.94, 0.27, 0.27, 0.78}
local GOLD = {0.98, 0.78, 0.08, 1.0}
local BLUE = {0.23, 0.51, 0.96, 0.92}
local ORANGE = {0.98, 0.45, 0.09, 0.85}
local WHITE = {0.96, 0.96, 0.95, 1.0}
local MUTED = {0.72, 0.72, 0.68, 1.0}

local chapters = {
  {
    id = "briefing",
    eyebrow = "BEFORE THE PULL",
    title = "Give every group a side",
    body = "Hold Onyxia at the north wall, form two shallow raid wings on her flanks, and reserve the entrance half for add control. Keep the centre lane readable.",
    correct = "Assign three or four tank jobs and leave the centre open.",
    wrong = "A loose centre stack hides breaths, overlaps healers, and leaves no transition path.",
  },
  {
    id = "phase-one",
    eyebrow = "PHASE 1 · 100% → 65%",
    title = "Flanks are safe; front and tail are not",
    body = "Let the main tank settle Onyxia facing north. Melee use the rear flanks rather than standing directly behind her, while ranged and healers mirror each other.",
    correct = "Think wings, not a semicircle. Nobody crosses the dragon to reach an assignment.",
    wrong = "Turning Onyxia into the raid makes every correction worse. Re-centre the boss first.",
  },
  {
    id = "air-phase",
    eyebrow = "PHASE 2 · 65% → 40%",
    title = "Kill the drake before the landing",
    body = "Community reports describe an additional dragonkin in the air phase. Assign an off-tank and melee to it, control both whelp sides, and stop boss damage if the add is alive near 40%.",
    correct = "Use separated whelp pockets and a spread ranged line while melee kill the drake.",
    wrong = "A centre stack gives fireballs and loose whelps the same target.",
  },
  {
    id = "deep-breath",
    eyebrow = "PHASE 2 REACTION",
    title = "Move sideways; never race the breath",
    body = "Watch Onyxia's position and facing. When she lines up the room, leave the projected lane at a right angle through the closest edge.",
    correct = "The shortest safe movement is perpendicular to the lane. Pick an edge and commit.",
    wrong = "Running down the lane keeps the raid in danger longer and blocks nearby exits.",
  },
  {
    id = "landing",
    eyebrow = "PHASE 3 · 40% → KILL",
    title = "Separate the hatchers, then burn",
    body = "Treat the landing as a second pull. Re-establish Onyxia north, isolate both reported hatchers, move out of Rain of Fire, control whelps, and kill adds before returning to the boss.",
    correct = "Separate add control from the boss group and preserve a clean raid lane.",
    wrong = "Mixing the boss, adds, and raid makes fear or a tail swipe turn the transition into a wipe.",
  },
}

local roleColors = {
  boss = {0.96, 0.25, 0.35, 1},
  tank = {0.22, 0.50, 0.96, 1},
  healer = {0.20, 0.82, 0.42, 1},
  melee = {0.98, 0.72, 0.16, 1},
  ranged = {0.68, 0.40, 0.94, 1},
  add = {0.98, 0.45, 0.09, 1},
}

local chapterIndex = 1
local showingCorrect = true
local scene = {}

local function color(object, rgba)
  object:SetColor(rgba[1], rgba[2], rgba[3], rgba[4])
end

local function fill(object, rgba)
  object:SetFillColor(rgba[1], rgba[2], rgba[3], rgba[4])
end

local function remember(object)
  table.insert(scene, object)
  return object
end

local function clearScene()
  for _, object in ipairs(scene) do object:Destroy() end
  scene = {}
end

local function unit(id, label, role, x, y, facing, entry)
  local marker = remember(Map:CreateUnitMarker(id))
  marker:SetMapPosition(x, y)
  marker:SetSize(role == "boss" and 32 or 19, role == "boss" and 32 or 19)
  marker:SetLabel(label)
  marker:SetRole(role)
  marker:SetFacing(facing or 0)
  if entry then marker:SetCreatureID(entry) end
  color(marker, roleColors[role])
  return marker
end

local function circle(id, x, y, radius, rgba)
  local shape = remember(Map:CreateCircle(id))
  shape:SetMapPosition(x, y)
  shape:SetRadius(radius)
  shape:SetLineWidth(2)
  color(shape, rgba)
  fill(shape, {rgba[1], rgba[2], rgba[3], 0.18})
  return shape
end

local function cone(id, x, y, radius, facing, angle, rgba)
  local shape = remember(Map:CreateCone(id))
  shape:SetMapPosition(x, y)
  shape:SetRadius(radius)
  shape:SetFacing(facing)
  shape:SetAngle(angle)
  shape:SetLineWidth(2)
  color(shape, rgba)
  fill(shape, {rgba[1], rgba[2], rgba[3], 0.16})
  return shape
end

local function arrow(id, x1, y1, x2, y2, rgba)
  local shape = remember(Map:CreateArrow(id))
  shape:SetPoints({x1, y1, x2, y2})
  shape:SetLineWidth(3)
  shape:SetHeadSize(10)
  color(shape, rgba)
  return shape
end

local function mapText(id, text, x, y, rgba)
  local label = remember(Map:CreateText(id))
  label:SetMapPosition(x, y)
  label:SetText(text)
  label:SetFontSize(16)
  color(label, rgba)
  return label
end

local function lineOf(role, prefix, count, x1, y1, x2, y2)
  for index = 1, count do
    local amount = count == 1 and 0.5 or (index - 1) / (count - 1)
    unit(prefix .. index, role .. " " .. index, role,
      x1 + (x2 - x1) * amount,
      y1 + (y2 - y1) * amount,
      0)
  end
end

local function standardFlanks()
  lineOf("melee", "melee-left-", 5, 0.46, 0.39, 0.62, 0.38)
  lineOf("melee", "melee-right-", 5, 0.46, 0.61, 0.62, 0.62)
  lineOf("ranged", "ranged-left-", 5, 0.48, 0.27, 0.70, 0.25)
  lineOf("ranged", "ranged-right-", 5, 0.48, 0.73, 0.70, 0.75)
  lineOf("healer", "healer-", 5, 0.55, 0.31, 0.55, 0.69)
end

local function renderBriefing(correct)
  unit("onyxia", "Onyxia", "boss", 0.42, 0.50, 0, 10184)
  if correct then
    unit("main-tank", "Main Tank", "tank", 0.16, 0.50, math.pi)
    standardFlanks()
    circle("left-wing", 0.56, 0.34, 0.12, GREEN)
    circle("right-wing", 0.56, 0.66, 0.12, GREEN)
    arrow("centre-lane", 0.88, 0.50, 0.14, 0.50, WHITE)
    mapText("lane-label", "KEEP CENTRE CLEAR", 0.78, 0.50, WHITE)
  else
    lineOf("melee", "bad-melee-", 8, 0.55, 0.46, 0.66, 0.54)
    lineOf("ranged", "bad-ranged-", 8, 0.66, 0.43, 0.75, 0.57)
    circle("bad-stack", 0.64, 0.50, 0.17, RED)
    mapText("bad-label", "NO GROUP ASSIGNMENTS", 0.78, 0.50, RED)
  end
end

local function renderPhaseOne(correct)
  unit("onyxia", "Onyxia", "boss", 0.42, 0.50, correct and 0 or math.pi, 10184)
  cone("breath", 0.42, 0.50, 0.25, correct and 0 or math.pi, 1.15, RED)
  cone("tail", 0.42, 0.50, 0.22, correct and math.pi or 0, 0.95, RED)
  if correct then
    unit("main-tank", "Main Tank", "tank", 0.16, 0.50, math.pi)
    standardFlanks()
    circle("safe-left", 0.56, 0.34, 0.12, GREEN)
    circle("safe-right", 0.56, 0.66, 0.12, GREEN)
  else
    unit("main-tank", "Main Tank", "tank", 0.58, 0.50, 0)
    lineOf("melee", "tail-stack-", 9, 0.48, 0.47, 0.66, 0.53)
    lineOf("ranged", "front-stack-", 9, 0.64, 0.42, 0.78, 0.58)
    circle("danger-stack", 0.63, 0.50, 0.17, RED)
  end
end

local function renderAir(correct)
  unit("onyxia", "Onyxia", "boss", 0.34, 0.50, math.pi / 2, 10184)
  unit("drake", "Air-phase Drake", "add", correct and 0.66 or 0.48, 0.50, 0)
  circle("left-pit", 0.78, 0.28, 0.08, ORANGE)
  circle("right-pit", 0.78, 0.72, 0.08, correct and ORANGE or RED)
  if correct then
    unit("left-tank", "Whelp Tank", "tank", 0.72, 0.27, 0)
    unit("right-tank", "Whelp Tank", "tank", 0.72, 0.73, 0)
    lineOf("melee", "drake-team-", 7, 0.57, 0.43, 0.69, 0.57)
    lineOf("ranged", "spread-", 9, 0.32, 0.24, 0.52, 0.76)
    arrow("left-control", 0.78, 0.28, 0.68, 0.34, GREEN)
    arrow("right-control", 0.78, 0.72, 0.68, 0.66, GREEN)
    mapText("spread-label", "SPREAD FOR FIREBALLS", 0.25, 0.50, BLUE)
  else
    lineOf("ranged", "centre-stack-", 12, 0.47, 0.43, 0.57, 0.57)
    lineOf("melee", "boss-tunnel-", 7, 0.38, 0.45, 0.48, 0.55)
    arrow("loose-whelps", 0.78, 0.72, 0.53, 0.52, RED)
    circle("air-stack", 0.52, 0.50, 0.15, RED)
    mapText("whelp-label", "UNCONTROLLED WHELPS", 0.73, 0.64, RED)
  end
end

local function renderBreath(correct)
  unit("onyxia", "Onyxia", "boss", 0.20, 0.50, math.pi / 2, 10184)
  local lane = remember(Map:CreatePolygon("breath-lane"))
  lane:SetPoints({0.18, 0.39, 0.88, 0.39, 0.88, 0.61, 0.18, 0.61})
  lane:SetLineWidth(2)
  color(lane, RED)
  fill(lane, {0.94, 0.27, 0.27, 0.22})
  if correct then
    lineOf("ranged", "upper-", 6, 0.44, 0.27, 0.74, 0.27)
    lineOf("healer", "lower-", 5, 0.47, 0.73, 0.72, 0.73)
    arrow("upper-exit", 0.55, 0.46, 0.55, 0.27, GREEN)
    arrow("lower-exit", 0.58, 0.55, 0.58, 0.73, GREEN)
    mapText("breath-advice", "CROSS THE CLOSEST EDGE", 0.69, 0.20, GREEN)
  else
    lineOf("ranged", "bad-breath-stack-", 11, 0.48, 0.46, 0.63, 0.54)
    arrow("run-with-breath", 0.51, 0.50, 0.82, 0.50, RED)
    circle("breath-stack", 0.56, 0.50, 0.14, RED)
    mapText("breath-fail", "RUNNING WITH THE BREATH", 0.70, 0.66, RED)
  end
end

local function renderLanding(correct)
  unit("onyxia", "Onyxia", "boss", 0.41, 0.50, correct and 0 or math.pi, 10184)
  unit("hatcher-left", "Onyxian Hatcher", "add", 0.79, 0.34, 0, 11262)
  unit("hatcher-right", "Onyxian Hatcher", "add", 0.79, 0.66, 0, 11262)
  if correct then
    unit("main-tank", "Main Tank", "tank", 0.16, 0.50, math.pi)
    unit("add-tank-left", "Hatcher Tank", "tank", 0.72, 0.29, 0)
    unit("add-tank-right", "Hatcher Tank", "tank", 0.72, 0.71, 0)
    standardFlanks()
    circle("boss-zone", 0.47, 0.50, 0.20, GREEN)
    circle("add-left-zone", 0.78, 0.30, 0.11, ORANGE)
    circle("add-right-zone", 0.78, 0.70, 0.11, ORANGE)
    mapText("add-label", "ADD CONTROL", 0.84, 0.50, ORANGE)
  else
    unit("main-tank", "Main Tank", "tank", 0.58, 0.50, 0)
    lineOf("melee", "landing-stack-", 10, 0.50, 0.44, 0.69, 0.56)
    lineOf("ranged", "landing-ranged-", 8, 0.64, 0.40, 0.76, 0.60)
    circle("mixed-zone", 0.65, 0.50, 0.22, RED)
    cone("landing-breath", 0.41, 0.50, 0.28, math.pi, 1.2, RED)
    mapText("landing-fail", "BOSS + ADDS + RAID", 0.77, 0.50, RED)
  end
end

local root = CreateFrame("Frame", "guide-panel", UIParent)
root:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 24, -24)
root:SetSize(430, 310)
root:SetBackgroundColor(0.03, 0.035, 0.045, 0.93)
root:SetBorderColor(1, 1, 1, 0.18)
root:SetLayer("OVERLAY")

local eyebrow = CreateFrame("FontString", "guide-eyebrow", root)
eyebrow:SetPoint("TOPLEFT", root, "TOPLEFT", 22, -20)
eyebrow:SetFontSize(12)
color(eyebrow, GOLD)

local title = CreateFrame("FontString", "guide-title", root)
title:SetPoint("TOPLEFT", root, "TOPLEFT", 22, -50)
title:SetSize(386, 60)
title:SetFontSize(25)
color(title, WHITE)

local body = CreateFrame("FontString", "guide-body", root)
body:SetPoint("TOPLEFT", root, "TOPLEFT", 22, -115)
body:SetSize(386, 86)
body:SetFontSize(14)
color(body, MUTED)

local callout = CreateFrame("FontString", "guide-callout", root)
callout:SetPoint("TOPLEFT", root, "TOPLEFT", 22, -208)
callout:SetSize(386, 46)
callout:SetFontSize(13)

local progress = CreateFrame("FontString", "guide-progress", root)
progress:SetPoint("BOTTOM", root, "BOTTOM", 0, 18)
progress:SetFontSize(12)
color(progress, MUTED)

local previous = CreateFrame("Button", "guide-previous", root)
previous:SetPoint("BOTTOMLEFT", root, "BOTTOMLEFT", 20, 14)
previous:SetSize(88, 36)
previous:SetText("Previous")
previous:SetBackgroundColor(0.12, 0.13, 0.17, 0.96)
previous:SetBorderColor(1, 1, 1, 0.18)

local mode = CreateFrame("Button", "guide-mode", root)
mode:SetPoint("BOTTOM", root, "BOTTOM", 0, 54)
mode:SetSize(136, 34)
mode:SetBackgroundColor(0.10, 0.20, 0.13, 0.96)
mode:SetBorderColor(1, 1, 1, 0.18)

local nextButton = CreateFrame("Button", "guide-next", root)
nextButton:SetPoint("BOTTOMRIGHT", root, "BOTTOMRIGHT", -20, 14)
nextButton:SetSize(88, 36)
nextButton:SetText("Next")
nextButton:SetBackgroundColor(0.12, 0.13, 0.17, 0.96)
nextButton:SetBorderColor(1, 1, 1, 0.18)

local disclaimer = CreateFrame("FontString", "guide-disclaimer", UIParent)
disclaimer:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 26, 22)
disclaimer:SetText("Community strategy prototype · verify uncertain mechanics against current logs")
disclaimer:SetFontSize(11)
color(disclaimer, MUTED)

local function render()
  clearScene()
  local chapter = chapters[chapterIndex]
  Guide:SetChapter(chapter.id)
  eyebrow:SetText(chapter.eyebrow)
  title:SetText(chapter.title)
  body:SetText(chapter.body)
  callout:SetText(showingCorrect and chapter.correct or chapter.wrong)
  color(callout, showingCorrect and GREEN or RED)
  progress:SetText(chapterIndex .. " / " .. #chapters)
  mode:SetText(showingCorrect and "Showing: Safe" or "Showing: Danger")
  mode:SetBackgroundColor(showingCorrect and 0.10 or 0.28, showingCorrect and 0.24 or 0.08, showingCorrect and 0.15 or 0.08, 0.96)

  if chapter.id == "briefing" then renderBriefing(showingCorrect)
  elseif chapter.id == "phase-one" then renderPhaseOne(showingCorrect)
  elseif chapter.id == "air-phase" then renderAir(showingCorrect)
  elseif chapter.id == "deep-breath" then renderBreath(showingCorrect)
  else renderLanding(showingCorrect) end

  Map:SetCamera(0.5, 0.5, chapter.id == "deep-breath" and 1.08 or 1.0)
  callout:SetAlpha(1)
  C_Timer.After(0.6, function() callout:SetAlpha(0.78) end)
end

previous:SetScript("OnClick", function()
  chapterIndex = chapterIndex == 1 and #chapters or chapterIndex - 1
  render()
end)

nextButton:SetScript("OnClick", function()
  chapterIndex = chapterIndex == #chapters and 1 or chapterIndex + 1
  render()
end)

mode:SetScript("OnClick", function()
  showingCorrect = not showingCorrect
  render()
end)

UIParent:SetScript("OnSizeChanged", function(_, width, height)
  if width < 760 then
    root:SetPoint("TOP", UIParent, "TOP", 0, -16)
    root:SetWidth(math.max(300, width - 28))
  else
    root:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 24, -24)
    root:SetWidth(430)
  end
end)

render()
