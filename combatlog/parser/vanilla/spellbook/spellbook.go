package spellbook

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type Tracker struct {
	Spells map[chrondbc.SpellID]*chrondbc.Spell
}

func New() *Tracker {
	return &Tracker{
		Spells: make(map[chrondbc.SpellID]*chrondbc.Spell),
	}
}

func (g *Tracker) Track(spell *chrondbc.Spell) {
	if spell == nil {
		return
	}
	g.Spells[spell.ID] = spell
}

func (g *Tracker) Process(msg messages.Message) error {
	switch ty := msg.(type) {
	case *messages.Damage:
		g.Track(ty.SpellData)
	case *messages.Heal:
		g.Track(ty.SpellData)
	case *messages.SpellGo:
		g.Track(ty.SpellData)
	case *messages.Aura:
		g.Track(ty.SpellData)
	case *messages.ExtraAttack:
		g.Track(ty.Spell)
	}

	return nil
}
