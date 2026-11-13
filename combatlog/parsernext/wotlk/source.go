package wotlk

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parsernext/cleusource"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
)

type Pipeline = cleusource.Pipeline
type Source = cleusource.Source
type MissedSpell = cleusource.MissedSpell

// NewPipeline constructs the opt-in native Wrath message source from resolved
// parsectx metadata. AzerothCore has its own timestamp and extension source.
func NewPipeline(ctx context.Context, logger *slog.Logger, db cleusource.SpellFetcher) (*Pipeline, error) {
	return cleusource.New(ctx, logger, db, func(context cleu.Context, hooks cleu.Hooks) (*cleu.Decoder, error) {
		if context.Format != database.LogFormat335aCcAddon {
			return nil, fmt.Errorf("native Wrath source requires %q parsectx format", database.LogFormat335aCcAddon)
		}
		return NewDecoder(DecoderContext{Format: context.Format, Flavor: context.Flavor}, hooks)
	})
}
