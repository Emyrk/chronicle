package encounters

import (
	"context"
	"fmt"
	"log/slog"
	"maps"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
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

// InstanceResolver creates a Hookable for a given zone. The default
// implementation delegates to registry.Registry.GetInstance.
type InstanceResolver func(verbose bool, z zone.Zone, db *unitdb.Units) *instances.Hookable

type State struct {
	logger *slog.Logger

	// CurrentZone is the zone the player is currently in.
	CurrentZone     *zoner.Location
	CurrentRealm    *realm.Info
	CurrentVersions *messages.Versions
	CurrentInstance *instances.Hookable
	Instances       []*instances.Hookable

	// Units holds information about all units seen so far.
	// Friendly/Foe/Relationships, etc.
	Units *unitdb.Units

	// Auras is the parse-wide aura tracker. It processes every aura message
	// once and persists across zone/instance switches.
	Auras *auras.Tracking

	// ConsumeTracker is the parse-wide consumable evidence tracker. It
	// records direct item-use and aura episodes for every message and is
	// shared by all per-instance Collectors.
	ConsumeTracker *consumeevidence.Tracker

	instanceResolver InstanceResolver
	verbose          bool
	timings          *timingAccumulator
}

func NewWithInstanceResolver(ctx context.Context, logger *slog.Logger, res InstanceResolver) *State {
	s := &State{
		logger:           logger,
		Units:            unitdb.New(),
		CurrentZone:      zoner.NewLocation(),
		instanceResolver: res,
		Instances:        make([]*instances.Hookable, 0),
		Auras:            auras.New(nil), // nil mods: no dataset modifier plumbing available yet
		ConsumeTracker:   consumeevidence.NewTracker(nil),
		verbose:          parseoptions.IsVerbose(ctx),
		timings: newTimingAccumulator(
			"encounter_state.total",
			"encounter_state.zone",
			"encounter_state.instance_process",
		),
	}
	return s
}

func New(ctx context.Context, logger *slog.Logger, reg *registry.Registry) *State {
	return NewWithInstanceResolver(ctx, logger, func(verbose bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
		return reg.GetInstance(ctx, verbose, z, db, reg.Flavor())
	})
}

// nolint: staticcheck
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
	case *messages.Versions:
		s.CurrentVersions = typed
	case *messages.Zone:
		if s.instanceResolver != nil {
			zoneStart := time.Now()
			s.Zone(*typed)
			s.timings.Add("encounter_state.zone", time.Since(zoneStart))
		}
	case *messages.Damage:
		//s.Damage(typed)
	case *messages.Cast:
		//s.CastV2(typed)
	case *messages.Slain:
		//s.Slain(typed)
	}

	// Process instance hooks BEFORE updating canonical aura state so that
	// projection sees the pre-message tracker snapshot. This ensures the
	// pull-starting message's aura is not duplicated by projection.
	if s.CurrentInstance != nil {
		instanceStart := time.Now()
		err := s.CurrentInstance.Process(m)
		s.timings.Add("encounter_state.instance_process", time.Since(instanceStart))
		if err != nil {
			return fmt.Errorf("instance process: %w", err)
		}
	}

	// Process consume evidence at the parse level (once, after instance hooks).
	// This records direct item-use and aura episodes parse-wide so every
	// per-instance Collector can read shared state.
	s.ConsumeTracker.Process(m)

	// Process aura messages at the parse level (once, after instance hooks).
	// This ordering ensures projection captures the pre-message canonical
	// snapshot while still maintaining parse-wide aura tracking.
	s.Auras.Process(m)

	return nil
}

// Finalize performs parse-level cleanup. Call once after all messages have been
// processed and all instances have been finalized.
func (s *State) Finalize() {
	s.Auras.Finalize()
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
	result := s.CurrentZone.Process(z)
	switch result {
	case zone.NoChange:
		return
	case zone.InfoUpdated:
		// Late-arriving difficulty info: propagate to current instance without
		// creating a new hookable.
		if s.CurrentInstance != nil {
			s.CurrentInstance.UpdateZoneDifficulty(s.CurrentZone.Zone)
			s.logger.Info("Updated zone difficulty info",
				slog.String("zone_name", z.Name),
				slog.String("difficulty", s.CurrentZone.DifficultyName),
				slog.Int("max_players", s.CurrentZone.MaxPlayers),
			)
		}
		return
	case zone.DifficultyChanged:
		// Difficulty changed within the same zone: match only an existing
		// instance that has the same difficulty, otherwise create a new one.
		// This lets 10N → 25H → 10N reuse the original 10N hookable.
		s.matchOrCreateInstance(z, true)
		return
	case zone.ZoneChanged:
		// Different zone entirely: match by name/mapID only.
	}

	s.matchOrCreateInstance(z, false)
}

// matchOrCreateInstance looks for an existing hookable that matches z. When
// requireDifficultyMatch is true the candidate must also have the same
// difficulty settings (used for DifficultyChanged). If no match is found a
// new hookable is created via the instance resolver.
func (s *State) matchOrCreateInstance(z messages.Zone, requireDifficultyMatch bool) {
	matched := false
	for _, inst := range s.Instances {
		if !inst.MatchesZone(z.Zone) {
			continue
		}
		if requireDifficultyMatch && !inst.CurrentZone.DifficultyEquals(z.Zone) {
			continue
		}
		s.CurrentInstance = inst
		matched = true
		s.logger.Info("Matched existing instance",
			slog.String("name", inst.Name()),
		)
	}

	if !matched {
		s.CurrentInstance = s.instanceResolver(s.verbose, z.Zone, s.Units)
		if s.CurrentInstance != nil {
			// Set any initial realm state that we have
			s.CurrentInstance.SetRealm(s.CurrentRealm)
			if s.CurrentVersions != nil {
				s.CurrentInstance.SetVersions(s.CurrentVersions.Versions, s.CurrentVersions.Player)
			}
			// Attach a projection adapter so the instance can project
			// parse-wide aura state into encounter event streams.
			s.CurrentInstance.AttachAuraProjection(s.Auras)
			// Attach consume collector for item-use and
			// pre-pull buff evidence.
			s.CurrentInstance.AttachConsumeCollector(s.Auras, s.ConsumeTracker)
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
