package frontend

import _ "embed"

// AddonAPIReference is the human Addon API reference shown at /addons/api.
// The Lua workshop assistant receives it verbatim so both stay in sync.
//
//go:embed chronicle/src/pages/LuaProjects/lua-panel-api.md
var AddonAPIReference string

// AddonIcons is the JSON list of icon names an addon may set as project.json "icon". The browser
// maps the same file to lucide icons, so uploads are checked against exactly what can be drawn.
//
//go:embed chronicle/src/pages/LuaProjects/addonIcons.json
var AddonIcons []byte
