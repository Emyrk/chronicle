package chronicle

import (
	"fmt"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

func requestedParserEngine(engines []chroniclesdk.ParserEngine) (chroniclesdk.ParserEngine, error) {
	if len(engines) > 1 {
		return "", fmt.Errorf("only one parser engine may be selected")
	}
	var engine chroniclesdk.ParserEngine
	if len(engines) == 1 {
		engine = engines[0]
	}
	return engine, engine.Validate()
}
