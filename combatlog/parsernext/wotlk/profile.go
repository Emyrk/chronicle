// Package wotlk owns wotlk composition policy. Combat decoding is not implemented.
package wotlk

import (
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats"
)

const Name common.Expansion = "wotlk"

// Accepts reports the explicitly supported source-ingestion combinations,
// not support for decoding combat events or constructing encounters.
func Accepts(format formats.ID) bool {
	return format == formats.WrathCompanion || format == formats.AzerothCore
}
