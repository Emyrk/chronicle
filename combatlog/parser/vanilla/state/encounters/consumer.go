package encounters

import (
	"context"
	"fmt"
	"log/slog"
	"maps"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/zoner"
)

type timingAccumulator struct {
	data map[string]time.Duration
}

func newTimingAccumulator(keys ...string) *timingAccumulator {
	data := make(map[string]time.Duration, len(keys))
	for _, key := range keys {
		data[key] = 0
	}
	return &timingAccumulator{data: data}
}

func (t *timingAccumulator) Add(name string, duration time.Duration) {
	t.data[name] += duration
}

func (t *timingAccumulator) Snapshot() map[string]time.Duration {
	return maps.Clone(t.data)
}

type State struct {
	logger *slog.Logger

	// CurrentZone is the zone the player is currently in.
	CurrentZone     *zoner.Location
	CurrentRealm    *realm.Info
	CurrentInstance *instances.Hookable
	Instances       []*instances.Hookable

	// Units holds information about all units seen so far.
	// Friendly/Foe/Relationships, etc.
	Units *unitdb.Units

	reg     *registry.Registry
	verbose bool
	timings *timingAccumulator
}

func New(ctx context.Context, logger *slog.Logger) *State {
	s := &State{
		logger:      logger,
		Units:       unitdb.New(),
		CurrentZone: zoner.NewLocation(),
		reg:         registry.DefaultRegistry(logger),
		Instances:   make([]*instances.Hookable, 0),
		verbose:     parseoptions.IsVerbose(ctx),
		timings: newTimingAccumulator(
			"encounter_state.total",
			"encounter_state.zone",
			"encounter_state.instance_process",
		),
	}
	return s
}

func (s *State) Process(m messages.Message) error {
	totalStart := time.Now()
	defer func() {
		s.timings.Add("encounter_state.total", time.Since(totalStart))
	}()

	err := s.Units.ProcessMessage(m)
	if err != nil {
		return fmt.Errorf("units process: %w", err)
	}

	switch typed := m.(type) {
	case *messages.Realm:
		s.CurrentRealm = &typed.Info
	case *messages.Zone:
		zoneStart := time.Now()
		s.Zone(*typed)
		s.timings.Add("encounter_state.zone", time.Since(zoneStart))
	case *messages.Damage:
		//s.Damage(typed)
	case *messages.Cast:
		//s.CastV2(typed)
	case *messages.Slain:
		//s.Slain(typed)
	}

	if s.CurrentInstance != nil {
		instanceStart := time.Now()
		err := s.CurrentInstance.Process(m)
		s.timings.Add("encounter_state.instance_process", time.Since(instanceStart))
		if err != nil {
			return fmt.Errorf("instance process: %w", err)
		}
	}
	return nil
}

func (s *State) DetailedTimes() map[string]time.Duration {
	times := s.timings.Snapshot()
	for _, instance := range s.Instances {
		for name, duration := range instance.DetailedTimes() {
			times[name] += duration
		}
	}
	return times
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
		s.CurrentInstance = s.reg.GetInstance(s.verbose, z.Zone, s.Units)
		if s.CurrentInstance != nil {
			// Set any initial realm state that we have
			s.CurrentInstance.SetRealm(s.CurrentRealm)
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
