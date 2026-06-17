package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
)

type SlainDetective struct {
	currentZone *zoner.Location
	lastDamage  map[guid.GUID]*messages.Damage
}

func NewSlainDetective() *SlainDetective {
	return &SlainDetective{
		currentZone: zoner.NewLocation(),
		lastDamage:  make(map[guid.GUID]*messages.Damage),
	}
}

func (s *SlainDetective) ProcessMessages(msg []messages.Message) {
	for _, m := range msg {
		s.ProcessMessage(m)
	}
}

func (s *SlainDetective) ProcessMessage(msg messages.Message) {
	switch m := msg.(type) {
	case *messages.Zone:
		if result := s.currentZone.Process(*m); result != zone.NoChange {
			// Clear last damage on zone change
			s.lastDamage = make(map[guid.GUID]*messages.Damage)
		}
	case *messages.Damage:
		s.lastDamage[m.Target] = m
	case *messages.Slain:
		if m.Killer == nil {
			m.Attribution = s.lastDamage[m.Victim]
			if lastDamage := s.lastDamage[m.Victim]; lastDamage != nil {
				m.Killer = lastDamage.Caster
			}
		} else if lastDamage, ok := s.lastDamage[m.Victim]; ok {
			if lastDamage.Caster != nil && *m.Killer == *lastDamage.Caster {
				m.Attribution = lastDamage
			}
		}
	}
}
