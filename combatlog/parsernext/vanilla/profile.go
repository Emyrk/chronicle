// Package vanilla owns vanilla composition policy. Combat decoding is not implemented.
package vanilla

import (
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/database"
)

const Name common.Expansion = "vanilla"

// Accepts reports the explicitly supported source-ingestion combinations,
// not support for decoding combat events or constructing encounters.
func Accepts(format database.LogFormat) bool {
	return format == database.LogFormat112aCcAddon
}
