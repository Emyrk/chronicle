package chroniclesdk

import (
	"fmt"

	"github.com/Emyrk/chronicle/database"
)

// ParserEngine selects execution for one parse request, not a log-group default.
type ParserEngine string

const (
	ParserEngineLegacy ParserEngine = "legacy"
	ParserEngineNext   ParserEngine = "parsernext"
)

func (e ParserEngine) Validate() error {
	switch e {
	case "", ParserEngineLegacy, ParserEngineNext:
		return nil
	}
	return fmt.Errorf("unsupported parser engine %q", e)
}
func (e ParserEngine) ValidateFormat(format database.LogFormat) error {
	if err := e.Validate(); err != nil {
		return err
	}
	if e != ParserEngineNext {
		return nil
	}
	switch format {
	case database.LogFormat112aCcAddon, database.LogFormat243CcAddon, database.LogFormat335aCcAddon, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc, database.LogFormatAzerothcoreMod:
		return nil
	}
	return fmt.Errorf("parser engine %q does not support format %q", e, format)
}
