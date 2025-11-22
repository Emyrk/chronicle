package vanillaparser

import (
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
)

type State struct {
	Participants map[guid.GUID][]combatant.Combatant
}

func NewState() *State {
	return &State{
		Participants: make(map[guid.GUID][]combatant.Combatant),
	}
}

func (s *State) Combatant(cmbt combatant.Combatant) {
	if cmbt.Guid.IsZero() {
		return
	}

	if s.Participants[cmbt.Guid] == nil {
		s.Participants[cmbt.Guid] = []combatant.Combatant{}
	}

	s.Participants[cmbt.Guid] = append(s.Participants[cmbt.Guid], cmbt)
}

func (s *State) String() string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("State with %d participants:\n", len(s.Participants)))
	for gid, cmbts := range s.Participants {
		cmbt := cmbts[0]
		str.WriteString(fmt.Sprintf(" - %s: %s\n", gid.String(), cmbt.Name))
	}

	return str.String()
}
