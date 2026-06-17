package synthetic

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb"
)

type mitigator struct {
	WoWDB  gamedb.SpellFetcher
	logger *slog.Logger
}

func newMitigator(logger *slog.Logger, wowDB gamedb.SpellFetcher) *mitigator {
	return &mitigator{
		WoWDB:  wowDB,
		logger: logger,
	}
}

func (m *mitigator) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	for _, msg := range msgs {
		switch ty := msg.(type) {
		case *messages.Damage:
			var _ = ty
		}
	}

	// All messages are mutated in place
	return msgs, nil
}
