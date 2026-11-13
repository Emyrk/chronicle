package tbc

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parsernext/cleusource"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
)

type Pipeline = cleusource.Pipeline
type Source = cleusource.Source
type MissedSpell = cleusource.MissedSpell

// NewPipeline constructs the opt-in native TBC message source from resolved
// parsectx metadata. It owns no synthetics or consumers.
func NewPipeline(ctx context.Context, logger *slog.Logger, db cleusource.SpellFetcher) (*Pipeline, error) {
	return cleusource.New(ctx, logger, db, func(context cleu.Context, hooks cleu.Hooks) (*cleu.Decoder, error) {
		return NewDecoder(DecoderContext{Format: context.Format, Flavor: context.Flavor}, hooks)
	})
}
