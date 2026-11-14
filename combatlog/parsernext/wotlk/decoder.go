package wotlk

import (
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
)

// DecoderContext explicitly selects both wire format and gameplay flavor.
// Neither value is inferred from the other or from record contents.
type DecoderContext struct {
	Format database.LogFormat
	Flavor database.WoWFlavor
}

// NewDecoder constructs Wrath semantics over the shared CLEU record decoder.
// The core accepts AzerothCore's CLEU envelope; format-owned CHRONICLE_* source
// extensions remain caller hooks until their parsernext composition lands.
func NewDecoder(context DecoderContext, hooks cleu.Hooks) (*cleu.Decoder, error) {
	if !Accepts(context.Format) {
		return nil, fmt.Errorf("wrath decoder does not accept format %q", context.Format)
	}
	return cleu.NewDecoder(cleu.Context{Format: context.Format, Flavor: context.Flavor}, hooks)
}
