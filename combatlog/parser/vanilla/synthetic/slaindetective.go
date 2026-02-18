package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/zoner"
)

type slainDetective struct {
	currentZone *zoner.Location
	lastDamage  map[guid.GUID]*messages.Damage
}

func newSlainDetective() *slainDetective {
	return &slainDetective{
		currentZone: zoner.NewLocation(),
		lastDamage:  make(map[guid.GUID]*messages.Damage),
	}
}

func (s *slainDetective) ProcessMessage(msg messages.Message) messages.Message{
	switch m := msg.(type) {
	case *messages.Zone:
		changed := s.currentZone.Process(*m)
		if changed {
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
    return m
	}
  return msg
}
