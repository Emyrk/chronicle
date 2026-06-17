package synthetic

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type enslaveDemon struct {
	logger *slog.Logger
}

func newEnslaveDemon(logger *slog.Logger) *enslaveDemon {
	return &enslaveDemon{
		logger: logger,
	}
}

func (s *enslaveDemon) ProcessMessages(msgs []messages.Message) []messages.Message {
	var add []messages.Message
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.AuraCast:
			if m.Target == nil {
				continue
			}

			if m.Spell == nil {
				continue
			}

			if _, ok := warlockdemon.IsWarlockDemon(*m.Target); !ok {
				continue
			}

			if m.Spell.Name() != "Enslave Demon" { // A few spell ids
				continue
			}

			add = append(add, &messages.NewOwner{
				MessageBase: messages.Base(m.Date()),
				NewOwner:    m.Caster,
				Target:      *m.Target,
			})
		}
	}

	if len(add) == 0 {
		return msgs
	}

	return append(msgs, add...)
}
