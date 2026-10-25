-- Chronicle's Onyxia package is authored entirely in Lua.
-- Turtle WoW 1.18.1 tactics are community-sourced and should be checked
-- against current raid logs; exact add timing and threat rules remain uncertain.

local GREEN = {0.13, 0.77, 0.37, 0.78}
local RED = {0.94, 0.27, 0.27, 0.78}
local GOLD = {0.98, 0.78, 0.08, 1.0}
local BLUE = {0.23, 0.51, 0.96, 0.92}
local ORANGE = {0.98, 0.45, 0.09, 0.85}
local WHITE = {0.96, 0.96, 0.95, 1.0}
local MUTED = {0.72, 0.72, 0.68, 1.0}

-- Onyxia's package scenes use the same world-yard coordinates as Chronicle's
-- combat-log map and the original raid-guide prototype. Convert those points
-- into the normalized rendered-map coordinates exposed by the Lua API.
local MIN_X = -260.0325
local MAX_X = 63.2182
local MIN_Y = -286.4366
local MAX_Y = 26.0842
local WORLD_SCALE = math.min(MAX_X - MIN_X, MAX_Y - MIN_Y)
local ARENA_Y_OFFSET = -43

local function point(x, y)
  return {x = x, y = y + ARENA_Y_OFFSET}
end

local function mapPoint(at)
  return (MAX_Y - at.y) / (MAX_Y - MIN_Y), (MAX_X - at.x) / (MAX_X - MIN_X)
end

local function mapRadius(yards)
  return yards / WORLD_SCALE
end

local ONYXIA = {x = -18, y = -214}
local NORTH = {x = 32, y = -214}
local ENTRANCE = {x = -92, y = -214}
local LEFT_PIT = {x = -61, y = -169}
local RIGHT_PIT = {x = -61, y = -259}
local ARENA_CENTRE = {x = -24, y = -214}

local chapters = {
  {
    id = "entrance",
    eyebrow = "REAL RAID MOVEMENT · 18 SECONDS",
    title = "Watch the raid enter the room",
    body = "This opening uses Chronicle unit-position protobuf events sampled from a real Onyxia pull. Play, pause, or scrub the timeline to inspect every route.",
    correct = "Use the real paths as the starting point, then tune entrance.json when a chip crosses terrain or finishes in the wrong assignment.",
    wrong = "The incorrect view is reserved for comparing an unsafe entrance once its paths have been authored.",
  },
  {
    id = "briefing",
    eyebrow = "BEFORE THE PULL",
    title = "Give every group a side",
    body = "Build the room around three jobs: hold Onyxia at the north wall, keep the raid on her flanks, and reserve the entrance half for add control.",
    correct = "The room should look deliberately empty through the middle. That space becomes your warning system later.",
    wrong = "One loose stack creates tail swipes, breath hits, healer overlap, and no obvious path when the fight changes phase.",
  },
  {
    id = "phase-one",
    eyebrow = "PHASE 1 · 100% → 65%",
    title = "Flanks are safe, front and tail are not",
    body = "The main tank points Onyxia into the north wall. Everyone else forms two shallow wings beside her ribcage, never a stack behind her tail.",
    correct = "Think wings, not a semicircle. Nobody needs to cross the dragon's front or tail to reach their assignment.",
    wrong = "Turning Onyxia into the raid makes every correction worse. The tank re-centres first; the raid does not chase through her hitbox.",
  },
  {
    id = "air-phase",
    eyebrow = "PHASE 2 · 65% → 40%",
    title = "Kill the drake before the landing",
    body = "Onyxia takes the air with a reported dragonkin add. An off-tank holds it for melee while ranged pressure Onyxia and the raid controls both whelp sides.",
    correct = "Controlled whelp pockets and a spread ranged line keep the room readable. The drake must die before Onyxia lands.",
    wrong = "A centre stack gives fireballs and loose whelps the same target and hides Onyxia's line until the breath is committed.",
  },
  {
    id = "deep-breath",
    eyebrow = "PHASE 2 REACTION",
    title = "Move sideways, never race the breath",
    body = "When Onyxia lines up the room, leave the projected lane at a right angle through the closest edge. Do not run along the breath path.",
    correct = "The shortest safe movement is perpendicular to the lane. Pick the closer edge and commit immediately.",
    wrong = "Running down the lane keeps the raid inside the hazard longer and blocks players trying to take the nearest exit.",
  },
  {
    id = "landing",
    eyebrow = "PHASE 3 · 40% → KILL",
    title = "Separate the hatchers, then burn",
    body = "Treat the landing as a second pull. Re-establish Onyxia north, isolate the two reported hatchers, move out of Rain of Fire, and kill adds first.",
    correct = "Separate both hatchers, step out of Rain of Fire, kill the add priority, then spend cooldowns on Onyxia.",
    wrong = "Chasing damage mixes the dragon, adds, and raid in one lane. Fear or a tail swipe turns the transition into a wipe.",
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

local function normalizedFacing(radians)
  local fullTurn = math.pi * 2
  local value = radians or 0
  while value < 0 do value = value + fullTurn end
  while value > fullTurn do value = value - fullTurn end
  return value
end

local function unit(id, label, role, at, facing, entry)
  local marker = remember(Map:CreateUnitMarker(id))
  marker:SetMapPosition(mapPoint(at))
  marker:SetSize(role == "boss" and 32 or 19, role == "boss" and 32 or 19)
  marker:SetLabel(label)
  marker:SetRole(role)
  marker:SetFacing(normalizedFacing(facing))
  if entry then marker:SetCreatureID(entry) end
  color(marker, roleColors[role])
  return marker
end

local function boss(at, facing)
  return unit("onyxia", "Onyxia", "boss", at or ONYXIA, facing or 0, 10184)
end

local function roleLine(prefix, role, count, from, to)
  for index = 1, count do
    local amount = count == 1 and 0.5 or (index - 1) / (count - 1)
    unit(prefix .. "-" .. index, role:sub(1, 1):upper() .. role:sub(2) .. " " .. index, role, {
      x = from.x + (to.x - from.x) * amount,
      y = from.y + (to.y - from.y) * amount,
    })
  end
end

local function roleArc(prefix, role, count, centre, radius, startAngle, endAngle)
  for index = 1, count do
    local amount = count == 1 and 0.5 or (index - 1) / (count - 1)
    local angle = startAngle + (endAngle - startAngle) * amount
    unit(prefix .. "-" .. index, role:sub(1, 1):upper() .. role:sub(2) .. " " .. index, role, {
      x = centre.x + math.cos(angle) * radius,
      y = centre.y + math.sin(angle) * radius,
    }, angle + math.pi)
  end
end

local function circle(id, at, radius, rgba)
  local shape = remember(Map:CreateCircle(id))
  shape:SetMapPosition(mapPoint(at))
  shape:SetRadius(mapRadius(radius))
  shape:SetLineWidth(2)
  color(shape, rgba)
  fill(shape, {rgba[1], rgba[2], rgba[3], 0.18})
  return shape
end

local function cone(id, at, radius, facing, widthDegrees, rgba)
  local shape = remember(Map:CreateCone(id))
  shape:SetMapPosition(mapPoint(at))
  shape:SetRadius(mapRadius(radius))
  shape:SetFacing(normalizedFacing(facing))
  shape:SetAngle(widthDegrees * math.pi / 180)
  shape:SetLineWidth(2)
  color(shape, rgba)
  fill(shape, {rgba[1], rgba[2], rgba[3], 0.16})
  return shape
end

local function arrow(id, from, to, rgba)
  local fromX, fromY = mapPoint(from)
  local toX, toY = mapPoint(to)
  local shape = remember(Map:CreateArrow(id))
  shape:SetPoints({fromX, fromY, toX, toY})
  shape:SetLineWidth(3)
  shape:SetHeadSize(10)
  color(shape, rgba)
  return shape
end

local function rectangle(id, from, to, rgba)
  local x1, y1 = mapPoint({x = from.x, y = from.y})
  local x2, y2 = mapPoint({x = to.x, y = from.y})
  local x3, y3 = mapPoint({x = to.x, y = to.y})
  local x4, y4 = mapPoint({x = from.x, y = to.y})
  local shape = remember(Map:CreatePolygon(id))
  shape:SetPoints({x1, y1, x2, y2, x3, y3, x4, y4})
  shape:SetLineWidth(2)
  color(shape, rgba)
  fill(shape, {rgba[1], rgba[2], rgba[3], 0.18})
  return shape
end

local function mapText(id, label, at, rgba)
  local text = remember(Map:CreateText(id))
  text:SetMapPosition(mapPoint(at))
  text:SetText(label)
  text:SetFontSize(16)
  color(text, rgba)
  return text
end

local function safeFlanks()
  roleLine("melee-left", "melee", 5, point(-7, -145), point(-35, -143))
  roleLine("melee-right", "melee", 5, point(-7, -197), point(-35, -199))
  roleLine("ranged-left", "ranged", 5, point(-11, -128), point(-51, -125))
  roleLine("ranged-right", "ranged", 5, point(-11, -214), point(-51, -217))
  roleLine("healers", "healer", 5, point(-19, -135), point(-19, -207))
end

local function phaseOneCorrect()
  boss()
  unit("main-tank", "Main Tank", "tank", NORTH, math.pi)
  unit("off-tank", "Off Tank", "tank", point(19, -180), math.pi)
  safeFlanks()
end

local function phaseOneWrong()
  boss(ONYXIA, math.pi)
  unit("main-tank", "Main Tank", "tank", point(-34, -171), 0)
  unit("off-tank", "Off Tank", "tank", point(-22, -167), 0)
  roleArc("raid-stack", "melee", 8, ONYXIA, 12, -0.55, 0.55)
  roleArc("ranged-stack", "ranged", 9, point(-36, -171), 15, -0.45, 0.45)
  roleLine("healers", "healer", 5, point(-44, -163), point(-44, -179))
end

local function spreadAirRaid(bossAt, bossFacing, bossId)
  if bossId then
    unit(bossId, "Onyxia", "boss", bossAt, bossFacing, 10184)
  else
    boss(bossAt or point(-5, -171), bossFacing or math.pi / 2)
  end
  unit("air-drake", "Air-phase Drake", "add", point(-52, -171), 0)
  roleLine("melee-whelps-left", "melee", 4, point(-48, -136), point(-66, -137))
  roleLine("melee-whelps-right", "melee", 4, point(-48, -206), point(-66, -205))
  roleLine("ranged-north", "ranged", 6, point(11, -133), point(11, -209))
  roleLine("ranged-south", "ranged", 4, point(-38, -145), point(-38, -197))
  roleLine("healers-air", "healer", 5, point(-13, -132), point(-13, -210))
  unit("add-tank-left", "Whelp Tank", "tank", point(-54, -132), -math.pi / 2)
  unit("add-tank-right", "Whelp Tank", "tank", point(-54, -210), math.pi / 2)
end

local function stackedAirRaid(bossAt, bossFacing, bossId)
  if bossId then
    unit(bossId, "Onyxia", "boss", bossAt, bossFacing, 10184)
  else
    boss(bossAt or point(-5, -171), bossFacing or math.pi / 2)
  end
  unit("air-drake", "Air-phase Drake", "add", point(-24, -171), 0)
  roleArc("raid-stack", "ranged", 12, point(-11, -171), 10, 0, math.pi * 2)
  roleArc("melee-stack", "melee", 8, point(-27, -171), 8, 0, math.pi * 2)
  roleLine("healers-stack", "healer", 5, point(-16, -166), point(-16, -176))
  unit("lonely-tank", "Whelp Tank", "tank", point(-59, -131), -math.pi / 2)
end

local function hatchers()
  unit("hatcher-left", "Onyxian Hatcher", "add", point(-76, -145), 0, 11262)
  unit("hatcher-right", "Onyxian Hatcher", "add", point(-76, -198), 0, 11262)
end

local function landingCorrect()
  boss(point(-4, -171), 0)
  unit("main-tank", "Main Tank", "tank", point(26, -171), math.pi)
  unit("hatcher-tank", "Hatcher Tank", "tank", point(-72, -171), 0)
  hatchers()
  roleLine("melee-boss", "melee", 6, point(-8, -145), point(-31, -145))
  roleLine("ranged-boss", "ranged", 6, point(-5, -204), point(-38, -207))
  roleLine("add-team", "melee", 4, point(-66, -153), point(-66, -190))
  roleLine("healers", "healer", 5, point(-29, -135), point(-29, -207))
end

local function landingWrong()
  boss(point(-20, -171), math.pi)
  unit("main-tank", "Main Tank", "tank", point(-37, -171), 0)
  hatchers()
  roleArc("raid-tail", "melee", 10, point(-12, -171), 13, -0.4, 0.4)
  roleArc("raid-front", "ranged", 10, point(-30, -171), 16, math.pi - 0.4, math.pi + 0.4)
  roleLine("healers", "healer", 5, point(-44, -163), point(-44, -179))
end

local function renderEntrance()
  boss()
  local counts = {tank = 2, melee = 10, ranged = 9, healer = 8}
  for _, role in ipairs({"tank", "melee", "ranged", "healer"}) do
    for index = 1, counts[role] do
      unit(string.format("%s-%02d", role, index), string.format("%s %d", role:sub(1, 1):upper() .. role:sub(2), index), role, ENTRANCE)
    end
  end
  mapText("entrance-label", "REAL PULL · SCRUB THE TIMELINE", point(-90, -171), GOLD)
end

local function renderBriefing(correct)
  if correct then
    phaseOneCorrect()
    mapText("briefing-north", "NORTH WALL", point(37, -171), GOLD)
    circle("briefing-left", point(-20, -146), 17, GREEN)
    circle("briefing-right", point(-20, -197), 17, GREEN)
    arrow("briefing-centre", ENTRANCE, NORTH, WHITE)
    mapText("briefing-lane", "KEEP THIS LANE CLEAR", point(-43, -171), WHITE)
  else
    phaseOneWrong()
    circle("briefing-bad-stack", point(-30, -171), 22, RED)
    mapText("briefing-bad-text", "NO GROUP ASSIGNMENTS", point(-51, -171), RED)
  end
end

local function renderPhaseOne(correct)
  if correct then
    phaseOneCorrect()
    cone("p1-front", ONYXIA, 43, 0, 65, RED)
    cone("p1-tail", ONYXIA, 38, math.pi, 55, RED)
    circle("p1-left", point(-19, -146), 16, GREEN)
    circle("p1-right", point(-19, -197), 16, GREEN)
    mapText("p1-tank", "TANK", point(34, -171), GOLD)
  else
    phaseOneWrong()
    cone("p1-wrong-breath", ONYXIA, 48, math.pi, 75, RED)
    cone("p1-wrong-tail", ONYXIA, 42, 0, 65, RED)
    circle("p1-wrong-stack", point(-34, -171), 21, RED)
    mapText("p1-wrong-text", "TAIL + BREATH OVERLAP", point(-55, -171), RED)
  end
end

local function renderAir(correct)
  if correct then
    spreadAirRaid()
    circle("p2-left-pit", LEFT_PIT, 12, ORANGE)
    circle("p2-right-pit", RIGHT_PIT, 12, ORANGE)
    arrow("p2-left-arrow", LEFT_PIT, point(-51, -141), GREEN)
    arrow("p2-right-arrow", RIGHT_PIT, point(-51, -202), GREEN)
    mapText("p2-spread", "SPREAD FOR FIREBALLS", point(15, -171), BLUE)
    rectangle("p2-centre", point(24, -181), point(-61, -161), WHITE)
  else
    stackedAirRaid()
    circle("p2-bad-stack", point(-16, -171), 19, RED)
    circle("p2-open-pit", RIGHT_PIT, 14, RED)
    arrow("p2-bad-line", RIGHT_PIT, point(-19, -171), RED)
    mapText("p2-bad-text", "UNCONTROLLED WHELPS", point(-48, -191), RED)
  end
end

local function renderBreath(correct)
  if correct then
    spreadAirRaid(point(-19, -118), -math.pi / 2, "breath-onyxia")
  else
    stackedAirRaid(point(-19, -118), -math.pi / 2, "breath-onyxia")
  end
  rectangle("breath-lane", point(-4, -126), point(-40, -218), RED)

  if correct then
    arrow("breath-left-exit", point(-18, -157), point(-18, -136), GREEN)
    arrow("breath-right-exit", point(-19, -186), point(-19, -207), GREEN)
    mapText("breath-label", "CROSS THE EDGE", point(-44, -171), GREEN)
  else
    arrow("breath-run", point(-18, -153), point(-36, -194), RED)
    circle("breath-stack", point(-17, -171), 17, RED)
    mapText("breath-label", "RUNNING WITH THE BREATH", point(-47, -191), RED)
  end
end

local function renderLanding(correct)
  if correct then
    landingCorrect()
    circle("p3-boss-zone", point(-10, -171), 38, GREEN)
    circle("p3-add-zone", point(-73, -171), 24, ORANGE)
    circle("p3-rain-left", point(-76, -145), 10, RED)
    circle("p3-rain-right", point(-76, -198), 10, RED)
    arrow("p3-separator", point(-52, -128), point(-52, -216), WHITE)
    mapText("p3-add-label", "ADD CONTROL", point(-84, -171), ORANGE)
  else
    landingWrong()
    cone("p3-bad-front", point(-20, -171), 45, math.pi, 75, RED)
    cone("p3-bad-tail", point(-20, -171), 40, 0, 65, RED)
    circle("p3-adds-loose", point(-75, -171), 28, RED)
    mapText("p3-bad-label", "BOSS + ADDS + RAID", point(-52, -171), RED)
  end
end

local root = CreateFrame("Frame", "guide-panel", UIParent)
root:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 24, -24)
root:SetSize(430, 360)
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
callout:SetPoint("TOPLEFT", root, "TOPLEFT", 22, -210)
callout:SetSize(386, 42)
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

local correctButton = CreateFrame("Button", "guide-correct", root)
correctButton:SetPoint("BOTTOM", root, "BOTTOM", -70, 70)
correctButton:SetSize(128, 34)
correctButton:SetText("Correct")
correctButton:SetBorderColor(1, 1, 1, 0.18)

local incorrectButton = CreateFrame("Button", "guide-incorrect", root)
incorrectButton:SetPoint("BOTTOM", root, "BOTTOM", 70, 70)
incorrectButton:SetSize(128, 34)
incorrectButton:SetText("Incorrect")
incorrectButton:SetBorderColor(1, 1, 1, 0.18)

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
  correctButton:SetBackgroundColor(showingCorrect and 0.08 or 0.08, showingCorrect and 0.32 or 0.09, showingCorrect and 0.17 or 0.11, 0.96)
  correctButton:SetColor(showingCorrect and 0.74 or 0.56, showingCorrect and 1.00 or 0.60, showingCorrect and 0.82 or 0.58, 1)
  incorrectButton:SetBackgroundColor(showingCorrect and 0.09 or 0.34, showingCorrect and 0.09 or 0.07, showingCorrect and 0.11 or 0.08, 0.96)
  incorrectButton:SetColor(showingCorrect and 0.64 or 1.00, showingCorrect and 0.58 or 0.72, showingCorrect and 0.58 or 0.72, 1)

  if chapter.id == "entrance" then renderEntrance()
  elseif chapter.id == "briefing" then renderBriefing(showingCorrect)
  elseif chapter.id == "phase-one" then renderPhaseOne(showingCorrect)
  elseif chapter.id == "air-phase" then renderAir(showingCorrect)
  elseif chapter.id == "deep-breath" then renderBreath(showingCorrect)
  else renderLanding(showingCorrect) end

  local cameraX, cameraY = mapPoint(ARENA_CENTRE)
  Map:SetCamera(cameraX, cameraY, chapter.id == "deep-breath" and 1.85 or 1.65)
  callout:SetAlpha(1)
  C_Timer.After(0.6, function() callout:SetAlpha(0.78) end)
end

previous:SetScript("OnClick", function()
  if chapterIndex > 1 then
    chapterIndex = chapterIndex - 1
    render()
  end
end)

nextButton:SetScript("OnClick", function()
  if chapterIndex < #chapters then
    chapterIndex = chapterIndex + 1
    render()
  end
end)

correctButton:SetScript("OnClick", function()
  if not showingCorrect then
    showingCorrect = true
    render()
  end
end)

incorrectButton:SetScript("OnClick", function()
  if showingCorrect then
    showingCorrect = false
    render()
  end
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
