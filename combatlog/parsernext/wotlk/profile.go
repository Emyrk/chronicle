// Package wotlk owns wotlk composition policy. It composes the shared CLEU semantic decoder.
package wotlk

import (
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/database"
)

const Name common.Expansion = "wotlk"

// Accepts reports the explicitly supported source-ingestion combinations,
// not support for decoding combat events or constructing encounters.
func Accepts(format database.LogFormat) bool {
	return format == database.LogFormat335aCcAddon || format == database.LogFormatAzerothcoreMod
}
