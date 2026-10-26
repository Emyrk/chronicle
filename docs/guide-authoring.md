# Authoring Chronicle Lua guides

A Chronicle guide is a ZIP whose root contains `guide.json`, its Lua entrypoint, optional Lua modules, and declared assets. Guides run as untrusted Lua in a dedicated worker. They cannot access JavaScript, the DOM, HTTP, browser storage, or files outside the package.

The checked-in example is `frontend/chronicle/src/pages/Guides/examples/onyxia`. Build it with:

```sh
cd frontend/chronicle
pnpm build:guides
```

This writes `public/guides/chronicle.onyxia.zip` deterministically and regenerates `public/guides/catalog.json`. The catalog exposes safe package metadata to Chronicle's build and server layers without opening ZIP files at request time.

## Manifest version 1

```json
{
  "manifest_version": 1,
  "id": "example.hello",
  "name": "Hello Guide",
  "version": "1.0.0",
  "author": "Example Author",
  "api_version": 1,
  "entrypoint": "main.lua",
  "map_id": 249,
  "game": "turtle-wow",
  "game_version": "1.18.1",
  "capabilities": ["map", "ui", "input", "timers"],
  "assets": [],
  "description": "A small guide",
  "encounters": ["Onyxia"]
}
```

Package IDs are lowercase dot-separated identifiers. Versions use semantic-version form. `map_id` selects Chronicle's trusted map asset; it does not grant the package network access. Every non-Lua file other than `guide.json` must be listed in `assets`.

Capabilities are required features, not permissions to browser primitives:

- `ui` creates screen-space frames.
- `map` creates normalized map annotations.
- `input` registers supported callbacks.
- `timers` schedules bounded one-shot callbacks.

An unknown capability or API version rejects the package before execution.

## Search and no-JavaScript metadata

`name`, `description`, `author`, `game`, `game_version`, and `encounters` are also the guide's public discovery metadata. Keep them useful without executing Lua: Chronicle generates a catalog and a static HTML page for every built-in guide during the frontend build.

The generated page provides title, description, canonical, Open Graph, Twitter, and author metadata. Its body contains a readable summary with the guide name, description, author, game version, and encounters. Visitors without JavaScript can read that summary; when JavaScript is available, Chronicle replaces it with the interactive guide host.

The canonical route uses the package ID (`/guides/example.hello`). Friendly aliases may also be generated, but they point search engines to the package-ID route.

## Minimal guide

```lua
local panel = CreateFrame("Frame", "hello-panel", UIParent)
panel:SetPoint("TOP", UIParent, "TOP", 0, -32)
panel:SetSize(360, 120)
panel:SetBackgroundColor(0.03, 0.04, 0.06, 0.92)

local title = CreateFrame("FontString", "hello-title", panel)
title:SetPoint("TOP", panel, "TOP", 0, -20)
title:SetText("Hello from Lua")
title:SetFontSize(24)
title:SetColor(1, 1, 1, 1)

local marker = Map:CreateUnitMarker("boss")
marker:SetMapPosition(0.5, 0.4)
marker:SetCreatureID(10184)
marker:SetLabel("Onyxia")
marker:SetRole("boss")
marker:SetColor(0.95, 0.2, 0.3, 1)
```

## UI API

The v1 API takes inspiration from WoW's frame ergonomics; it is not WoW API compatibility.

### Globals

- `UIParent`: trusted viewport root. It cannot be destroyed.
- `CreateFrame(type, name?, parent?)`: creates `Frame`, `FontString`, `Texture`, or `Button`.
- `C_Timer.After(seconds, callback)`: schedules a bounded one-shot timer.
- `Guide:SetChapter(id)` / `Guide:GetChapter()`: package-owned chapter state.

### Frame methods

- `SetParent(frame)`
- `SetPoint(point, relativeFrame, relativePoint, x, y)`
- `SetSize(width, height)`, `SetWidth(width)`, `SetHeight(height)`
- `SetText(text)`, `SetFontSize(px)`, `SetTexture(packageAssetPath)`
- `SetColor(r, g, b, a?)`
- `SetBackgroundColor(r, g, b, a?)`
- `SetBorderColor(r, g, b, a?)`
- `SetAlpha(alpha)`
- `SetLayer(numberOrName)`
- `Show()`, `Hide()`, `IsShown()`, `Destroy()`
- `SetScript("OnClick", callback)` on interactive nodes
- `SetScript("OnSizeChanged", callback)` on `UIParent`
- `CreateFontString(name?)`, `CreateTexture(name?)`

Supported anchor names are `TOPLEFT`, `TOP`, `TOPRIGHT`, `LEFT`, `CENTER`, `RIGHT`, `BOTTOMLEFT`, `BOTTOM`, and `BOTTOMRIGHT`. UI positions and dimensions are viewport pixels. Child coordinates are relative to their parent.

## Map API

Map coordinates are normalized. `(0, 0)` is the artwork's top-left and `(1, 1)` is bottom-right. Facing is radians clockwise from map north.

Creation methods:

- `Map:CreateUnitMarker(name?)`
- `Map:CreateIcon(name?)`
- `Map:CreateText(name?)`
- `Map:CreateLine(name?)`
- `Map:CreateArrow(name?)`
- `Map:CreateCircle(name?)`
- `Map:CreateCone(name?)`
- `Map:CreatePolygon(name?)`
- `Map:SetCamera(x, y, zoom)`

Relevant object methods:

- `SetMapPosition(x, y)`
- `SetPoints({x1, y1, x2, y2, ...})`
- `SetSize(size, size)`
- `SetFacing(radians)`
- `SetLabel(text)`, `SetText(text)`, `SetFontSize(px)`
- `SetCreatureID(entry)`, `SetRole(role)`
- `SetRadius(normalizedRadius)`, `SetAngle(radians)`
- `SetLineWidth(width)`, `SetHeadSize(size)`
- `SetColor(r, g, b, a?)`, `SetFillColor(r, g, b, a?)`
- `Show()`, `Hide()`, `Destroy()`

Lines and arrows require exactly two point pairs. Polygons require three or more point pairs.

## Modules

`require("path.module")` resolves only to package-local `path/module.lua`. Absolute paths, parent traversal, browser/network resolution, native modules, and dynamic library loading do not exist. Modules are cached after their first successful load.

## Available Lua environment

The basic, table, string, math, and UTF-8 facilities needed for guide logic are available. Coroutines are intentionally disabled because independent Lua threads could otherwise bypass the per-callback instruction hook. These globals are deliberately removed:

- `io`
- `os`
- `package`
- `debug`
- `coroutine`
- `dofile`
- `loadfile`
- `load`
- `collectgarbage`
- Fengari/JavaScript interop globals

Code is subject to source, string, node, operation, timer, instruction, message, and wall-clock limits. A limit violation stops the runtime, displays a trusted host error, and leaves restart under the user's control.

## Assets

Declare every asset path in `guide.json`. Lua references the package path with `SetTexture`. Chronicle resolves it to a package-owned Blob URL and revokes it when the guide stops. Packages cannot reference remote URLs through the asset API.

## Design advice for LLM-authored guides

- Keep encounter-specific behavior in Lua rather than TypeScript.
- Use stable, descriptive object IDs.
- Destroy chapter-specific map nodes before creating the next scene.
- Use normalized coordinates and test at narrow and wide viewport sizes.
- Clearly label tactics that rely on community reports or uncertain encounter behavior.
- Prefer a few legible annotations over hundreds of overlapping objects.
