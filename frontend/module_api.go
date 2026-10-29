package frontend

import _ "embed"

// ModuleAPIReference is the human Module API reference shown at /modules/api.
// The Lua workshop assistant receives it verbatim so both stay in sync.
//
//go:embed chronicle/src/pages/LuaProjects/lua-panel-api.md
var ModuleAPIReference string

// ModuleIcons is the JSON list of icon names an module may set as project.json "icon". The browser
// maps the same file to lucide icons, so uploads are checked against exactly what can be drawn.
//
//go:embed chronicle/src/pages/LuaProjects/moduleIcons.json
var ModuleIcons []byte
