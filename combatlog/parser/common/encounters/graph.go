package encounters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"time"

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
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// GraphRecipe is supplied by trusted composition. Resolver and dataset bindings
// are never chosen by archive data or invoked during restoration. Keep immutable.
type GraphRecipe struct {
	ID       string
	Resolver InstanceResolver
	// Resolve binds fresh runtime context/logger after semantic restoration. Set
	// exactly one of Resolver and Resolve; neither is invoked by graph decoding.
	Resolve           func(context.Context, *slog.Logger, bool, zone.Zone, *unitdb.Units) *instances.Hookable
	Spells            gamedb.SpellFetcher
	DurationModifiers *chrondbc.DurationModifierSet
	Catalog           consumeevidence.ConsumableCatalog
}

func (r *GraphRecipe) hasResolver() bool {
	return (r.Resolver != nil) != (r.Resolve != nil)
}

func (r *GraphRecipe) resolver(ctx context.Context, logger *slog.Logger) InstanceResolver {
	if r.Resolve == nil {
		return r.Resolver
	}
	return func(verbose bool, z zone.Zone, units *unitdb.Units) *instances.Hookable {
		return r.Resolve(ctx, logger, verbose, z, units)
	}
}

func (r *GraphRecipe) New(ctx context.Context, logger *slog.Logger) (*State, error) {
	if r == nil || r.ID == "" || !r.hasResolver() {
		return nil, fmt.Errorf("incomplete encounter graph recipe")
	}
	s := NewWithInstanceResolver(ctx, logger, r.resolver(ctx, logger))
	s.Auras = auras.New(r.DurationModifiers)
	s.ConsumeTracker = consumeevidence.NewTracker(r.Catalog)
	s.spells = r.Spells
	s.graphRecipe = r
	return s, nil
}

type encounterGraphValue struct {
	Recipe     string    `json:"recipe"`
	Units      string    `json:"units"`
	Auras      string    `json:"auras"`
	Consume    string    `json:"consume"`
	Vehicles   string    `json:"vehicles"`
	RaidGroups string    `json:"raid_groups"`
	Zone       string    `json:"zone"`
	Current    string    `json:"current"`
	Instances  []string  `json:"instances"`
	Realm      string    `json:"realm"`
	Versions   string    `json:"versions"`
	SelectedAt time.Time `json:"selected_at"`
	Verbose    bool      `json:"verbose"`
	Finalized  bool      `json:"finalized"`
}

func decodeEncounterGraph(b []byte, v *encounterGraphValue) error {
	d := json.NewDecoder(bytes.NewReader(b))
	tok, e := d.Token()
	if e != nil || tok != json.Delim('{') {
		return fmt.Errorf("invalid encounter state object")
	}
	fields := map[string]json.RawMessage{}
	for d.More() {
		tok, e := d.Token()
		if e != nil {
			return e
		}
		k := tok.(string)
		if _, ok := fields[k]; ok {
			return fmt.Errorf("duplicate encounter field")
		}
		var value json.RawMessage
		if e := d.Decode(&value); e != nil {
			return e
		}
		fields[k] = value
	}
	if _, e := d.Token(); e != nil {
		return e
	}
	if _, e := d.Token(); e != io.EOF {
		return fmt.Errorf("trailing encounter state")
	}
	required := []string{"recipe", "units", "auras", "consume", "vehicles", "raid_groups", "zone", "current", "instances", "realm", "versions", "selected_at", "verbose", "finalized"}
	if len(fields) != len(required) {
		return fmt.Errorf("invalid encounter fields")
	}
	for _, key := range required {
		if fields[key] == nil {
			return fmt.Errorf("missing encounter field %s", key)
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(b))
	decoder.DisallowUnknownFields()
	return decoder.Decode(v)
}

func (s *State) validateGraph() error {
	if s.graphRecipe == nil || s.graphRecipe.ID == "" || !s.graphRecipe.hasResolver() || s.finalized || s.graphFailed || s.graphProcessing {
		return fmt.Errorf("unbound/finalized encounter state")
	}
	if s.Units == nil || s.Auras == nil || s.ConsumeTracker == nil || s.Vehicles == nil || s.RaidGroups == nil || s.CurrentZone == nil {
		return fmt.Errorf("missing encounter owner")
	}
	if s.Auras.GraphDurationModifiers() != s.graphRecipe.DurationModifiers || s.ConsumeTracker.GraphCatalog() != s.graphRecipe.Catalog {
		return fmt.Errorf("encounter dataset dependency mismatch")
	}
	found := s.CurrentInstance == nil
	seen := map[*instances.Hookable]bool{}
	for _, h := range s.Instances {
		if h == nil || seen[h] {
			return fmt.Errorf("nil/duplicate encounter instance")
		}
		seen[h] = true
		if h == s.CurrentInstance {
			found = true
		}
		if err := h.ValidateGraphSharedOwners(s.Units, s.Auras, s.ConsumeTracker, s.Vehicles, s.RaidGroups); err != nil {
			return err
		}
		if h.GraphRuntimePending() != s.graphAwaitingRuntime {
			return fmt.Errorf("mixed encounter runtime lifecycle")
		}
	}
	if !found {
		return fmt.Errorf("current instance absent from ordered instance list")
	}
	return nil
}

func RegisterGraphOwner(r *ownergraph.Registry, recipe *GraphRecipe) error {
	if recipe == nil || recipe.ID == "" || !recipe.hasResolver() {
		return fmt.Errorf("incomplete encounter graph recipe")
	}
	return ownergraph.Register(r, ownergraph.Codec[State]{Type: "encounters.State", Version: 1, Init: func() *State { return new(State) }, Capture: func(s *State, c *ownergraph.Capture) ([]byte, error) {
		if s.graphRecipe != recipe || s.graphAwaitingRuntime {
			return nil, fmt.Errorf("encounter recipe/runtime mismatch")
		}
		if err := s.validateGraph(); err != nil {
			return nil, err
		}
		if s.Auras.GraphObserverCount() != 2*len(s.Instances) {
			return nil, fmt.Errorf("unexpected encounter aura observers")
		}
		v := encounterGraphValue{Recipe: recipe.ID, SelectedAt: s.currentInstanceSelectedAt, Verbose: s.verbose, Instances: make([]string, len(s.Instances))}
		for _, o := range []struct {
			owner any
			dest  *string
		}{{s.Units, &v.Units}, {s.Auras, &v.Auras}, {s.ConsumeTracker, &v.Consume}, {s.Vehicles, &v.Vehicles}, {s.RaidGroups, &v.RaidGroups}, {s.CurrentZone, &v.Zone}} {
			ref, e := c.Ref(o.owner)
			if e != nil {
				return nil, e
			}
			*o.dest = ref
		}
		for i, h := range s.Instances {
			ref, e := c.Ref(h)
			if e != nil {
				return nil, e
			}
			v.Instances[i] = ref
			if h == s.CurrentInstance {
				v.Current = ref
			}
		}
		if s.CurrentRealm != nil {
			ref, err := c.Ref(s.CurrentRealm)
			if err != nil {
				return nil, err
			}
			v.Realm = ref
		}
		if s.CurrentVersions != nil {
			ref, err := c.Ref(s.CurrentVersions)
			if err != nil {
				return nil, err
			}
			v.Versions = ref
		}
		return json.Marshal(v)
	}, Restore: func(s *State, version uint32, b []byte, c *ownergraph.Restore) error {
		if version != 1 {
			return fmt.Errorf("unsupported encounter graph version")
		}
		var v encounterGraphValue
		if err := decodeEncounterGraph(b, &v); err != nil {
			return err
		}
		if v.Recipe != recipe.ID || v.Finalized {
			return fmt.Errorf("encounter recipe/lifecycle mismatch")
		}
		next := State{graphRecipe: recipe, graphAwaitingRuntime: true, currentInstanceSelectedAt: v.SelectedAt, verbose: v.Verbose}
		var err error
		next.Units, err = ownergraph.LoadAs[*unitdb.Units](c, v.Units)
		if err != nil {
			return err
		}
		next.Auras, err = ownergraph.LoadAs[*auras.Tracking](c, v.Auras)
		if err != nil {
			return err
		}
		next.ConsumeTracker, err = ownergraph.LoadAs[*consumeevidence.Tracker](c, v.Consume)
		if err != nil {
			return err
		}
		next.Vehicles, err = ownergraph.LoadAs[*vehicles.Tracker](c, v.Vehicles)
		if err != nil {
			return err
		}
		next.RaidGroups, err = ownergraph.LoadAs[*raidgroups.Tracker](c, v.RaidGroups)
		if err != nil {
			return err
		}
		next.CurrentZone, err = ownergraph.LoadAs[*zoner.Location](c, v.Zone)
		if err != nil {
			return err
		}
		next.Instances = make([]*instances.Hookable, len(v.Instances))
		for i, ref := range v.Instances {
			next.Instances[i], err = ownergraph.LoadAs[*instances.Hookable](c, ref)
			if err != nil {
				return err
			}
		}
		if v.Current != "" {
			next.CurrentInstance, err = ownergraph.LoadAs[*instances.Hookable](c, v.Current)
			if err != nil {
				return err
			}
		}
		if v.Realm != "" {
			next.CurrentRealm, err = ownergraph.LoadAs[*realm.Info](c, v.Realm)
			if err != nil {
				return err
			}
		}
		if v.Versions != "" {
			next.CurrentVersions, err = ownergraph.LoadAs[*messages.Versions](c, v.Versions)
			if err != nil {
				return err
			}
		}
		if err := next.validateGraph(); err != nil {
			return err
		}
		*s = next
		return nil
	}})
}

// ValidateGraphRuntime performs read-only preflight before any observer wiring.
func (s *State) ValidateGraphRuntime(ctx context.Context, logger *slog.Logger) error {
	if ctx == nil || logger == nil || !s.graphAwaitingRuntime || s.graphWiringAttempted {
		return fmt.Errorf("encounter runtime not ready")
	}
	if err := s.validateGraph(); err != nil {
		return err
	}
	if s.Auras.GraphObserverCount() != 0 {
		return fmt.Errorf("encounter observers already attached")
	}
	return nil
}
func (s *State) WireGraphRuntime(ctx context.Context, logger *slog.Logger) error {
	if err := s.ValidateGraphRuntime(ctx, logger); err != nil {
		return err
	}
	s.graphWiringAttempted = true
	for _, h := range s.Instances {
		if err := h.WireGraphRuntime(logger); err != nil {
			return err
		}
	}
	s.ctx, s.logger, s.spells, s.instanceResolver = ctx, logger, s.graphRecipe.Spells, s.graphRecipe.resolver(ctx, logger)
	// Durations measure wall-clock work, not gameplay progress. Reset on resume.
	s.timings = newTimingAccumulator("encounter_state.total", "encounter_state.zone", "encounter_state.instance_process")
	s.instanceProcessDuration = make(map[*instances.Hookable]time.Duration)
	s.graphAwaitingRuntime = false
	return nil
}
