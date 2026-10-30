# Module API reference

Chronicle modules are small Lua programs that extend Chronicle. This reference covers **instance panel** modules, which turn a raid log into your own panel on the instance page; guide, guild and armory modules will follow the same model. Modules run in a sandboxed browser worker (Lua 5.3 via Fengari) with no network, file or page access. Chronicle replays the log's events into your code, and your code draws the panel with a small WoW-style UI API.

> **Note:** Chronicle modules run on Chronicle in your browser, not in the game client: they do not go in your `Interface/AddOns` folder.

## Quick start

An instance panel module is two files: `project.json` (what the panel needs) and `main.lua` (what it does). This panel shows total damage for the selected encounters:

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

with `"streams": ["damage"]` in `project.json`. Use **Preview** in the Module Workshop to run it on a real instance before you save and publish.

## How a module runs

1. **Startup.** `main.lua` runs once. Create frames and register callbacks here.
2. **Replay.** Chronicle sends every event in scope from every stream you declared, in log order, encounter by encounter, to your `onEvent` callbacks.
3. **Complete.** Your `onComplete` callback runs once after the last event. Draw your results here. Modules without a stream never get this callback.
4. **Clicks.** If the module declares `input`, `OnClick` handlers run whenever a viewer clicks.

When the viewer changes the encounter selection, the module starts again from step 1 with a fresh Lua state. Nothing persists between runs.

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
  "assets": [],
  "icon": "swords"
}
```

| Field | Required | Values |
| --- | --- | --- |
| `manifest_version`, `kind`, `name`, `slug` | yes | Must match the project; set for you. |
| `entrypoint` | yes | The Lua file that runs first (`main.lua` in the browser editor). |
| `capabilities` | yes | `"ui"` to draw; add `"input"` to handle clicks. |
| `streams` | yes | The event streams to receive, e.g. `["damage", "heal", "aura"]`. Any of the streams in [Streams and fields](#streams-and-fields); `[]` for none. Each stream is a separate download, so declare only what you use. |
| `stream_scope` | no | `"selection"` (default): only the encounters the viewer selected. `"instance"`: every encounter in the log, each tagged with `selected`. |
| `max_events` | no | A positive integer. The module stops with an error after this many events. Omit it to receive everything. |
| `assets` | no | Image files (PNG, JPEG, WebP, up to 2 MiB each) for `SetTexture`. Uploaded packages only; the browser editor is asset-free. |
| `icon` | no | The icon shown next to the module in the panel selector and on its page. One of the [icon names](#icons) below; omit it for the generic module icon. |

### Icons

`icon` takes one of these names (each is a [Lucide](https://lucide.dev/icons) icon). Each release keeps the icon it was published with.

`activity`, `anchor`, `axe`, `backpack`, `banknote`, `bell`, `blocks`, `book-open`, `bomb`, `bot`, `brain`, `chart-bar`, `chart-column`, `chart-line`, `chart-pie`, `chart-scatter`, `clock`, `cloud`, `compass`, `crosshair`, `crown`, `droplet`, `eye`, `feather`, `flag`, `flame`, `flask-conical`, `footprints`, `gauge`, `gem`, `ghost`, `hammer`, `heart`, `heart-pulse`, `hourglass`, `info`, `leaf`, `list`, `list-ordered`, `map`, `map-pin`, `medal`, `moon`, `mountain`, `radar`, `repeat`, `route`, `ruler`, `scroll-text`, `shield`, `shield-alert`, `shield-check`, `skull`, `snowflake`, `sparkles`, `star`, `sun`, `sword`, `swords`, `table`, `target`, `tent`, `timer`, `trophy`, `trending-up`, `users`, `wand`, `wand-sparkles`, `wind`, `zap`

A package may also include a `README.md` at its root (Markdown, up to 64 KiB). The module's page shows it, like a repository README; edit it in the Workshop's **README.md** tab. It is never run, and its images load only from the package's own files.

## Events

Subscribe per stream, or to every declared stream at once:

```lua
-- One stream
local heal = require("chronicle.v1.events.heal")
heal.onEvent(function(event) ... end)
Panel:OnEvent("aura", function(event) ... end)   -- the same hook without the module

-- Every declared stream; event.stream says which
local events = require("chronicle.v1.events")
events.onEvent(function(event)
  if event.stream == "slain" then ... end
end)

events.onComplete(function() ... end)   -- or Panel:OnComplete(fn); once, after the last event
```

Every stream has a `chronicle.v1.events.<stream>` module with `onEvent(fn)` and `onComplete(fn)`. `Panel:OnEvent(fn)` without a stream name is the catch-all. When both a stream callback and the catch-all are registered, each event goes to the stream callback first, then the catch-all, with the same table. Registering again replaces the previous callback. Subscribing to a stream that `project.json` does not declare is an error.

Events from all declared streams arrive interleaved in log order, so a `slain` event comes after the `damage` that caused it.

### Common fields

Every event table has:

| Field | Type | Meaning |
| --- | --- | --- |
| `stream` | string | The stream, e.g. `"damage"`. |
| `offsetMs` | integer | Milliseconds since the start of its encounter. |
| `encounterId` | string | The encounter this event belongs to. |
| `selected` | boolean | Whether the viewer selected that encounter. Always `true` with `stream_scope: "selection"`. |

### Streams and fields

Each stream adds its own fields, taken straight from Chronicle's decoded combat log. Unit fields (`source`, `target`, `unit`, `guid`, `owner`, …) are GUIDs; look them up with `Chronicle.GetUnit`. The acting unit is always `source`. Missing values are `nil`. Numeric codes (`hitType`, `schools`, `action`, `application`, `state`, `transition`, `dispelType`, …) are Chronicle's combat-log enum values. Nested values are tables, and lists are Lua arrays starting at 1.

| Stream | Fields |
| --- | --- |
| `damage` | `source`, `sourceName`, `target`, `hitType`, `amount`, `schools`, `tailers[] {amount, hitType}`, `spellId`, `spellAttackOutcome`, `overkill` |
| `heal` | `source`, `sourceName`, `target`, `hitType`, `amount`, `schools`, `spellId`, `spellAttackOutcome`, `overheal`, `absorbed` |
| `absorbed` | `attacker`, `target`, `damageSpellId`, `damageSpellName`, `source` (the absorber's caster), `absorbSpellId`, `absorbSpellName`, `absorbSchools`, `amount`, `estimated` |
| `resource_change` | `source`, `sourceName`, `target`, `amount`, `resourceType`, `direction`, `spellId`, `spellAttackOutcome`, `overResource` |
| `extra_attack` | `target`, `amount`, `sourceName`, `spellId`, `spellAttackOutcome` |
| `slain` | `target`, `source`, `attribution {source, sourceName, hitType, amount, schools, spellId, spellAttackOutcome}` (the killing blow) |
| `ressurection` | `source`, `target`, `spell {id, name}` |
| `cast` | `source`, `action`, `target`, `spell {name, id, rank}` |
| `spell_start` | `source`, `target`, `spell {id, name, attackOutcome}`, `itemId`, `castFlags`, `castTimeMilli`, `channelTimeMilli`, `spellType` |
| `spell_go` | `source`, `target`, `spell {id, name, attackOutcome}`, `numHits`, `numMisses`, `itemId`, `corpseOwner` |
| `spell_fail` | `source`, `spell {id, name, attackOutcome}`, `failedByServer` |
| `aura` | `target`, `source`, `spellName`, `spellId`, `spellAttackOutcome`, `amount`, `application`, `state`, `transition`, `isBuff` |
| `aura_cast` | `source`, `target`, `spell {id, name, attackOutcome}`, `effect`, `amplitude`, `effectMiscValue`, `durationMS`, `capStatus`, `effectAuraName` |
| `dispel` | `source`, `target`, `spellId`, `spellName`, `spellAttackOutcome`, `dispelType` |
| `interrupt` | `source`, `target`, `spellName`, `extraSpellId`, `extraSchools` |
| `unit_classification` | `target`, `unitType`, `affiliation`, `owner`, `controller`, `spellId` |
| `unit_position` | `unit`, `x`, `y`, `z`, `mapId`, `floor`, `facing` |
| `unit_resources` | `unit`, `currentHealth`, `maximumHealth`, `absorb`, `powerType`, `currentPower`, `maximumPower`, `attackPower`, `spellPower`, `armor`, `unitLevel`, `averageItemLevel` |
| `combatant_info` | `guid`, `name`, `heroClass`, `race`, `gender`, `guildName`, `gear[] {itemId, enchantId, temporaryEnchantId, gemEnchantIds, itemLevel, bonusIds, gems[] {itemId, itemLevel}}`, `talents {summary, trees}`, and `v22` stats on servers that log them |
| `consume` | `consumeId`, `evidenceId`, `player`, `itemId`, `itemName`, `candidateItemIds`, `spell {id, name}`, `kind`, `confidence`, `consumedAtUnixMilli`, `observedAtUnixMilli`, `amount`, `resourceType`, `isProjection` |
| `raid_group` | `groupMemberGuids` (40 slots; empty slots are `""`) |

Gear and talents come from `combatant_info`, not from `Chronicle.GetUnit`.

`require("chronicle.v1.events.damage").bySource(onUpdate)` keeps running damage totals per source and calls `onUpdate(source, total)` on every event. It returns the totals table, which you can read in `onComplete`.

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

Lookups return a new table each call, so cache what you need in a Lua table instead of calling `GetUnit` for every event. Units do not carry talents or gear; read those from the `combatant_info` stream.

## Drawing

### Creating objects

```lua
local frame = CreateFrame("Frame", "my-frame", UIParent)
local text = frame:CreateFontString("my-label")
local image = frame:CreateTexture("my-icon")
local button = CreateFrame("Button", "my-button", UIParent)
```

`CreateFrame(type, id, parent)` accepts `"Frame"`, `"FontString"`, `"Texture"`, `"Button"` and the Chronicle-owned `"PlayerMetricChart"`. `id` must be unique within the module; omit it to get a generated one. `parent` defaults to `UIParent`, the panel's root. Objects persist until you call `:Destroy()`, so create them once and update them, rather than creating new ones each time.

### Panel size and scrolling

`UIParent` fills the panel by default. Anything drawn below or to the right of the panel scrolls rather than being cut off. To size the content yourself, set `UIParent`'s size; the panel scrolls when it is bigger than the space available:

```lua
local ROW = 22
UIParent:SetHeight(40 + #rows * ROW)   -- tall enough for a title and every row
```

`UIParent:SetSize(w, h)`, `SetWidth(w)` and `SetHeight(h)` accept 1–16,384 pixels. `BOTTOM` anchors are measured from the bottom of this content area.

### Methods

| Method | Works on | Notes |
| --- | --- | --- |
| `SetPoint(point, relativeTo, relativePoint, x, y)` | all | Anchors the object inside its **parent** at `point` (`"TOPLEFT"`, `"TOP"`, `"TOPRIGHT"`, `"LEFT"`, `"CENTER"`, `"RIGHT"`, `"BOTTOMLEFT"`, `"BOTTOM"`, `"BOTTOMRIGHT"`), offset by `x`, `y` pixels. Negative `y` moves down. `relativeTo` and `relativePoint` are accepted for WoW compatibility but ignored. |
| `SetSize(w, h)`, `SetWidth(w)`, `SetHeight(h)` | all | Pixels. On `UIParent` this sets the scrollable content size. |
| `SetText(s)` | FontString, Button | Up to 4 KiB. |
| `SetFontSize(n)` | FontString | Pixels; default 14. |
| `SetColor(r, g, b, a)` | Frame, FontString, Button | Text or foreground colour, components 0–1, `a` optional. |
| `SetBackgroundColor(r, g, b, a)` | Frame, FontString, Button | |
| `SetBorderColor(r, g, b, a)` | all | |
| `SetTexture(path)` | Texture | A file listed in `assets`. The path is resolved only from the validated module package. |
| `SetSpell(spellId, tooltip?)` | Texture | Current-dataset spell icon. `tooltip` defaults to `false`; pass `true` for Chronicle's spell tooltip on hover. |
| `SetItem(itemId, tooltip?)` | Texture | Current-dataset item icon. `tooltip` defaults to `false`; pass `true` for Chronicle's item tooltip on hover. |
| `SetIcon(iconName)` | Texture | Named icon from Chronicle's current dataset CDN, for example `"inv_sword_39"`. Only letters, numbers, `_` and `-` are accepted; paths and URLs are rejected. |
| `SetAlpha(a)` | all | 0–1. |
| `SetLayer(layer)` | all | `"BACKGROUND"`, `"ARTWORK"`, `"OVERLAY"`, or a number. |
| `Show()`, `Hide()`, `IsShown()` | all | |
| `SetParent(frame)` | all | |
| `Destroy()` | all except UIParent | Removes the object and its click handler. |
| `SetScript("OnClick", fn)` | Button, Frame | Needs the `input` capability. `fn(self)` runs on click. |

`UIParent` supports only `SetSize`, `SetWidth`, `SetHeight` and `SetScript`.

### Player metric chart

Use Chronicle's standard player meter instead of rebuilding its bars from frames. The host renders the real `PlayerMetricChart`, including class colors and icons. On a live instance page it also inherits Chronicle's inferred specializations and the viewer's enabled character cosmetics; Workshop preview falls back to the row fields supplied by the module.

```lua
local ui = require("chronicle.v1.ui")
local chart = ui.playerMetricChart(UIParent, "damage-chart", {
  type = "damage",
  panelTitle = "Damage Done",
  perSecond = true,
  durationMillis = 60000,
  width = 560,
  height = 420,
})

chart:SetData({
  {
    playerID = "0x0000000000000001",
    playerName = "Jaina",
    className = "MAGE",
    value = 125000,
  },
})
```

Each row requires `playerID`, `playerName`, `className` and a non-negative `value`. It may also include `specialization`, `stackedValue` and `dimmed`. A chart accepts at most 100 rows. `type` is `"damage"`, `"healing"`, `"taken"` or `"mitigation"`. The chart is display-only in Lua v1: modules cannot inject React tooltip or breakout content.

The returned chart also supports `SetChartType`, `SetPerSecond`, `SetDuration`, `SetPanelTitle`, `SetStackedLabel`, `SetValueSuffix`, `SetHideZeroValue`, `SetRowHeight` and `SetData`.

### Lua Language Server definitions

The repository includes `lua-panel-api.d.lua`, a documentation-only [EmmyLua/LuaLS](https://luals.github.io/wiki/annotations/) definition file. Download it from the **LuaLS definitions** button at the top of this page and copy it into your editor workspace for completion, parameter hints and type checking. Chronicle generates the technical reference below from that file so the editor contract and published documentation stay aligned.

<!-- BEGIN GENERATED LUA API REFERENCE -->
<!-- Do not edit this section by hand. Edit lua-panel-api.d.lua and run pnpm generate:lua-api. -->
## Generated Lua API reference

Every global and method below comes from `lua-panel-api.d.lua`, the [EmmyLua/LuaLS](https://luals.github.io/wiki/annotations/) definition file behind the **LuaLS definitions** button. Signatures use LuaLS notation: `name: type`, and a parameter ending in `?` is optional.

### Globals

#### `CreateFrame(frameType: "Frame"|"FontString"|"Texture"|"Button"|"PlayerMetricChart", id?: string, parent?: ChronicleFrame)`

Create a retained UI object. parent defaults to UIParent.

**Returns:** `ChronicleFrame|ChronicleFontString|ChronicleTexture|ChronicleButton|ChroniclePlayerMetricChart` object

### `ChronicleRegion`

#### `ChronicleRegion:SetPoint(point: ChronicleAnchor, relativeTo?: ChronicleRegion, relativePoint?: ChronicleAnchor, x?: number, y?: number)`

Anchor this object within its parent. relativeTo and relativePoint are accepted for WoW compatibility but currently ignored.

#### `ChronicleRegion:SetSize(width: number, height: number)`

Set this object's width and height in pixels.

#### `ChronicleRegion:SetWidth(width: number)`

Set this object's width in pixels.

#### `ChronicleRegion:SetHeight(height: number)`

Set this object's height in pixels.

#### `ChronicleRegion:SetParent(parent: ChronicleFrame)`

Move this object to another frame.

#### `ChronicleRegion:SetAlpha(alpha: number)`

Set opacity from 0 through 1.

#### `ChronicleRegion:SetLayer(layer: ChronicleLayer)`

Set draw order using a named layer or numeric z-index.

#### `ChronicleRegion:SetBorderColor(red: number, green: number, blue: number, alpha?: number)`

Set the border color. Components are numbers from 0 through 1.

#### `ChronicleRegion:Show()`

Show this object.

#### `ChronicleRegion:Hide()`

Hide this object.

#### `ChronicleRegion:IsShown()`

Return whether this object is shown.

**Returns:** `boolean` shown

#### `ChronicleRegion:Destroy()`

Remove this object and its callbacks.

### `ChronicleFrame` extends `ChronicleRegion`

#### `ChronicleFrame:CreateFontString(id?: string)`

Create a text object parented to this frame.

**Returns:** `ChronicleFontString` text

#### `ChronicleFrame:CreateTexture(id?: string)`

Create a texture object parented to this frame.

**Returns:** `ChronicleTexture` texture

#### `ChronicleFrame:SetColor(red: number, green: number, blue: number, alpha?: number)`

Set foreground color. Components are numbers from 0 through 1.

#### `ChronicleFrame:SetBackgroundColor(red: number, green: number, blue: number, alpha?: number)`

Set background color. Components are numbers from 0 through 1.

#### `ChronicleFrame:SetScript(script: "OnClick"|"OnSizeChanged", callback: fun(self:ChronicleFrame,...))`

Register a supported callback. OnClick requires the input capability.

### `ChronicleFontString` extends `ChronicleRegion`

#### `ChronicleFontString:SetText(text: string)`

Set displayed text, up to 4 KiB.

#### `ChronicleFontString:SetFontSize(size: number)`

Set font size in pixels.

#### `ChronicleFontString:SetColor(red: number, green: number, blue: number, alpha?: number)`

Set text color. Components are numbers from 0 through 1.

### `ChronicleTexture` extends `ChronicleRegion`

#### `ChronicleTexture:SetTexture(path: string)`

Render an image declared in project.json assets. The path is package-local and never treated as a URL.

#### `ChronicleTexture:SetSpell(spellId: integer, tooltip?: boolean)`

Render the current dataset's icon for a spell ID.

- `tooltip`: Show Chronicle's spell tooltip on hover. Defaults to false.

#### `ChronicleTexture:SetItem(itemId: integer, tooltip?: boolean)`

Render the current dataset's icon for an item ID.

- `tooltip`: Show Chronicle's item tooltip on hover. Defaults to false.

#### `ChronicleTexture:SetIcon(iconName: string)`

Render a named icon from Chronicle's current dataset CDN. Names contain only ASCII letters, numbers, underscores, and hyphens. Paths and URLs are rejected.

- `iconName`: Example: "inv_sword_39".

### `ChroniclePlayerMetricChart` extends `ChronicleRegion`

#### `ChroniclePlayerMetricChart:SetData(data: ChroniclePlayerMetricRow[])`

Replace every row in the chart. At most 100 rows.

#### `ChroniclePlayerMetricChart:SetChartType(chartType: ChroniclePlayerMetricChartType)`

Choose the standard Chronicle player metric presentation.

#### `ChroniclePlayerMetricChart:SetPerSecond(enabled: boolean)`

Display values per second using the configured duration.

#### `ChroniclePlayerMetricChart:SetDuration(durationMillis: number)`

Set the duration used for per-second conversion, in milliseconds.

#### `ChroniclePlayerMetricChart:SetPanelTitle(title: string)`

Set the title used by Chronicle-owned chart surfaces.

#### `ChroniclePlayerMetricChart:SetStackedLabel(label: string)`

Set the label for stacked secondary values.

#### `ChroniclePlayerMetricChart:SetValueSuffix(suffix: string)`

Override the value suffix.

#### `ChroniclePlayerMetricChart:SetHideZeroValue(hidden: boolean)`

Hide primary value badges whose value is zero.

#### `ChroniclePlayerMetricChart:SetRowHeight(height: number)`

Set row height in pixels, from 12 through 128.

### `ChronicleButton` extends `ChronicleFrame`

#### `ChronicleButton:SetText(text: string)`

Set the button label.

<!-- END GENERATED LUA API REFERENCE -->

## Built-in modules

Load with `require`. The `chronicle` module names are reserved; you cannot ship your own files under them.

- **`chronicle.v1.events`**: `onEvent(fn)` for every declared stream, `onComplete(fn)`. See [Events](#events).
- **`chronicle.v1.events.<stream>`**: `onEvent(fn)`, `onComplete(fn)` for one stream, e.g. `chronicle.v1.events.aura`. The `damage` module also has `bySource(onUpdate)`.
- **`chronicle.v1.ui`**: host-owned widgets.
  - `metric(parent, id, label, value, x, y)` draws a label and a large value. It returns `{ frame, set(v) }`.
  - `table(parent, id, rows, x, y)` draws up to 50 `{label, value}` rows as text.
  - `bars(parent, id, rows, x, y)` draws up to 50 `{label, value}` rows as bars. The bar width is `value` pixels, capped at 310, so scale your values first.
  - `playerMetricChart(parent, id, options)` renders Chronicle's standard player metric chart and returns the chart object. Call `chart:SetData(rows)` to replace its rows.
  - `table` and `bars` return the frame; destroy it and create it again to refresh.

Your own files can be loaded with `require("helpers")` (for `helpers.lua`) when they are in the package.

## Standard library

Available: the base library (`pairs`, `ipairs`, `tostring`, `tonumber`, `type`, `pcall`, `error`, `assert`, `select`, `setmetatable`, …), `string`, `table`, `math` and `utf8`. Not available: `io`, `os`, `debug`, `coroutine`, `load`, `loadfile`, `dofile` and `collectgarbage`.

Whole numbers arrive as Lua integers, so `tostring(event.amount)` prints `42`, not `42.0`. Division with `/` always returns a float; use `//` or `math.floor` for whole results.

## Limits

These protect viewers' browsers from runaway modules. There is no limit on how many events a module receives unless you set `max_events`.

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

The footer under every module panel shows events processed, events per second and the replay time, like the built-in panels. Hover the `?` for the full breakdown: your `onEvent` time, decoding, UI updates, `onComplete`, startup, transfer and drawing.

- **Aggregate in `onEvent`, draw in `onComplete`.** Calling UI methods for every event is slow and can hit the UI change limit.
- **Keep `onEvent` small.** Each call has a fixed cost of a few microseconds; most modules spend their time there.
- **Cache unit lookups** in a Lua table keyed by GUID.
- **Declare only the streams you use.** Each one is downloaded and decoded; `unit_position` and `unit_resources` are large.
- **Prefer `stream_scope: "selection"`.** Unselected encounters are then skipped without being read. Use `"instance"` only when you need the whole log.

## Publishing

A module has one **main** and a few **releases**.

1. **Save to main** stores your changes. Anyone who can view the module can choose main in the panel selector to try unreleased changes; everyone else keeps the latest release.
2. **Tag release** snapshots main under a tag you choose, such as `v1.2` (letters, digits, `.`, `-` and `_`, up to 32 characters; not `main`). Panels run the newest release, so tagging is how changes reach everyone.
3. Only the newest three releases keep their files. Older releases stay listed on the module's page as "no longer available", and panels never fall back to them.

The Module Workshop header shows whether your working copy is unsaved, saved to main, or released. Ctrl/⌘+S saves from anywhere on the page.

## FAQ

**Why are names GUIDs like `0x0000000000012345`?**
Event `source` and `target` are GUIDs. Use `Chronicle.GetUnit(guid).name`.

**How do I credit pet damage to the owner?**
If `GetUnit(guid)` is not a player but has `owner`, look up the owner instead. See the example below.

**How do I colour by class?**
Read `unit.class` and map it to a colour; the example below includes the standard class colours.

**My module shows nothing.**
Make sure `project.json` lists every stream you subscribe to in `streams`. Make sure you draw in `onComplete`, or update frames in `onEvent`. Then run **Startup check** in the editor to catch Lua errors.

**My panel is cut off.**
Content past the panel's edge scrolls. Set `UIParent:SetHeight(...)` to the height your rows need so the panel scrolls to all of it. See [Panel size and scrolling](#panel-size-and-scrolling).

**What happens when my module stops?**
Chronicle shows what went wrong, where (file, line, and whether it was startup, `onEvent`, `onComplete` or a click), and how to fix it. In the workshop, **Ask the assistant to fix it** sends that explanation to the assistant.

**"Module stopped: instruction budget exceeded".**
One callback did too much work, for example sorting a large table inside `onEvent`. Move heavy work to `onComplete`, and keep each callback under 100,000 instructions.

**"Module stopped: operation limit exceeded".**
More than 2,000 UI changes happened in one startup, callback or 100-event batch. Draw in `onComplete` instead of on every event, and reuse frames.

**"panel exceeded its max_events".**
Your `project.json` sets `max_events` lower than the events in scope. Raise or remove it.

**Can I compare the selected fight with the rest of the raid?**
Yes. Set `"stream_scope": "instance"` and use `event.selected` to tell the two apart.

**Can I use talents, gear, healing, casts or auras?**
Yes. Healing, casts and auras are streams; see [Streams and fields](#streams-and-fields). Gear and talents come from the `combatant_info` stream.

**Can my module load data from the internet or remember things between views?**
No. Modules have no network or storage access, and every run starts fresh.

**Does my module run on Chronicle's servers, or in the game?**
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
