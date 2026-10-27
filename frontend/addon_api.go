package frontend

import _ "embed"

// AddonAPIReference is the human Addon API reference shown at /addons/api.
// The Lua workshop assistant receives it verbatim so both stay in sync.
//
//go:embed chronicle/src/pages/LuaProjects/lua-panel-api.md
var AddonAPIReference string
