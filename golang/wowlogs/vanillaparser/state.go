package vanillaparser

import (
	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
)

type State struct {
	Participants map[guid.GUID][]*combatant.Combatant
}

func NewState() *State {
	return &State{
		Participants: make(map[guid.GUID][]*combatant.Combatant),
	}
}

func (s *State) Process(msgs ...Message) error {
	for _, msg := range msgs {
		if err := s.process(msg); err != nil {
			return err
		}
	}
	return nil
}

func (s *State) process(raw Message) error {
	switch msg := raw.(type) {
	case Combatant:
		//s.Participants[msg.Name] = &msg.Combatant
	}
	return nil
}
