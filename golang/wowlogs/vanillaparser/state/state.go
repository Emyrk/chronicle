package state

import (
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"
)

type State struct {
	logger *slog.Logger
	Me     types.Unit

	// Units holds information about all units seen so far.
	// Friendly/Foe/Relationships, etc.
	Units *Units
	// Participants is a map of player combatants we've seen.
	Participants *Combatants

	// CurrentZone is the zone the player is currently in.
	CurrentZone zone.Zone
	Fights      *Fights
}

func NewState(logger *slog.Logger, me types.Unit) *State {
	s := &State{
		logger:       logger,
		Me:           me,
		Participants: NewCombatants(nil),
		Units:        NewUnits(nil),
		CurrentZone:  zone.Zone{},
	}
	s.Fights = NewFights(s)
	return s
}

func (s *State) Process(m messages.Message) error {
	switch typed := m.(type) {
	case messages.Zone:
		s.Zone(typed)
	case messages.Damage:
		//s.Damage(typed)
	case messages.Cast:
		//s.CastV2(typed)
	case messages.Combatant:
		//s.Combatant(typed)
	case messages.Unit:
		//s.Unit(typed)
	case messages.Slain:
		//s.Slain(typed)
	}

	return s.Fights.Process(m)
}

func (s *State) Zone(z messages.Zone) {
	if z.Name == "" {
		// Ignore empty zones
		return
	}
	defer func() {
		// Always set the current zone at the end
		s.CurrentZone = z.Zone
	}()

	if s.CurrentZone.Equal(z.Zone) {
		return
	}

	s.logger.Info(fmt.Sprintf("Zone changed to %q (instance %d)", z.Name, z.InstanceID),
		slog.String("zone_name", z.Name),
		slog.Uint64("instance_id", uint64(z.InstanceID)),
		slog.String("exited_from", s.CurrentZone.Name),
		slog.Uint64("exited_instance_id", uint64(s.CurrentZone.InstanceID)),
		slog.Time("seen", z.Seen),
	)
}

func (s *State) String() string {
	return s.Fights.String()
}
