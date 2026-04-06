package synthetic

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb"
)

// Synthetic processes the raw combat log events, and occasionally will insert
// or mutate synthetic events to help downstream consumers.
type Synthetic struct {
	logger       *slog.Logger
	slain        *slainDetective
	mitigation   *mitigator
	extraAttack  *extraAttack
	demons       *enslaveDemon
	possession   *possession
	knownObjects *knownObjects
	wowDB        gamedb.SpellFetcher
}

func New(logger *slog.Logger, wowDB gamedb.SpellFetcher) *Synthetic {
	return &Synthetic{
		logger:       logger,
		slain:        newSlainDetective(),
		mitigation:   newMitigator(logger, wowDB),
		extraAttack:  newExtraAttack(logger, wowDB),
		demons:       newEnslaveDemon(logger),
		possession:   newPossession(logger),
		knownObjects: newKnownObjects(),
		wowDB:        wowDB,
	}
}

func (s *Synthetic) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	for i, msg := range msgs {
		msgs[i] = s.slain.ProcessMessage(msg)
	}

	msgs = s.extraAttack.ProcessMessage(msgs)
	msgs = s.demons.ProcessMessages(msgs)
	msgs = s.possession.ProcessMessages(msgs)
	msgs = s.knownObjects.ProcessMessages(msgs)

	return msgs, nil
}
