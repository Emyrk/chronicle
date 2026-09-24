package synthetic

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	vanillasynthetic "github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	wotlksynthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
)

// Synthetic processes the raw combat log events, and occasionally will insert
// or mutate synthetic events to help downstream consumers.
type Synthetic struct {
	logger *slog.Logger

	wowDB      gamedb.GameDB
	classes    map[guid.GUID]types.HeroClasses
	feignDeath *wotlksynthetic.FeignDeath
}

func New(ctx context.Context, logger *slog.Logger, wowDB gamedb.GameDB) *Synthetic {
	s := &Synthetic{
		logger:  logger,
		wowDB:   wowDB,
		classes: make(map[guid.GUID]types.HeroClasses),
	}
	s.feignDeath = wotlksynthetic.NewFeignDeath(ctx, wowDB, func(g guid.GUID) types.HeroClasses {
		return s.classes[g]
	})
	return s
}

func (s *Synthetic) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	for _, msg := range msgs {
		if combatant, ok := msg.(*messages.Combatant); ok {
			s.classes[combatant.Guid] = combatant.HeroClass
		}
	}

	msgs, err := s.feignDeath.ProcessMessages(msgs)
	if err != nil {
		return nil, err
	}
	return vanillasynthetic.CreditJudgementOfLightToTarget(msgs), nil
}
