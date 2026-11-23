# Module API reference

Chronicle modules are small Lua programs that extend Chronicle. This reference covers **instance panel** modules, which turn a raid log into your own panel on the instance page; guide, guild and armory modules will follow the same model. Modules run in a sandboxed browser worker (Lua 5.3 via Fengari) with no network, file or page access. Chronicle replays the log's events into your code, and your code draws the panel with a small WoW-style UI API.

> **Note:** Chronicle modules run on Chronicle in your browser, not in the game client: they do not go in your `Interface/AddOns` folder.

## Getting Started

You can write modules directly in the browser Workshop, or connect an external AI agent through **MCP (Model Context Protocol)**. The [Chronicle MCP relay](https://github.com/Emyrk/chronicle-mcp) runs locally on your computer and connects your agent to a browser tab you explicitly choose. The browser owns the module files, execution, previews, and save approval. You do not need a local Lua project or file synchronization.

### Install and start the Claude Code plugin

The plugin supports Linux and macOS on Intel/AMD and ARM64. You need Claude Code, `curl`, and GitHub CLI (`gh`) with attestation verification support. Setup asks before installing prerequisites and verifies downloaded releases. Native Windows setup is not supported.

Run these commands in your terminal to install from Chronicle's own marketplace:

```sh
claude plugin marketplace add Emyrk/chronicle-mcp
claude plugin install chronicle@chronicle-plugins
```

Start Claude Code and run:

```text
/chronicle:setup
```

Approve the setup command. Once the local service is running, reconnect the Chronicle server in Claude Code's `/mcp` menu or restart Claude Code. Installing the plugin alone does not start the service. If setup reports a missing release, incompatible daemon, or occupied port, follow the [relay setup and troubleshooting instructions](https://github.com/Emyrk/chronicle-mcp#quick-start) rather than bypassing verification or stopping an unknown service.

### Connect your module editor

1. Open [Modules](/modules), create or choose a module, and open its editor in the Workshop.
2. Click **Connect agent** in the Workshop header and allow local-network access if your browser asks.
3. In Claude Code, run `/chronicle:connect` and tell the agent which connection name or ID to use.
4. Let the agent select that tab and load its current page context and skills before asking it to edit.

The agent never automatically selects a tab, even if only one is connected. Each tab can have one agent owner, and each agent can own one tab. Release the current tab before switching. After a full reload or reconnect, select the new connection again.

### Build, preview, and save with your agent

Try a request like:

```text
Use my connected module editor to make an instance panel that shows total
healing by player. Read the current files and Lua API guidance first, then
edit the browser working copy and run the startup check. Ask me to select
an instance and encounters for Preview, and show me the result before saving.
```

The agent discovers the tools and Lua API guidance from the connected page. It can read and edit your working copy, check startup, and run a preview when those tools are available. Select an instance and encounters in the browser's **Preview** pane so the preview has real log data.

> **You control persistence.** Agent edits stay in the browser working copy until saved. An agent's save request requires your approval in the browser. Saving updates main; it does not tag or publish a release. Review the changes and preview before approving, then publish separately when ready.

Use the browser's **Revoke** control to cancel an agent's work and release its ownership, or disconnect the tab to end its relay connection. Neither action saves or discards your working copy. To stop the shared local service, run `/chronicle:teardown` in Claude Code and review its confirmation; shutdown affects every connected agent.

### Other clients and troubleshooting

Other MCP clients need stateful Streamable HTTP support and secure authentication configuration. See the [relay's client configuration guide](https://github.com/Emyrk/chronicle-mcp#headless-service-and-other-mcp-clients). Do not paste bearer tokens or private daemon state into chat or commit them to a repository.

- **No tabs listed:** keep the module editor open and click **Connect agent**. Opening this API reference alone does not connect an editor.
- **Only connection tools appear:** explicitly select a tab before expecting module tools. The agent loads fresh page guidance after selection or navigation.
- **Tab already owned:** ask the current agent to release it, or use the browser's **Revoke** control before selecting it again.
- **Preview needs data:** select an instance and encounters in the Workshop's **Preview** pane.
- **Cannot reach the relay:** check that setup completed and the local service is running, allow browser local-network access, and reconnect the MCP server in your client.

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
  "filter_mode": "none",
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
| `filter_mode` | no | `"none"` (default), `"prefilter"`, or `"manual"`. See [Panel filters](#panel-filters). |
| `max_events` | no | A positive integer. The module stops with an error after this many events. Omit it to receive everything. |
| `replay` | no | `"full"` or `"incremental"`. Opts into the instance page's Replay mode; see [Replay mode](#replay-mode). Omit it and the panel is disabled while Replay runs. |
| `assets` | no | Image files (PNG, JPEG, WebP, up to 2 MiB each) for `SetTexture`. Uploaded packages only; the browser editor is asset-free. |
| `icon` | no | The icon shown next to the module in the panel selector and on its page. One of the [icon names](#icons) below; omit it for the generic module icon. |

### Panel filters

`filter_mode` controls whether the instance page's built-in event filters affect your module:

- `"none"` (default) preserves existing behavior. Every event in scope reaches your callbacks, and `Chronicle.Filter(message)` always returns `true` for a valid combat message.
- `"prefilter"` sends only events that pass the built-in filters to your callbacks.
- `"manual"` sends every event in scope. Call `Chronicle.Filter(message)` yourself to decide which events to count or display.

`Chronicle.Filter(message)` returns a boolean using the same compiled predicate as Chronicle's built-in panels. With no active filters it returns `true`. Pass only valid combat messages received from event callbacks, not arbitrary tables or UI messages. The function does not mutate the message. Encounter selection and `stream_scope` still determine which encounters are replayed.

For example, with `"filter_mode": "manual"`:

```lua
local damage = require("chronicle.v1.events.damage")
local total = 0
damage.onEvent(function(message)
  if Chronicle.Filter(message) then total = total + message.amount end
end)
```

Set `filter_mode` in the Workshop's **project.json** tab. Preview uses the current working-copy value; saving and publishing preserve it in the package manifest. Older manifests without this field keep `"none"` behavior. New browser-editor projects explicitly start with `"none"`.

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

`CreateFrame(type, id, parent)` accepts `"Frame"`, `"FontString"`, `"Texture"`, `"Button"`, `"Breakout"` and the Chronicle-owned `"PlayerMetricChart"` and `"LineChart"`. `id` must be unique within the module; omit it to get a generated one. `parent` defaults to `UIParent`, the panel's root. Objects persist until you call `:Destroy()`, so create them once and update them, rather than creating new ones each time.

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
| `SetTooltip(text)` | Frame, FontString, Texture, Button | Plain hover text drawn by Chronicle; hovering never runs Lua. Newlines start new lines. `nil` or `""` removes it. A Texture with a spell or item tooltip shows that instead. |
| `SetLink(path)` | FontString, Button | Links to a page on Chronicle, such as `"/modules/author/slug"`. See [Links](#links). |
| `Destroy()` | all except UIParent | Removes the object, everything parented to it, and their click handlers. Their IDs can be reused. |
| `SetScript("OnClick", fn)` | Button, Frame | Needs the `input` capability. `fn(self)` runs on click. |
| `SetTitle(text)`, `SetAnchor(frame)` | Breakout | See [Breakout panels](#breakout-panels). |
| `SetScript("OnClose", fn)` | Breakout | Needs the `input` capability. `fn(self)` runs after the viewer closes it. |

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

### Links

`SetLink(path)` turns a FontString or Button into a link to another page on Chronicle, for example your module's own page or the API reference. Clicking it navigates like any other link on the site and needs no `input` capability.

```lua
local more = CreateFrame("FontString", "more", UIParent)
more:SetText("About this module ›")
more:SetLink("/modules/chronicle/module-ui-demo")
```

- Only paths on this site are accepted: they start with a single `/`. Full URLs, `//host` paths and anything else are an error, so a module cannot send viewers off Chronicle.
- `nil` or `""` removes the link. A disabled Button is never a link.
- Your module's page is `/modules/<author>/<slug>`, using the `slug` from `project.json`.

### Hover tooltips

`SetTooltip(text)` attaches hover text to a Frame, FontString, Texture or Button. Chronicle draws it, so it costs no Lua time and works without the `input` capability:

```lua
local cell = CreateFrame("Frame", "dps-cell", UIParent)
cell:SetSize(80, 20)
cell:SetTooltip("Jaina\n1,240 DPS\n42% of raid damage")
```

### Line chart

`LineChart` draws numeric series with Chronicle's line chart, the same renderer as the Timeline panel. Hovering shows every visible series' value at that point, and viewers can click legend entries to hide series.

```lua
local ui = require("chronicle.v1.ui")
local chart = ui.lineChart(UIParent, "dps-over-time", {
  width = 640, height = 260,
  xFormat = "seconds", yFormat = "compact",
  xLabel = "Fight time", yLabel = "DPS",
  bands = {
    { from = 0, to = 95, label = "Phase 1" },
    { from = 95, to = 180, label = "Phase 2", color = "#6366f1", tooltip = "Whelps" },
  },
  markers = {
    { x = 120, color = "#ef4444", style = "dotted", icon = "triangle", tooltip = "Jaina died\nThrall died" },
  },
  series = {
    { name = "Jaina", color = "#69ccf0", suffix = "/s", points = { {0, 0}, {5, 1200}, {10, 1850} } },
    { name = "Thrall", points = { {0, 0}, {5, 900}, {10, 1400} } },
  },
})
-- Later: chart:SetSeries(newSeries)
```

A chart holds at most 12 series and 2,000 points in total, plus up to 64 bands and 32 markers.

- **Bands** shade an x range behind the lines, like the Line Chart panel's phases or its raid durability background. A band's `label` is drawn along the top. Its `label` and `tooltip` also appear in the hover readout while the pointer is inside it. `opacity` defaults to 0.08.
- **Markers** draw a vertical line, such as a death or a phase change. `style` is `"dashed"` (default), `"solid"` or `"dotted"`. `icon` is `"none"` (default), `"triangle"` or `"dot"`. A marker with a `tooltip` shows it in a card when the pointer is on the line.
- A series' **`suffix`**, such as `"/s"`, is appended to its values in the hover readout.
- **`timeSelection = "seconds"`** (or `chart:SetTimeSelection("seconds")`) lets viewers drag across the chart to set the [page time range](#page-time-range). Double-clicking clears it, and the current range is highlighted. Use `"milliseconds"` if your x values are milliseconds. The x axis must be fight time from encounter start.
- **`fillParent = true`** (or `chart:SetFillParent()`) sizes the chart to its parent frame, or to the whole panel, and follows it as it resizes. `SetPoint` and `SetSize` are then ignored. Points are `{x, y}` or `{x = x, y = y}`. Colors are `"#rrggbb"` strings or `{r, g, b, a}` tables; series without one get a palette color. Formats are `"number"`, `"compact"` (1.2k, 3.4M), `"seconds"` (12s), `"duration"` (1:05) and `"percent"` (values from 0 to 100). Curves are `"linear"`, `"monotoneX"` (default), `"step"`, `"natural"` and `"basis"`.

The chart also supports `SetSeries`, `SetBands`, `SetMarkers`, `SetFillParent`, `SetTimeSelection`, `SetXFormat`, `SetYFormat`, `SetCurve`, `SetArea`, `SetShowPoints`, `SetStacked`, `SetLegend`, `SetAxisLabels`, `SetXRange` and `SetYRange`. Only these options are exposed: the chart library's own options include JavaScript functions and components, which a sandboxed module cannot send.

### Breakout panels

A `Breakout` is a floating panel for details: a player's spells, a death recap, a pull's timeline. Chronicle draws it outside your module's panel, so it is never cut off by the panel's size, and it looks like Chronicle's own pinned breakouts. The viewer can drag it by its title bar and close it.

```lua
local details = CreateFrame("Breakout", "player-details")   -- always top-level; starts hidden
details:SetSize(360, 220)                                     -- the content area, below the title bar

local heading = details:CreateFontString("details-heading")
heading:SetPoint("TOPLEFT", details, "TOPLEFT", 10, -10)

row:SetScript("OnClick", function()
  details:SetTitle("Jaina")
  heading:SetText("1.2M damage")
  details:SetAnchor(row)   -- open beside the row that was clicked
  details:Show()
end)

details:SetScript("OnClose", function() selected = nil end)
```

- Put any `Frame`, `FontString`, `Texture` or `Button` inside it, positioned with `SetPoint` as in a `Frame`. Content larger than `SetSize` scrolls.
- `SetAnchor(frame)` opens it to the right of that frame, or to its left, or below it, whichever fits on screen. Without an anchor it opens beside the panel. It is placed each time it opens; after that the viewer can move it.
- `Hide()` closes it from Lua. The close button hides it too, then runs `OnClose`, so `IsShown()` is always accurate.
- Create one breakout and refill it for each player, rather than one per player. Several can be open at once.
- `SetBorderColor` tints its border and title, for example with a class colour.

### Spell names

`Chronicle.GetSpell(spellId, callback)` looks up a spell's name, rank and icon. Chronicle fetches spell data from its server, so the answer arrives later: `callback(spell)` runs after the current callback returns, usually after `onComplete`. `spell` is `nil` when Chronicle has no data for that ID.

```lua
local label = CreateFrame("FontString", "top-spell", UIParent)
label:SetText("Spell " .. spellId)                -- shown until the name arrives
Chronicle.GetSpell(spellId, function(spell)
  if spell then label:SetText(spell.name .. (spell.rank and (" (" .. spell.rank .. ")") or "")) end
end)
```

| Field | Meaning |
| --- | --- |
| `id` | The spell ID you asked for. |
| `name` | The spell's name, such as `"Frostbolt"`. |
| `rank` | Its rank text, such as `"Rank 4"`, or `nil`. |
| `icon` | Its icon name for `Texture:SetIcon`, or `nil`. |

- Draw first with a placeholder, then update the text in the callback. Never wait for names before drawing.
- A spell this module already looked up calls back immediately, so calling `GetSpell` again for the same ID is cheap.
- Each run may look up at most 1,000 different spells. Look up the spells you show, not every spell in the log.
- Event names are already on some streams: `cast` and `spell_go` have `spell.name`, and `aura` has `spellName`. `GetSpell` is for streams that only have `spellId`, such as `damage` and `heal`.

### Page time range

The instance page has one time range filter that every panel uses. The Line Chart panel sets it when you drag across it. A module can set it from a click handler, for example when a viewer clicks a phase or a timeline column:

```lua
local phase2 = CreateFrame("Button", "phase-2", UIParent)
phase2:SetText("Phase 2")
phase2:SetScript("OnClick", function()
  Chronicle.SetTimeRange(95000, 180000)   -- ms from encounter start, like event.offsetMs
end)

local reset = CreateFrame("Button", "reset", UIParent)
reset:SetText("Whole fight")
reset:SetScript("OnClick", function() Chronicle.ClearTimeRange() end)
```

- `Chronicle.SetTimeRange(startMs, endMs)` takes milliseconds from encounter start. `nil` leaves a bound open, so `SetTimeRange(60000)` means "from 1:00 onward". Values past the end of the selected encounters are clamped.
- `Chronicle.ClearTimeRange()` removes the filter.
- `Chronicle.GetTimeRange()` returns `startMs, endMs`. A bound is `nil` when it is open, and both are `nil` when no range is set.
- `Chronicle.OnTimeRangeChanged(function(startMs, endMs) ... end)` runs whenever the range changes, from any source: the time slider, a chart drag, or another module. It also runs right after loading if a range is already set. It does not run for this module's own `SetTimeRange`. It may redraw, but it cannot set the range itself, which prevents feedback loops.

```lua
local label = CreateFrame("FontString", "range-label", UIParent)
Chronicle.OnTimeRangeChanged(function(startMs, endMs)
  if startMs == nil and endMs == nil then label:SetText("Whole fight")
  else label:SetText(string.format("%ds to %s", (startMs or 0) / 1000, endMs and (endMs / 1000 .. "s") or "end")) end
end)
```

A `LineChart` can also set the range by dragging, like the Line Chart panel. See `SetTimeSelection` under [Line chart](#line-chart).

Setting or clearing the range needs the `input` capability and works only inside an `OnClick` handler, so a module cannot change other panels without a viewer's click. In the Module Workshop preview there is no page range: `SetTimeRange` does nothing and `GetTimeRange` returns `nil, nil`. The module's own events are not filtered by the range.

### Replay mode

Replay plays a fight back with a playhead. Built-in panels follow it, and a module follows it only if it opts in with `replay` in project.json. A module without `replay` shows "This panel did not opt into replay mode, and is disabled." while Replay runs.

- `"replay": "full"`: Chronicle replays every event once, as usual, then tells the module where the playhead is. Use it for views of the whole fight that mark the current moment, like a death log that dims deaths still to come.
- `"replay": "incremental"`: Chronicle delivers events only up to the playhead and keeps delivering as playback moves forward, so totals grow with the fight. Lua state cannot rewind, so moving the playhead back restarts the module and replays from the start. `onComplete` runs only once the playhead reaches the end of the data.

Either way, redraw in `Chronicle.OnReplayTime`, not just `onComplete`. It runs after the events up to the playhead have been delivered (in full mode, after `onComplete`). The playhead moves at most every 100 ms during playback.

```lua
local total = 0
local label = CreateFrame("FontString", "total", UIParent)

Panel:OnEvent(function(event) total = total + event.amount end)

local function draw() label:SetText(string.format("%d damage", total)) end
Panel:OnComplete(draw)
Chronicle.OnReplayTime(function(ms)
  -- ms is nil when Replay turns off; with "incremental", total covers events up to the playhead.
  draw()
end)
```

- `Chronicle.GetReplayTime()` returns the playhead in milliseconds from the start of the selected encounters, like `event.offsetMs`, or `nil` when Replay is off.
- `Chronicle.OnReplayTime(function(ms) ... end)` runs whenever the playhead moves, with `ms` `nil` when Replay turns off.
- `Chronicle.SetReplayTime(ms)` moves the playhead, for example to jump to the moment a row in your table happened. Like `SetTimeRange`, it needs the `input` capability, works only inside an `OnClick` handler, and does nothing while Replay is off.

Try it in the Module Workshop: turn on **Replay** in the preview toolbar to get play, step, scrub and speed controls over the selected encounters.

### Lua Language Server definitions

The repository includes `lua-panel-api.d.lua`, a documentation-only [EmmyLua/LuaLS](https://luals.github.io/wiki/annotations/) definition file. Download it from the **LuaLS definitions** button at the top of this page and copy it into your editor workspace for completion, parameter hints and type checking. Chronicle generates the technical reference below from that file so the editor contract and published documentation stay aligned.

<!-- BEGIN GENERATED LUA API REFERENCE -->
<!-- Do not edit this section by hand. Edit lua-panel-api.d.lua and run pnpm generate:lua-api. -->
## Generated Lua API reference

Every global and method below comes from `lua-panel-api.d.lua`, the [EmmyLua/LuaLS](https://luals.github.io/wiki/annotations/) definition file behind the **LuaLS definitions** button. Signatures use LuaLS notation: `name: type`, and a parameter ending in `?` is optional.

### Globals

#### `CreateFrame(frameType: "Frame"|"FontString"|"Texture"|"Button"|"Breakout"|"PlayerMetricChart"|"LineChart", id?: string, parent?: ChronicleFrame)`

Create a retained UI object. parent defaults to UIParent.

**Returns:** `ChronicleFrame|ChronicleFontString|ChronicleTexture|ChronicleButton|ChronicleBreakout|ChroniclePlayerMetricChart|ChronicleLineChart` object

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

Remove this object, every object parented to it, and their callbacks. Their IDs can be reused afterwards.

#### `ChronicleRegion:SetTooltip(text?: string)`

Show plain text when the pointer rests on this object. Chronicle draws it, so hovering never runs Lua. Works on Frame, FontString, Texture and Button; newlines start new lines. nil or "" removes it.

- `text`: Up to 4 KiB.

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

#### `ChronicleFontString:SetLink(path?: string)`

Make this text a link to a page on Chronicle, such as your module's page. Only paths on this site are accepted; nil or "" removes the link.

- `path`: A path starting with /, such as "/modules/author/slug". Up to 512 characters.

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

### `ChronicleButton` extends `ChronicleFrame`

#### `ChronicleButton:SetText(text: string)`

Set the button label.

#### `ChronicleButton:SetLink(path?: string)`

Make this button a link to a page on Chronicle, such as your module's page. Only paths on this site are accepted; nil or "" removes the link.

- `path`: A path starting with /, such as "/modules/author/slug". Up to 512 characters.

### `ChronicleBreakout` extends `ChronicleFrame`

#### `ChronicleBreakout:SetTitle(title?: string)`

Set the text in the title bar.

#### `ChronicleBreakout:SetAnchor(frame?: ChronicleRegion)`

Open beside this frame (to its right, else its left, else below it). nil opens beside the panel.

#### `ChronicleBreakout:SetScript(script: "OnClose", callback: fun(self:ChronicleBreakout))`

Register OnClose, which runs after the viewer closes the breakout with its close button. The breakout is already hidden when it runs. Requires the input capability.

### `ChroniclePlayerMetricChart` extends `ChronicleRegion`

#### `ChroniclePlayerMetricChart:SetData(data: ChroniclePlayerMetricRow[])`

Replace every row in the chart. At most 100 rows.

#### `ChroniclePlayerMetricChart:SetChartType(type: ChroniclePlayerMetricChartType)`

Choose the standard Chronicle player metric presentation.

#### `ChroniclePlayerMetricChart:SetPerSecond(perSecond?: boolean)`

Display values per second using the configured duration.

#### `ChroniclePlayerMetricChart:SetDuration(durationMillis: number)`

Set the duration used for per-second conversion, in milliseconds.

#### `ChroniclePlayerMetricChart:SetPanelTitle(panelTitle: string)`

Set the title used by Chronicle-owned chart surfaces.

#### `ChroniclePlayerMetricChart:SetStackedLabel(stackedLabel: string)`

Set the label for stacked secondary values.

#### `ChroniclePlayerMetricChart:SetValueSuffix(valueSuffix: string)`

Override the value suffix.

#### `ChroniclePlayerMetricChart:SetHideZeroValue(hideZeroValue?: boolean)`

Hide primary value badges whose value is zero.

#### `ChroniclePlayerMetricChart:SetRowHeight(rowHeight: number)`

Set row height in pixels, from 12 through 128.

### `ChronicleLineChart` extends `ChronicleRegion`

#### `ChronicleLineChart:SetSeries(series: ChronicleLineSeries[])`

Replace every series. At most 12 series and 2000 points in total.

#### `ChronicleLineChart:SetMarkers(markers: ChronicleLineMarker[])`

Replace the vertical marker lines, such as phase changes. At most 32.

#### `ChronicleLineChart:SetBands(bands: ChronicleLineBand[])`

Replace the shaded x ranges drawn behind the lines, such as phases or a background measure. At most 64.

#### `ChronicleLineChart:SetXFormat(xFormat: ChronicleLineChartFormat)`

Choose how x values are written on the axis and in the hover readout. Defaults to "number".

#### `ChronicleLineChart:SetYFormat(yFormat: ChronicleLineChartFormat)`

Choose how y values are written. Defaults to "compact" (1.2k, 3.4M).

#### `ChronicleLineChart:SetCurve(curve: ChronicleLineChartCurve)`

Set the line interpolation. Defaults to "monotoneX".

#### `ChronicleLineChart:SetArea(area?: boolean)`

Fill the area under each line.

- `area`: Defaults to true.

#### `ChronicleLineChart:SetShowPoints(showPoints?: boolean)`

Draw a dot at every point.

- `showPoints`: Defaults to true.

#### `ChronicleLineChart:SetStacked(stacked?: boolean)`

Stack series on top of each other. Stacked charts are always filled.

- `stacked`: Defaults to true.

#### `ChronicleLineChart:SetFillParent(fillParent?: boolean)`

Size the chart to fill its parent frame (or the whole panel), ignoring SetPoint and SetSize.

- `fillParent`: Defaults to true.

#### `ChronicleLineChart:SetTimeSelection(timeSelection: ChronicleLineChartTimeSelection)`

Let viewers drag across the chart to set the page's time range, like the Line Chart panel; double-click clears it. The selected range is highlighted. Use Chronicle.OnTimeRangeChanged to react to it.

- `timeSelection`: What the x axis measures: fight time in "seconds" or "milliseconds". "off" (the default) disables selection.

#### `ChronicleLineChart:SetLegend(legend?: boolean)`

Show or hide the legend. Shown by default.

- `legend`: Defaults to true.

#### `ChronicleLineChart:SetAxisLabels(xLabel?: string, yLabel?: string)`

Label the axes. nil or "" removes a label.

#### `ChronicleLineChart:SetXRange(xMin?: number, xMax?: number)`

Fix the x axis range. nil means fit the data.

#### `ChronicleLineChart:SetYRange(yMin?: number, yMax?: number)`

Fix the y axis range. nil means fit the data. The minimum defaults to 0.

### `Panel`

#### `Panel:OnEvent(stream?: string, callback: fun(event: table))`

Call `callback(event)` for every event of `stream`, or for every declared stream when `stream` is omitted; `event.stream` says which. Subscribing to a stream project.json does not declare is an error. Registering again replaces the previous callback.

- `stream`: A stream from project.json, such as "damage".

#### `Panel:OnComplete(callback: fun())`

Call `callback()` once after the last event. Draw your results here.

### `Chronicle`

#### `Chronicle.GetUnit(guid: string)`

Look up a unit by the GUID in an event's source or target.

**Returns:** `ChronicleUnit?` unit nil when the GUID is unknown.

#### `Chronicle.GetPlayers()`

Return every player's GUID in the instance, sorted by name.

**Returns:** `string[]` guids

#### `Chronicle.Filter(message: table)`

Test a combat-event message against the viewer's panel filters without mutating it. No active filters, or filter_mode none, returns true. Invalid messages raise an API error.

- `message`: A supported combat-event message received by Panel:OnEvent.

**Returns:** `boolean` matches

#### `Chronicle.SetTimeRange(startMs?: number, endMs?: number)`

Set the page's time range filter, which every panel on the instance page uses. Times are milliseconds from encounter start, like event.offsetMs; nil leaves a bound open. Needs the input capability and works only inside an OnClick handler, so a module cannot move the range on its own. Ranges past the end of the selected encounters are clamped.

- `endMs`: Must be at least startMs.

#### `Chronicle.ClearTimeRange()`

Clear the page's time range filter. Same rules as Chronicle.SetTimeRange.

#### `Chronicle.OnTimeRangeChanged(callback: fun(startMs: number?, endMs: number?))`

Call `callback(startMs, endMs)` whenever the page's time range changes, for example when a viewer drags across a chart or moves the time slider. Bounds are nil when open; both are nil when the range is cleared. It is also called right after loading if a range is already set. It is not called for the module's own Chronicle.SetTimeRange, and cannot call SetTimeRange itself. Registering again replaces the previous callback.

#### `Chronicle.GetSpell(spellId: integer, callback: fun(spell: ChronicleSpellInfo?))`

Look up a spell's name, rank and icon. Chronicle fetches spell data from its server, so `callback(spell)` runs later, after the current callback returns; `spell` is nil when Chronicle has no data for that ID. A spell this module has already looked up calls back immediately. Each run may look up at most 1,000 different spells.

#### `Chronicle.GetTimeRange()`

Return the page's current time range in milliseconds from encounter start. Either bound is nil when open; both are nil when no range is set.

**Returns:** `number?` startMs; `number?` endMs

#### `Chronicle.GetReplayTime()`

Return the Replay playhead in milliseconds from the start of the selected encounters, like event.offsetMs, or nil when Replay is off. Only modules whose project.json declares `replay` run during Replay.

**Returns:** `number?` ms

#### `Chronicle.OnReplayTime(callback: fun(ms: number?))`

Call `callback(ms)` whenever the Replay playhead moves, after the events up to it have been delivered, so the callback can redraw. `ms` is nil when Replay turns off. With `"replay": "incremental"` it runs after every playhead step; with `"replay": "full"` it runs after onComplete. Registering again replaces the previous callback.

#### `Chronicle.SetReplayTime(ms: number)`

Move the Replay playhead to `ms` from the start of the selected encounters; values past the end are clamped. Needs the input capability and works only inside an OnClick handler. Does nothing while Replay is off. OnReplayTime runs once the page has moved.

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
  - `lineChart(parent, id, options)` renders a line chart and returns it. `options` takes `series`, `markers`, `width`, `height`, `x`, `y`, `xFormat`, `yFormat`, `curve`, `area`, `showPoints`, `stacked`, `legend`, `xLabel`, `yLabel`, `xMin`, `xMax`, `yMin` and `yMax`. Call `chart:SetSeries(series)` to replace its data.
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
| Spell lookups | 1,000 different spells per run | `spell lookup limit exceeded` |
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
Chronicle shows what went wrong, where (file, line, and whether it was startup, `onEvent`, `onComplete` or a click), and how to fix it. **Copy error** copies that explanation, ready to paste into an AI assistant such as Claude.

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
