package vanillaparser

import (
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
	"github.com/Emyrk/chronicle/golang/wowlogs/merge"
)

type Parser struct {
	logger *slog.Logger
	liner  *lines.Liner

	a, b io.Reader
	m    *merge.Merger
}

func New(logger *slog.Logger, a, b io.Reader) *Parser {
	m := merge.NewMerger(logger,
		merge.WithMiddleWare(OnlyKeepRawV2Casts),
	)

	return &Parser{
		m:      m,
		logger: logger,
	}
}
