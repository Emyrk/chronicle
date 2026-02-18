package whoami

import (
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type SharedMe struct {
	me types.Unit
}

func (s *SharedMe) SetMe(me types.Unit) *SharedMe{
	s.me = me
  return s
}

func (s *SharedMe) Unit() types.Unit {
	return s.me
}

func (s *SharedMe) Process(msg messages.Message) error {
	switch ty := msg.(type) {
	case *messages.Unit:
		if ty.IsMe() {
			s.SetMe(types.Unit{
				Name: ty.Name,
				Gid:  ty.Guid,
			})
		}
	case *messages.Combatant:
		if ty.IsMe() {
			s.SetMe(types.Unit{
				Name: ty.Name,
				Gid:  ty.Guid,
			})
		}
	}
	return nil
}
