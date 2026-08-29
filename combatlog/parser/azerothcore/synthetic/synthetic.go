package synthetic

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	vanillasynthetic "github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
)

// Synthetic processes the raw combat log events, and occasionally will insert
// or mutate synthetic events to help downstream consumers.
type Synthetic struct {
	logger *slog.Logger

	wowDB gamedb.GameDB
}

func New(ctx context.Context, logger *slog.Logger, wowDB gamedb.GameDB) *Synthetic {
	return &Synthetic{
		logger: logger,
		wowDB:  wowDB,
	}
}

func (s *Synthetic) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	return vanillasynthetic.CreditJudgementOfLightToTarget(msgs), nil
}
