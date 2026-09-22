package synthetic

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type Possession struct {
	logger *slog.Logger
	format database.LogFormat
}

func NewPossession(ctx context.Context, logger *slog.Logger) *Possession {
	format, _ := parsectx.Format(ctx)
	return &Possession{
		logger: logger,
		format: format,
	}
}

func (s *Possession) ProcessMessages(msgs []messages.Message) []messages.Message {
	var add []messages.Message
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.AuraCast:
			if m.Target == nil || m.Spell == nil {
				continue
			}

			if !isControlSpell(m.Spell) {
				continue
			}

			if s.format == database.LogFormat112aCcAddon {
				// When casting MC, the caster also gets an aura of effect 4 (AuraEffectDummy)
				if m.EffectAuraName != chrondbc.AuraEffectModPossess && m.EffectAuraName != chrondbc.AuraEffectModCharm {
					continue
				}
			}

			if *m.Target == m.Caster {
				// Spell 58035 does this. If a caster MC's themselves... it does not matter?
				continue
			}

			_, isDemon := warlockdemon.IsWarlockDemon(*m.Target)
			if isDemon && m.Spell != nil && m.Spell.ID == 53222 {
				// Warlock's enslave demon is handled differently. TODO if it should be.
				continue
			}

			duration := time.Duration(m.Spell.Duration.MaxDuration) * time.Millisecond
			if s.format == database.LogFormat112aCcAddon {
				duration = time.Duration(m.DurationMS) * time.Millisecond
			}

			add = append(add, &messages.PossessionChange{
				MessageBase: messages.Base(m.Date()),
				Target:      *m.Target,
				Controller:  m.Caster,
				Spell:       m.Spell,
				Gained:      true,
				Duration:    duration,
			})
		case *messages.Aura:
			if m.SpellData == nil {
				continue
			}

			if m.Amount == 0 {
				if isControlSpell(m.SpellData) {
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

func isControlSpell(spell *chrondbc.Spell) bool {
	for _, effect := range spell.Effects {
		if effect.Effect == chrondbc.EffectApplyAura &&
			(effect.EffectAura == chrondbc.AuraEffectModPossess || effect.EffectAura == chrondbc.AuraEffectModCharm) {
			return true
		}
	}
	return false
}
