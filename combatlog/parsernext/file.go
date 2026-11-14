// Package parsernext provides source selection and complete-file inspection.
// Format-specific subpackages decode shared combat messages; adapters compose
// their synthetics without changing the default production parser selection.
package parsernext

import (
	"context"
	"errors"
	"fmt"
	"github.com/Emyrk/chronicle/database"
	"io"

	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/forever"
	"github.com/Emyrk/chronicle/combatlog/parsernext/tbc"
	"github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parsernext/wotlk"
)

// Selection keeps wire syntax and expansion policy explicit and independent.
// In particular, selecting TBC never constructs a WotLK pipeline.
type Selection struct {
	Format    database.LogFormat
	Expansion common.Expansion
}

var ErrUnsupportedSelection = errors.New("unsupported format/expansion selection")

func (s Selection) Validate() error {
	var accepted bool
	switch s.Expansion {
	case vanilla.Name:
		accepted = vanilla.Accepts(s.Format)
	case tbc.Name:
		accepted = tbc.Accepts(s.Format)
	case wotlk.Name:
		accepted = wotlk.Accepts(s.Format)
	case forever.Name:
		accepted = forever.Accepts(s.Format)
	}
	if !accepted {
		return fmt.Errorf("%w: format %q, expansion %q", ErrUnsupportedSelection, s.Format, s.Expansion)
	}
	return nil
}

// ReadFile validates composition before reading, then delegates physical source
// ingestion to common. Neither this boundary nor common constructs raid state.
// Its success means EOF was reached, not that combat events were parsed.
func ReadFile(ctx context.Context, selection Selection, source io.Reader, maxLineBytes int, visit func(common.Line) error) (common.FileSummary, error) {
	if err := selection.Validate(); err != nil {
		return common.FileSummary{}, err
	}
	return common.ReadFile(ctx, source, maxLineBytes, visit)
}
