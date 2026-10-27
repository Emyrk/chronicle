# Lua panel API reference

Lua panels are small programs that turn a raid log into your own panel on the instance page. They run in a sandboxed browser worker (Lua 5.3 via Fengari) with no network, file or page access. Chronicle replays the log's events into your code, and your code draws the panel with a small WoW-style UI API.

## Quick start

A panel is two files: `project.json` (what the panel needs) and `main.lua` (what it does). This panel shows total damage for the selected encounters:

```lua
local damage = require("chronicle.v1.events.damage")
local label = CreateFrame("FontString", "total", UIParent)
label:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 12, -12)
label:SetFontSize(20)

local total = 0
damage.onEvent(function(event)
  total = total + event.amount   -- only update plain Lua values per event
end)
damage.onComplete(function()
  label:SetText("Total damage: " .. total)   -- draw once at the end
end)
```

with `"streams": ["damage"]` in `project.json`. Use **Preview** in the workshop to run it on a real instance before you save and publish.

## How a panel runs

1. **Startup.** `main.lua` runs once. Create frames and register callbacks here.
2. **Replay.** Chronicle sends every event in scope, in log order, encounter by encounter, to your `onEvent` callback.
3. **Complete.** Your `onComplete` callback runs once after the last event. Draw your results here. Panels without a stream never get this callback.
4. **Clicks.** If the panel declares `input`, `OnClick` handlers run whenever a viewer clicks.

When the viewer changes the encounter selection, the panel starts again from step 1 with a fresh Lua state. Nothing persists between runs.

## project.json

```json
{
  "manifest_version": 1,
  "kind": "panel",
  "name": "Interrupt Tracker",
  "slug": "interrupt-tracker",
  "entrypoint": "main.lua",
  "capabilities": ["ui"],
  "streams": ["damage"],
  "stream_scope": "selection",
  "max_events": 2000000,
  "assets": []
}
```

| Field | Required | Values |
| --- | --- | --- |
| `manifest_version`, `kind`, `name`, `slug` | yes | Must match the project; set for you. |
| `entrypoint` | yes | The Lua file that runs first (`main.lua` in the browser editor). |
| `capabilities` | yes | `"ui"` to draw; add `"input"` to handle clicks. |
| `streams` | yes | `[]` or `["damage"]`. Declare `damage` to receive damage events. |
| `stream_scope` | no | `"selection"` (default): only the encounters the viewer selected. `"instance"`: every encounter in the log, each tagged with `selected`. |
| `max_events` | no | A positive integer. The panel stops with an error after this many events. Omit it to receive everything. |
| `assets` | no | Image files (PNG, JPEG, WebP, up to 2 MiB each) for `SetTexture`. Uploaded packages only; the browser editor is asset-free. |

## Events

```lua
local damage = require("chronicle.v1.events.damage")
damage.onEvent(function(event) ... end)
damage.onComplete(function() ... end)
```

`Panel:OnEvent("damage", fn)` and `Panel:OnComplete(fn)` are the same hooks without the module. Registering again replaces the previous callback.

Each damage event is a table:

| Field | Type | Meaning |
| --- | --- | --- |
| `source` | string | GUID of the unit that dealt the damage (empty if unknown). |
| `target` | string | GUID of the unit that took it. |
| `amount` | integer | Damage amount. |
| `offsetMs` | integer | Milliseconds since the start of its encounter. |
| `encounterId` | string | The encounter this event belongs to. |
| `selected` | boolean | Whether the viewer selected that encounter. Always `true` with `stream_scope: "selection"`. |

`damage.bySource(onUpdate)` keeps running totals per source and calls `onUpdate(source, total)` on every event. It returns the totals table, which you can read in `onComplete`.

Only the `damage` stream exists today.

## Units

Event `source` and `target` are GUIDs. Look them up with `Chronicle`:

```lua
local unit = Chronicle.GetUnit(guid)   -- table or nil
local players = Chronicle.GetPlayers() -- array of player GUIDs, sorted by name
```

| Field | Present for | Meaning |
| --- | --- | --- |
| `guid` | all | The GUID you asked for. |
| `name` | all | Display name. |
| `player` | all | `true` for player characters. |
| `class` | players | Upper-case token: `"WARRIOR"`, `"MAGE"`, `"PRIEST"`, … |
| `race` | players | Upper-case token: `"ORC"`, `"HUMAN"`, … |
| `level` | players | Character level. |
| `owner` | pets and summons | GUID of the player who controls it. |
| `entry` | NPCs, pets and summons | Creature entry ID. |

Lookups return a new table each call, so cache what you need in a Lua table instead of calling `GetUnit` for every event. Talents and gear are not available yet.

## Drawing

### Creating objects

```lua
local frame = CreateFrame("Frame", "my-frame", UIParent)
local text = frame:CreateFontString("my-label")
local image = frame:CreateTexture("my-icon")
local button = CreateFrame("Button", "my-button", UIParent)
```

`CreateFrame(type, id, parent)` accepts `"Frame"`, `"FontString"`, `"Texture"` and `"Button"`. `id` must be unique within the panel; omit it to get a generated one. `parent` defaults to `UIParent`, the panel's root. Objects persist until you call `:Destroy()`, so create them once and update them, rather than creating new ones each time.

### Methods

| Method | Works on | Notes |
| --- | --- | --- |
| `SetPoint(point, relativeTo, relativePoint, x, y)` | all | Anchors the object inside its **parent** at `point` (`"TOPLEFT"`, `"TOP"`, `"TOPRIGHT"`, `"LEFT"`, `"CENTER"`, `"RIGHT"`, `"BOTTOMLEFT"`, `"BOTTOM"`, `"BOTTOMRIGHT"`), offset by `x`, `y` pixels. Negative `y` moves down. `relativeTo` and `relativePoint` are accepted for WoW compatibility but ignored. |
| `SetSize(w, h)`, `SetWidth(w)`, `SetHeight(h)` | all | Pixels. |
| `SetText(s)` | FontString, Button | Up to 4 KiB. |
| `SetFontSize(n)` | FontString | Pixels; default 14. |
| `SetColor(r, g, b, a)` | Frame, FontString, Button | Text or foreground colour, components 0–1, `a` optional. |
| `SetBackgroundColor(r, g, b, a)` | Frame, FontString, Button | |
| `SetBorderColor(r, g, b, a)` | all | |
| `SetTexture(path)` | Texture | A file listed in `assets`. |
| `SetAlpha(a)` | all | 0–1. |
| `SetLayer(layer)` | all | `"BACKGROUND"`, `"ARTWORK"`, `"OVERLAY"`, or a number. |
| `Show()`, `Hide()`, `IsShown()` | all | |
| `SetParent(frame)` | all | |
| `Destroy()` | all except UIParent | Removes the object and its click handler. |
| `SetScript("OnClick", fn)` | Button, Frame | Needs the `input` capability. `fn(self)` runs on click. |

## Built-in modules

Load with `require`. The `chronicle` module names are reserved; you cannot ship your own files under them.

- **`chronicle.v1.events.damage`**: `onEvent(fn)`, `onComplete(fn)`, `bySource(onUpdate)`. See [Events](#events).
- **`chronicle.v1.ui`**: quick widgets.
  - `metric(parent, id, label, value, x, y)` draws a label and a large value. It returns `{ frame, set(v) }`.
  - `table(parent, id, rows, x, y)` draws up to 50 `{label, value}` rows as text.
  - `bars(parent, id, rows, x, y)` draws up to 50 `{label, value}` rows as bars. The bar width is `value` pixels, capped at 310, so scale your values first.
  - `table` and `bars` return the frame; destroy it and create it again to refresh.

Your own files can be loaded with `require("helpers")` (for `helpers.lua`) when they are in the package.

## Standard library

Available: the base library (`pairs`, `ipairs`, `tostring`, `tonumber`, `type`, `pcall`, `error`, `assert`, `select`, `setmetatable`, …), `string`, `table`, `math` and `utf8`. Not available: `io`, `os`, `debug`, `coroutine`, `load`, `loadfile`, `dofile` and `collectgarbage`.

Whole numbers arrive as Lua integers, so `tostring(event.amount)` prints `42`, not `42.0`. Division with `/` always returns a float; use `//` or `math.floor` for whole results.

## Limits

These protect viewers' browsers from runaway panels. There is no limit on how many events a panel receives unless you set `max_events`.

| Limit | Value | Error |
| --- | --- | --- |
| Startup work | 250,000 Lua instructions | `instruction budget exceeded` |
| Work per callback (each `onEvent`, `onComplete` or click) | 100,000 Lua instructions | `instruction budget exceeded` |
| Objects alive at once | 2,000 | `object limit exceeded` |
| Pending UI changes | 2,000 per startup, per `onComplete`, per click, and per 100 events | `operation limit exceeded` |
| String length | 4 KiB | `… exceeds string limit` |
| No progress | 10 seconds without finishing an event batch | `Panel worker made no progress for 10 seconds` |
| `main.lua` in the browser editor | 64 KiB | shown in the editor |
| Uploaded package | 8 MiB tar, 1 MiB of Lua, 128 files | shown on upload |

## Performance

The footer under every Lua panel shows events processed, events per second and the replay time, like the built-in panels. Hover the `?` for the full breakdown: your `onEvent` time, decoding, UI updates, `onComplete`, startup, transfer and drawing.

- **Aggregate in `onEvent`, draw in `onComplete`.** Calling UI methods for every event is slow and can hit the UI change limit.
- **Keep `onEvent` small.** Each call has a fixed cost of a few microseconds; most panels spend their time there.
- **Cache unit lookups** in a Lua table keyed by GUID.
- **Prefer `stream_scope: "selection"`.** Unselected encounters are then skipped without being read. Use `"instance"` only when you need the whole log.

## Publishing

1. **Save draft** keeps a private copy. Nothing runs for anyone else.
2. **Publish unstable** makes that draft available to test in instance layouts. It appears in the panel selector only for you, but anyone with the link can load it.
3. **Promote to stable** on the Releases page, after testing that exact unstable release.

The workshop header shows whether your working copy is unsaved, saved, or published. Ctrl/⌘+S saves from anywhere on the page.

## FAQ

**Why are names GUIDs like `0x0000000000012345`?**
Event `source` and `target` are GUIDs. Use `Chronicle.GetUnit(guid).name`.

**How do I credit pet damage to the owner?**
If `GetUnit(guid)` is not a player but has `owner`, look up the owner instead. See the example below.

**How do I colour by class?**
Read `unit.class` and map it to a colour; the example below includes the standard class colours.

**My panel shows nothing.**
Make sure `project.json` lists `"damage"` in `streams`. Make sure you draw in `onComplete`, or update frames in `onEvent`. Then run **Startup check** in the editor to catch Lua errors.

**"Lua panel stopped: instruction budget exceeded".**
One callback did too much work, for example sorting a large table inside `onEvent`. Move heavy work to `onComplete`, and keep each callback under 100,000 instructions.

**"Lua panel stopped: operation limit exceeded".**
More than 2,000 UI changes happened in one startup, callback or 100-event batch. Draw in `onComplete` instead of on every event, and reuse frames.

**"panel exceeded its max_events".**
Your `project.json` sets `max_events` lower than the events in scope. Raise or remove it.

**Can I compare the selected fight with the rest of the raid?**
Yes. Set `"stream_scope": "instance"` and use `event.selected` to tell the two apart.

**Can I use talents, gear, healing, casts or auras?**
Not yet. Only the damage stream and the unit facts above are available.

**Can my panel load data from the internet or remember things between views?**
No. Panels have no network or storage access, and every run starts fresh.

**Does my panel run on Chronicle's servers?**
No. It runs only in the viewer's browser, in a sandboxed worker.

## Example: damage by player, with pets and class colours

```lua example
local damage = require("chronicle.v1.events.damage")

local CLASS_COLORS = {
  WARRIOR = { 0.78, 0.61, 0.43 }, PALADIN = { 0.96, 0.55, 0.73 }, HUNTER = { 0.67, 0.83, 0.45 },
  ROGUE = { 1.00, 0.96, 0.41 }, PRIEST = { 1.00, 1.00, 1.00 }, SHAMAN = { 0.00, 0.44, 0.87 },
  MAGE = { 0.41, 0.80, 0.94 }, WARLOCK = { 0.58, 0.51, 0.79 }, DRUID = { 1.00, 0.49, 0.04 },
}

-- Resolve a GUID to the player who should get credit (pets count for their owner). Cached per GUID.
local creditCache = {}
local function creditFor(guid)
  local cached = creditCache[guid]
  if cached == nil then
    local unit = Chronicle.GetUnit(guid)
    if unit and not unit.player and unit.owner then unit = Chronicle.GetUnit(unit.owner) end
    cached = (unit and unit.player) and unit or false
    creditCache[guid] = cached
  end
  return cached or nil
end

local totals = {}
damage.onEvent(function(event)
  local player = creditFor(event.source)
  if player then totals[player.guid] = (totals[player.guid] or 0) + event.amount end
end)

damage.onComplete(function()
  local rows = {}
  for guid, amount in pairs(totals) do rows[#rows + 1] = { unit = Chronicle.GetUnit(guid), amount = amount } end
  table.sort(rows, function(a, b) return a.amount > b.amount end)
  local top = rows[1] and rows[1].amount or 1
  for i = 1, math.min(#rows, 25) do
    local row = rows[i]
    local color = CLASS_COLORS[row.unit.class] or { 0.6, 0.6, 0.6 }
    local bar = CreateFrame("Frame", "bar-" .. i, UIParent)
    bar:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 8, -8 - (i - 1) * 22)
    bar:SetSize(math.max(1, 300 * row.amount // top), 20)
    bar:SetBackgroundColor(color[1], color[2], color[3], 0.85)
    local label = bar:CreateFontString("bar-label-" .. i)
    label:SetPoint("LEFT", bar, "LEFT", 4, 0)
    label:SetFontSize(12)
    label:SetColor(0, 0, 0)
    label:SetText(row.unit.name .. "  " .. row.amount)
  end
end)
```
