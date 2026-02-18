package encounters

import (
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/zoner"
)

type State struct {
	logger *slog.Logger

	// CurrentZone is the zone the player is currently in.
	CurrentZone     *zoner.Location
	CurrentInstance instances.Instance
	Instances       []instances.Instance

	// Units holds information about all units seen so far.
	// Friendly/Foe/Relationships, etc.
	Units *unitdb.Units

	reg *registry.Registry
}

func New(logger *slog.Logger) *State {
	s := &State{
		logger:      logger,
		Units:       unitdb.New(),
		CurrentZone: zoner.NewLocation(),
		reg:         registry.DefaultRegistry(logger),
		Instances:   make([]instances.Instance, 0),
	}
	return s
}

func (s *State) Process(m messages.Message) error {
	switch typed := m.(type) {
	case *messages.Zone:
		s.Zone(*typed)
	case *messages.Damage:
		//s.Damage(typed)
	case *messages.Cast:
		//s.CastV2(typed)
	case *messages.Combatant:
		s.Combatant(*typed)
	case *messages.Unit:
		s.Unit(*typed)
	case *messages.Slain:
		//s.Slain(typed)
	}

	// encounter processing would go here
	if s.CurrentInstance != nil {
		err := s.CurrentInstance.Process(m)
		if err != nil {
			return fmt.Errorf("instance process: %w", err)
		}
	}
	return nil
}

func (s *State) Combatant(c messages.Combatant) {
	s.Units.UpdatePlayer(c.Combatant)
}

func (s *State) Unit(u messages.Unit) {
	s.Units.Update(u.Info)
}

func (s *State) Zone(z messages.Zone) {
	changed := s.CurrentZone.Process(z)
	if !changed {
		return
	}

	matched := false
	for _, inst := range s.Instances {
		if inst.MatchesZone(z.Zone) {
			s.CurrentInstance = inst
			matched = true
			s.logger.Info("Matched existing instance",
				slog.String("name", inst.Name()),
			)
		}
	}

	if !matched {
		s.CurrentInstance = s.reg.GetInstance(z.Zone, s.Units)
		if s.CurrentInstance != nil {
			s.logger.Info("Matched new instance",
				slog.String("name", s.CurrentInstance.Name()),
			)
			s.Instances = append(s.Instances, s.CurrentInstance)
		}
	}

	s.logger.Info(fmt.Sprintf("Zone changed to %q (instance %d)", z.Name, z.InstanceID),
		slog.String("zone_name", z.Name),
		slog.Uint64("instance_id", uint64(z.InstanceID)),
		slog.String("exited_from", s.CurrentZone.Name),
		slog.Uint64("exited_instance_id", uint64(s.CurrentZone.InstanceID)),
		slog.Time("seen", z.Seen),
	)
}
