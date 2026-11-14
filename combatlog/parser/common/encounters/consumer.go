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
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
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
	graphProcessing      bool
	graphFailed          bool
	graphRecipe          *GraphRecipe
	graphAwaitingRuntime bool
	graphWiringAttempted bool
	finalized            bool
	ctx                  context.Context
	logger               *slog.Logger
	spells               gamedb.SpellFetcher

	// CurrentZone is the zone the player is currently in.
	CurrentZone     *zoner.Location
	CurrentRealm    *realm.Info
	CurrentVersions *messages.Versions
	CurrentInstance *instances.Hookable
	Instances       []*instances.Hookable

	// Units holds information about all units seen so far.
	// Friendly/Foe/Relationships, etc.
	Units *unitdb.Units

	// Vehicles tracks delayed companion vehicle-control records across the full log.
	Vehicles *vehicles.Tracker

	// RaidGroups tracks companion raid-layout observations across the full log.
	RaidGroups *raidgroups.Tracker

	// Auras is the parse-wide aura tracker. It processes every aura message
	// once and persists across zone/instance switches.
	Auras *auras.Tracking

	// ConsumeTracker is the parse-wide consumable evidence tracker. It
	// records direct item-use and aura episodes plus pending pre-combat
	// evidence, and is shared by all per-instance Collectors.
	ConsumeTracker *consumeevidence.Tracker

	instanceResolver          InstanceResolver
	currentInstanceSelectedAt time.Time
	verbose                   bool
	timings                   *timingAccumulator
	instanceProcessDuration   map[*instances.Hookable]time.Duration
}

func NewWithInstanceResolver(ctx context.Context, logger *slog.Logger, res InstanceResolver) *State {
	s := &State{
		ctx:              ctx,
		logger:           logger,
		Units:            unitdb.New(),
		Vehicles:         vehicles.New(),
		RaidGroups:       raidgroups.New(),
		CurrentZone:      zoner.NewLocation(),
		instanceResolver: res,
		Instances:        make([]*instances.Hookable, 0),
		Auras:            auras.New(nil), // nil mods: no dataset modifier plumbing available yet
		// Parsing setup installs the dataset catalog before the first message is
		// processed. A nil catalog is retained here for lightweight parser tests.
		ConsumeTracker:          consumeevidence.NewTracker(nil),
		verbose:                 parseoptions.IsVerbose(ctx),
		instanceProcessDuration: make(map[*instances.Hookable]time.Duration),
		timings: newTimingAccumulator(
			"encounter_state.total",
			"encounter_state.zone",
			"encounter_state.instance_process",
		),
	}
	return s
}

// InstanceRegistry is the narrow production registry capability used by State.
// Keeping the interface here also lets registry prepare portable State recipes
// without introducing a package cycle.
type InstanceRegistry interface {
	Flavor() database.WoWFlavor
	GetInstance(context.Context, bool, zone.Zone, *unitdb.Units, database.WoWFlavor) *instances.Hookable
}

func New(ctx context.Context, logger *slog.Logger, reg InstanceRegistry) *State {
	return NewWithInstanceResolver(ctx, logger, func(verbose bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
		return reg.GetInstance(ctx, verbose, z, db, reg.Flavor())
	})
}

// SetSpellFetcher configures dataset-scoped spell resolution for UNIT_INFO aura
// snapshot reconciliation.
func (s *State) SetSpellFetcher(spells gamedb.SpellFetcher) {
	if s.graphRecipe != nil {
		s.graphRecipe = nil
	} // explicit runtime mutation invalidates graph provenance
	s.spells = spells
}

// nolint: staticcheck
func (s *State) Process(m messages.Message) (processErr error) {
	if s.graphAwaitingRuntime || s.finalized {
		return fmt.Errorf("encounter state is unwired or finalized")
	}
	if s.graphRecipe != nil {
		if s.graphProcessing || s.graphFailed {
			return fmt.Errorf("encounter graph processing is failed or reentrant")
		}
		s.graphProcessing = true
		defer func() {
			s.graphProcessing = false
			if processErr != nil {
				s.graphFailed = true
			}
		}()
	}
	totalStart := time.Now()
	defer func() {
		s.timings.Add("encounter_state.total", time.Since(totalStart))
	}()

	err := s.Units.ProcessMessage(m)
	if err != nil {
		return fmt.Errorf("units process: %w", err)
	}
	s.Vehicles.Process(m)
	s.RaidGroups.Process(m)

	if s.CurrentInstance != nil && s.CurrentInstance.ShouldSplitDerived(m) {
		z := s.CurrentInstance.CurrentZone
		z.Seen = m.Date()
		if err := s.createInstance(z); err != nil {
			return err
		}
	}

	// Capture whether this message arrived during an encounter before processing
	// it, since processing may start or end the fight.
	consumeActive := s.CurrentInstance != nil && s.CurrentInstance.FightActive()
	forwardToInstance := true
	var snapshotAuras []*messages.Aura
	switch typed := m.(type) {
	case *messages.Realm:
		s.CurrentRealm = &typed.Info
	case *messages.Versions:
		s.CurrentVersions = typed
		// Addon headers are log-wide metadata, but they may be emitted while a
		// later instance is active. Backfill missing metadata on instances already
		// discovered without replacing an instance's own header. New instances
		// receive CurrentVersions in matchOrCreateInstance.
		for _, instance := range s.Instances {
			instance.SetVersionsMessage(typed, true)
		}
	case *messages.Zone:
		if s.instanceResolver != nil {
			zoneStart := time.Now()
			if err := s.Zone(*typed); err != nil {
				return err
			}
			s.timings.Add("encounter_state.zone", time.Since(zoneStart))
		}
	case *messages.EncounterBoundary:
		if typed.Active && typed.InstanceID != 0 {
			for _, instance := range s.Instances {
				if instance.MatchesZone(zone.Zone{MapID: typed.InstanceID}) {
					s.CurrentInstance = instance
					break
				}
			}
		} else if !typed.Active {
			for _, instance := range s.Instances {
				if instance.HasExplicitEncounter(typed.EncounterID) {
					s.CurrentInstance = instance
					break
				}
			}
		}
	case *messages.Unit:
		var err error
		snapshotAuras, err = s.Auras.ReconcileUnitSnapshot(s.ctx, typed, s.spells)
		if err != nil {
			return fmt.Errorf("reconcile unit aura snapshot: %w", err)
		}
	case *messages.Damage:
		//s.Damage(typed)
	case *messages.Cast:
		//s.CastV2(typed)
	case *messages.Slain:
		//s.Slain(typed)
	case *messages.VehicleControl:
		// Vehicle records use an embedded effective timestamp and are collected
		// parse-wide. Do not send the delayed metadata message through encounter
		// processing as if it occurred at its carrier position.
		forwardToInstance = false
	case *messages.RaidGroup:
		forwardToInstance = false
		if s.CurrentInstance != nil {
			if err := s.CurrentInstance.ProcessRaidGroupMetadata(typed); err != nil {
				return fmt.Errorf("processing raid group metadata: %w", err)
			}
		}
	}

	// UNIT_INFO reconciliation already updated canonical state. When the
	// snapshot arrives during a fight, forward its synthetic differences into
	// the active encounter before the metadata carrier itself.
	if consumeActive {
		for _, aura := range snapshotAuras {
			if err := s.processInstance(s.CurrentInstance, aura); err != nil {
				return fmt.Errorf("instance process snapshot aura: %w", err)
			}
			s.ConsumeTracker.Process(aura, true)
		}
	}

	// Process instance hooks BEFORE updating canonical aura state so that
	// projection sees the pre-message tracker snapshot. This ensures the
	// pull-starting message's aura is not duplicated by projection.
	if s.CurrentInstance != nil && forwardToInstance {
		if err := s.processInstance(s.CurrentInstance, m); err != nil {
			return fmt.Errorf("instance process: %w", err)
		}
	}

	// Process consume evidence at the parse level (once, after instance hooks).
	// This records direct item-use and aura episodes parse-wide so every
	// per-instance Collector can read shared state. The active state assigns
	// observed out-of-combat instant consumes to the following encounter.
	s.ConsumeTracker.Process(m, consumeActive)

	// Process aura messages at the parse level (once, after instance hooks).
	// This ordering ensures projection captures the pre-message canonical
	// snapshot while still maintaining parse-wide aura tracking.
	s.Auras.Process(m)

	return nil
}

func (s *State) processInstance(instance *instances.Hookable, m messages.Message) error {
	start := time.Now()
	err := instance.Process(m)
	duration := time.Since(start)
	s.timings.Add("encounter_state.instance_process", duration)
	s.instanceProcessDuration[instance] += duration
	return err
}

// InstanceProcessDuration returns time spent processing events for one instance.
func (s *State) InstanceProcessDuration(instance *instances.Hookable) time.Duration {
	return s.instanceProcessDuration[instance]
}

// Finalize performs parse-level cleanup. Call once after all messages have been
// processed and all instances have been finalized.
func (s *State) Finalize() {
	if s.graphAwaitingRuntime || s.finalized {
		return
	}
	s.finalized = true
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

func (s *State) Zone(z messages.Zone) error {
	if s.graphAwaitingRuntime || s.finalized {
		return fmt.Errorf("encounter state is unwired or finalized")
	}
	result := s.CurrentZone.Process(z)
	switch result {
	case zone.NoChange:
		// A zone can retain its name and instance ID while reporting a more specific
		// map ID. Keep that map for the next encounter without splitting the run.
		if s.CurrentInstance != nil {
			s.CurrentInstance.UpdateMapID(z.MapID)
		}
		// Concatenated logs can re-enter the same zone with the same instance ID.
		// Split after the prior run has been inactive for its configured gap.
		if s.CurrentInstance == nil || !s.CurrentInstance.ShouldStartNewRun(z.Seen) {
			return nil
		}
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
		return nil
	case zone.DifficultyChanged:
		// Difficulty changed within the same zone: match only an existing
		// instance that has the same difficulty, otherwise create a new one.
		// This lets 10N → 25H → 10N reuse the original 10N hookable.
		return s.matchOrCreateInstance(z)
	case zone.ZoneChanged:
		// Different zone entirely: match by name/mapID and known difficulty.
	}

	return s.matchOrCreateInstance(z)
}

// matchOrCreateInstance looks for an existing hookable that matches z. Known
// difficulty metadata must match even when an intervening zone caused
// Location.Process to report ZoneChanged instead of DifficultyChanged. If no
// match is found, a new hookable is created via the instance resolver.
func (s *State) matchOrCreateInstance(z messages.Zone) error {
	matched := false
	for _, inst := range s.Instances {
		if !inst.MatchesZone(z.Zone) {
			continue
		}
		if inst.CurrentZone.DifficultyDiffers(z.Zone) {
			// Re-entering after an intervening zone is reported as ZoneChanged, not
			// DifficultyChanged. Known changes such as 10-player to 25-player must
			// still start a separate parsed instance.
			continue
		}
		if inst.ShouldStartNewRun(z.Seen) {
			continue
		}
		s.CurrentInstance = inst
		s.currentInstanceSelectedAt = z.Seen
		inst.UpdateMapID(z.MapID)
		if z.HasDifficulty() {
			// A synthetic zone can create the instance before the companion's real
			// zone message arrives. Preserve the existing hookable, but adopt the
			// authoritative difficulty metadata from the real message.
			inst.UpdateZoneDifficulty(z.Zone)
		}
		matched = true
		s.logger.Info("Matched existing instance",
			slog.String("name", inst.Name()),
		)
	}

	if !matched {
		if err := s.createInstance(z.Zone); err != nil {
			return err
		}
	}

	s.logger.Info(fmt.Sprintf("Zone changed to %q (instance %d)", z.Name, z.InstanceID),
		slog.String("zone_name", z.Name),
		slog.Uint64("instance_id", uint64(z.InstanceID)),
		slog.String("exited_from", s.CurrentZone.Name),
		slog.Uint64("exited_instance_id", uint64(s.CurrentZone.InstanceID)),
		slog.Time("seen", z.Seen),
	)
	return nil
}

const syntheticZoneMetadataWindow = time.Second

// shouldAdoptUnmatchedInstanceMetadata recognizes the authoritative localized
// zone message that can immediately follow a synthetic, registry-known zone.
// The localized name may not resolve independently, but its difficulty metadata
// still belongs to the already-selected instance.
func shouldAdoptUnmatchedInstanceMetadata(current *instances.Hookable, selectedAt time.Time, z zone.Zone) bool {
	if current == nil || !current.CurrentZone.IsInstance || !z.IsInstance {
		return false
	}
	if current.CurrentZone.InstanceID != 0 && z.InstanceID != 0 && current.CurrentZone.InstanceID != z.InstanceID {
		return false
	}
	if selectedAt.IsZero() || z.Seen.IsZero() {
		return false
	}
	if z.Seen.Sub(selectedAt).Abs() > syntheticZoneMetadataWindow {
		return false
	}
	return current.CurrentZone.InstanceType == "" || z.InstanceType == "" || current.CurrentZone.InstanceType == z.InstanceType
}

func (s *State) createInstance(z zone.Zone) error {
	instance := s.instanceResolver(s.verbose, z, s.Units)
	if instance == nil {
		if shouldAdoptUnmatchedInstanceMetadata(s.CurrentInstance, s.currentInstanceSelectedAt, z) {
			s.CurrentInstance.UpdateZoneDifficulty(z)
			return nil
		}
		s.CurrentInstance = nil
		s.currentInstanceSelectedAt = time.Time{}
		return nil
	}

	instance.SetRealm(s.CurrentRealm)
	if s.CurrentVersions != nil {
		instance.SetVersionsMessage(s.CurrentVersions, false)
	}
	// These trackers are parse-wide and intentionally shared across instance segments.
	instance.AttachVehicleTracker(s.Vehicles)
	if err := instance.AttachAuraAndConsume(s.Auras, s.ConsumeTracker); err != nil {
		return fmt.Errorf("attach aura/consume adapters: %w", err)
	}
	instance.AttachRaidGroupTracker(s.RaidGroups)
	s.CurrentInstance = instance
	s.currentInstanceSelectedAt = z.Seen
	s.logger.Info("Matched new instance", slog.String("name", s.CurrentInstance.Name()))
	s.Instances = append(s.Instances, s.CurrentInstance)
	return nil
}
