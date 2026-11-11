// Package forever owns forever composition policy. Combat decoding is not implemented.
package forever

import (
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/database"
)

const Name common.Expansion = "forever"

// Accepts reports the explicitly supported source-ingestion combinations,
// not support for decoding combat events or constructing encounters.
func Accepts(format database.LogFormat) bool {
	// Production identifies v22 as the dedicated Forever format; sharing the
	// modern decoder with v9 does not establish Forever compatibility.
	return format == database.LogFormatV22Cleu
}
