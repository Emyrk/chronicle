// Package tbc owns tbc composition policy. Combat decoding is not implemented.
package tbc

import (
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats"
)

const Name common.Expansion = "tbc"

// Accepts reports the explicitly supported source-ingestion combinations,
// not support for decoding combat events or constructing encounters.
func Accepts(format formats.ID) bool {
	return format == formats.TBCCompanion
}
