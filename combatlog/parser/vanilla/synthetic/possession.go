package synthetic

import (
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type possession struct {
	logger *slog.Logger
}

func newPossession(logger *slog.Logger) *possession {
	return &possession{
		logger: logger,
	}
}

func (s *possession) ProcessMessages(msgs []messages.Message) []messages.Message {
	var add []messages.Message
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.AuraCast:
			if m.Target == nil || m.Spell == nil {
				continue
			}

			if !isPossessionSpell(m.Spell) ||
				// When casting MC, the caster also gets an aura of effect 4 (AuraEffectDummy)
				m.EffectAuraName != chrondbc.AuraEffectModPossess {
				continue
			}

			add = append(add, &messages.PossessionChange{
				MessageBase: messages.Base(m.Date()),
				Target:      *m.Target,
				Controller:  m.Caster,
				Spell:       m.Spell,
				Gained:      true,
				Duration:    time.Duration(m.DurationMS) * time.Millisecond,
			})
		case *messages.Aura:
			if m.SpellData == nil {
				continue
			}

			if m.Amount == 0 {
				if isPossessionSpell(m.SpellData) {
					add = append(add, &messages.PossessionChange{
						MessageBase: messages.Base(m.Date()),
						Target:      m.Target,
						Spell:       m.SpellData,
						Gained:      false,
					})
				}
			}
		}
	}

	if len(add) == 0 {
		return msgs
	}

	return append(msgs, add...)
}

func isPossessionSpell(spell *chrondbc.Spell) bool {
	for i, eff := range spell.Effect {
		if eff == chrondbc.EffectApplyAura && spell.EffectAura[i] == chrondbc.AuraEffectModPossess {
			return true
		}
	}
	return false
}
