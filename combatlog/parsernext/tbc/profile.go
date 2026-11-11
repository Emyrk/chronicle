// Package tbc owns tbc composition policy. Combat decoding is not implemented.
package tbc

import (
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/database"
)

const Name common.Expansion = "tbc"

// Accepts reports the explicitly supported source-ingestion combinations,
// not support for decoding combat events or constructing encounters.
func Accepts(format database.LogFormat) bool {
	// Wire syntax does not select expansion rules. Some TBC servers emit the
	// Wrath Companion format; this profile still represents TBC, not WotLK.
	return format == database.LogFormat243CcAddon || format == database.LogFormat335aCcAddon
}
