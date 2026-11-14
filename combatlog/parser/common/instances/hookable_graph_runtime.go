package instances

import (
	"context"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"log/slog"
	"reflect"
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

// HookableGraphRecipe is supplied by trusted code, never selected from an archive.
// Standard hooks use explicit recipes and canonical graph dependencies.
// Unsupported extra hooks and unregistered preprocessors fail closed.
// Keep this recipe and its functions immutable while a graph uses it.
// PreprocessorGraphRecipe authorizes one concrete owner at one ordered position.
// New is used only for fresh construction, never for restoring owner state.
// Validate is supplied by trusted code and must reject nil or foreign owners.
type PreprocessorGraphRecipe struct {
	ID       string
	New      func() instancehook.Preprocessor
	Validate func(instancehook.Preprocessor) bool
}

// HookGraphRecipe binds a dependency-aware, callback-free hook owner. It must
// not register Characters callbacks; those require their own runtime contract.
type HookGraphRecipe struct {
	ID       string
	New      func(*identifier.Identifier) instancehook.Hook
	Validate func(instancehook.Hook, *identifier.Identifier) bool
}

// AzerothCoreFallbackRecipeID authorizes the production fallback's one fixed
// policy: initial zone name and equality with its initial InstanceID. The zone
// is already retained in Hookable.CurrentZone; no function comes from archives.
const AzerothCoreFallbackRecipeID = "azerothcore/fallback/v1"

type HookableGraphRecipe struct {
	AzerothCoreFallback bool
	PrefixHooks         []HookGraphRecipe
	SuffixHooks         []HookGraphRecipe
	Preprocessors       []PreprocessorGraphRecipe
	ID                  string
	Format              database.LogFormat
	Flavor              database.WoWFlavor
	Factories           characters.TrustedFactoryRecipe
	Name                string
	Category            InstanceCategory
	MatchesZone         func(zone.Zone) bool
	Rankings            *rankings.Rankings
	DerivedRankings     map[string]*rankings.Rankings
	DerivedNames        map[string][]uint32
}

func (r *HookableGraphRecipe) New(ctx context.Context, logger *slog.Logger, units *unitdb.Units, z zone.Zone, idf *identifier.Identifier) (*Hookable, error) {
	if r == nil || r.ID == "" || (r.MatchesZone == nil && !r.AzerothCoreFallback) {
		return nil, fmt.Errorf("unsupported or incomplete Hookable graph recipe")
	}
	format, _ := parsectx.Format(ctx)
	flavor, _ := parsectx.Flavor(ctx)
	if format != r.Format || flavor.CanonicalKey() != r.Flavor.CanonicalKey() {
		return nil, fmt.Errorf("Hookable format/flavor recipe mismatch")
	}
	preprocessors := make([]instancehook.Preprocessor, len(r.Preprocessors))
	for i, recipe := range r.Preprocessors {
		if recipe.ID == "" || recipe.New == nil || recipe.Validate == nil {
			return nil, fmt.Errorf("incomplete preprocessor recipe at %d", i)
		}
		preprocessors[i] = recipe.New()
		if !recipe.Validate(preprocessors[i]) {
			return nil, fmt.Errorf("invalid fresh preprocessor at %d", i)
		}
	}
	name, matches, err := r.zoneBinding(z)
	if err != nil {
		return nil, err
	}
	h, err := newHookable(ctx, logger, units, z, InstanceParams{Name: name, Category: r.Category, MatchesZone: matches, Idf: idf, Rankings: r.Rankings, Preprocessors: preprocessors}, r)
	if err != nil {
		return nil, err
	}
	for _, group := range []struct {
		recipes []HookGraphRecipe
		dest    *[]instancehook.Hook
	}{{r.PrefixHooks, &h.graphPrefixHooks}, {r.SuffixHooks, &h.graphSuffixHooks}} {
		for _, recipe := range group.recipes {
			if recipe.ID == "" || recipe.New == nil || recipe.Validate == nil {
				return nil, fmt.Errorf("incomplete hook recipe")
			}
			hook := recipe.New(idf)
			if !recipe.Validate(hook, idf) {
				return nil, fmt.Errorf("invalid fresh hook recipe")
			}
			*group.dest = append(*group.dest, hook)
		}
	}
	if len(r.DerivedRankings) > 0 {
		h.derivedRankingRules = r.DerivedRankings
		h.derivedSpeedrunTrackers = make(map[string]*rankings.SpeedrunTracker)
		if h.dpsTracker == nil {
			h.dpsTracker = rankings.NewDPSTracker(units, idf, rankings.DamageRuleNone)
			h.hooks = append(h.hooks, h.dpsTracker)
		}
		if h.survivabilityTracker == nil {
			h.survivabilityTracker = rankings.NewSurvivabilityTracker()
			h.hooks = append(h.hooks, h.survivabilityTracker)
		}
		for _, name := range derivedRecipeNames(r) {
			rules := r.DerivedRankings[name]
			if rules != nil && rules.Speedrun != nil {
				tracker := rankings.NewSpeedrunTracker(*rules.Speedrun, units, h.engagementTracker)
				h.derivedSpeedrunTrackers[name] = tracker
				h.hooks = append(h.hooks, tracker)
				h.Characters.RegisterHook(tracker)
			}
		}
	}
	if r.DerivedNames != nil {
		h.derivedName = NewMultiInstanceZone(r.DerivedNames)
	}
	h.hooks = append(append(append([]instancehook.Hook(nil), h.graphPrefixHooks...), h.hooks...), h.graphSuffixHooks...)
	if err = h.bindGraphRuntime(); err != nil {
		return nil, err
	}
	return h, nil
}

func (h *Hookable) graphHooks() ([]instancehook.Hook, []characters.SetHook, error) {
	if h.graphRecipe == nil {
		return nil, nil, fmt.Errorf("unsupported Hookable recipe/derived/preprocessor/aura configuration")
	}
	if err := h.validateGraphPreprocessors(); err != nil {
		return nil, nil, err
	}
	if h.Characters == nil || h.p == nil || h.g == nil || h.lootTracking == nil || h.engagementTracker == nil || h.overviewTracker == nil {
		return nil, nil, fmt.Errorf("missing Hookable owners")
	}
	var ce *ClassificationEmitter
	var cie *CombatantInfoEmitter
	var overheal *Overhealing
	var telemetry *UnitTelemetryEmitter
	var projection *auras.Projection
	var collector *consumeevidence.Collector
	for _, hook := range h.hooks {
		switch v := hook.(type) {
		case *UnitTelemetryEmitter:
			if telemetry != nil {
				return nil, nil, fmt.Errorf("duplicate telemetry")
			}
			telemetry = v
		case *auras.Projection:
			if projection != nil {
				return nil, nil, fmt.Errorf("duplicate projection")
			}
			projection = v
		case *consumeevidence.Collector:
			if collector != nil {
				return nil, nil, fmt.Errorf("duplicate consume collector")
			}
			collector = v
		case *ClassificationEmitter:
			if ce != nil {
				return nil, nil, fmt.Errorf("duplicate classification hook")
			}
			ce = v
		case *CombatantInfoEmitter:
			if cie != nil {
				return nil, nil, fmt.Errorf("duplicate combatant hook")
			}
			cie = v
		case *Overhealing:
			if overheal != nil {
				return nil, nil, fmt.Errorf("duplicate overhealing hook")
			}
			overheal = v
		}
	}
	if ce == nil || cie == nil || ce.units != h.units || ce.characters != h.Characters || ce.identifier != h.Identifier || cie.units != h.units || cie.characters != h.Characters || cie.armory != h.g {
		return nil, nil, fmt.Errorf("Hookable emitter dependency mismatch")
	}
	expected := append([]instancehook.Hook(nil), h.graphPrefixHooks...)
	expected = append(expected, h.p, h.g, ce, cie, h.lootTracking, h.engagementTracker, h.overviewTracker)
	if err := h.validateGraphExtraHooks(); err != nil {
		return nil, nil, err
	}
	set := []characters.SetHook{h.p, ce, cie}
	if h.graphRecipe.Format == database.LogFormatV22Cleu {
		if telemetry == nil || telemetry.GraphCharacters() != h.Characters {
			return nil, nil, fmt.Errorf("missing/mismatched telemetry")
		}
		expected = append(expected, telemetry)
		set = append(set, telemetry)
	}
	switch h.graphRecipe.Format {
	case database.LogFormat112aCcAddon, database.LogFormat112aSuperwowAddon, database.LogFormat243CcAddon:
		if overheal == nil {
			return nil, nil, fmt.Errorf("missing overhealing owner")
		}
		expected = append(expected, overheal)
	}
	if h.dpsTracker != nil {
		expected = append(expected, h.dpsTracker)
	}
	if h.survivabilityTracker != nil {
		expected = append(expected, h.survivabilityTracker)
	}
	if h.speedrunTracker != nil {
		expected = append(expected, h.speedrunTracker)
		set = append(set, h.speedrunTracker)
	}
	for _, name := range derivedRecipeNames(h.graphRecipe) {
		if tracker := h.derivedSpeedrunTrackers[name]; tracker != nil {
			expected = append(expected, tracker)
			set = append(set, tracker)
		}
	}
	expected = append(expected, h.graphSuffixHooks...)
	if projection != nil {
		if !h.graphAwaitingRuntime && projection.GraphRuntimeRevision() != h.graphProjectionRevision {
			return nil, nil, fmt.Errorf("projection callback changed")
		}
		if projection.GraphTracking() != h.Auras {
			return nil, nil, fmt.Errorf("projection tracker mismatch")
		}
		expected = append([]instancehook.Hook{projection}, expected...)
		set = append(set, projection)
	} else if h.Auras != nil {
		return nil, nil, fmt.Errorf("missing aura projection")
	}
	if collector != nil {
		if !h.graphAwaitingRuntime && collector.GraphRuntimeRevision() != h.graphCollectorRevision {
			return nil, nil, fmt.Errorf("collector callback changed")
		}
		if collector.GraphAuras() != h.Auras {
			return nil, nil, fmt.Errorf("collector aura mismatch")
		}
		expected = append(expected, collector)
	}
	if len(h.hooks) != len(expected) {
		return nil, nil, fmt.Errorf("unsupported extra Hookable hooks")
	}
	for i := range expected {
		if h.hooks[i] != expected[i] {
			return nil, nil, fmt.Errorf("Hookable hook order mismatch")
		}
	}
	return expected, set, nil
}
func (h *Hookable) bindGraphRuntime() error {
	_, hooks, err := h.graphHooks()
	if err != nil {
		return err
	}
	return h.Characters.BindGraphRuntime(h, hooks)
}

// ValidateHookableCharactersRuntime is an explicit trusted opt-in for
// characters.GraphOptions. Default character graph capture still rejects hooks.
func ValidateHookableCharactersRuntime(c *characters.Characters) error {
	owner, err := c.GraphRuntimeOwner()
	if err != nil {
		return err
	}
	h, ok := owner.(*Hookable)
	if !ok || h.Characters != c {
		return fmt.Errorf("character graph is not bound to its Hookable")
	}
	_, _, err = h.graphHooks()
	if err != nil {
		return err
	}
	units, idf := c.GraphDependencies()
	if units != h.units || idf != h.Identifier {
		return fmt.Errorf("character graph dependency mismatch")
	}
	return nil
}

// WireGraphRuntime installs only local callbacks after semantic restoration.
// It is once-only and never processes a message or finalizes/publishes output.
func (h *Hookable) WireGraphRuntime(logger *slog.Logger) error {
	if !h.graphAwaitingRuntime || h.graphRecipe == nil {
		return fmt.Errorf("Hookable not awaiting graph runtime")
	}
	h.logger = logger
	strategy := EmitAllActive
	if h.graphRecipe.Format == database.LogFormatAzerothcoreMod {
		strategy = EmitAllPlayers
	}
	ce := &ClassificationEmitter{units: h.units, characters: h.Characters, identifier: h.Identifier}
	cie := &CombatantInfoEmitter{units: h.units, characters: h.Characters, armory: h.g, strategy: strategy}
	ce.emit = func(m *messages.UnitClassificationEvent) { h.graphEmit(m) }
	cie.emit = func(m *messages.Combatant) { h.graphEmit(m) }
	// Replace only the two stateless emitter placeholders, retaining all tracker owners.
	for i, hook := range h.hooks {
		switch hook.(type) {
		case *ClassificationEmitter:
			h.hooks[i] = ce
		case *CombatantInfoEmitter:
			h.hooks[i] = cie
		}
	}
	_, set, err := h.graphHooks()
	if err != nil {
		return err
	}
	_, _, phase := h.Characters.GraphRuntimeShape()
	runtime := characters.CharactersRuntime{Hooks: set, NoKnownParticipantsAlive: h.p.NoKnownParticipantsAlive}
	if phase {
		runtime.PhaseTransition = func(t phases.Transition) {
			if h.currentFight != nil {
				if h.currentFight.Phases == nil {
					h.currentFight.StagedPhaseTransitions = append(h.currentFight.StagedPhaseTransitions, t)
				} else {
					h.currentFight.Phases.transition(t)
				}
			}
		}
	}
	if err = h.Characters.WireGraphRuntimeWith(runtime); err != nil {
		return err
	}
	for _, hook := range h.hooks {
		switch v := hook.(type) {
		case *UnitTelemetryEmitter:
			if err = v.WireGraphRuntime(h.graphEmit); err != nil {
				return err
			}
		case *auras.Projection:
			h.Auras.AddObserver(h.g.ObserveAura)
			v.WireGraphRuntime(func(m *messages.Aura) { h.graphEmit(m) })
			h.graphProjectionRevision = v.GraphRuntimeRevision()
		case *consumeevidence.Collector:
			v.WireGraphRuntime(func(m *messages.Consume) { h.graphEmit(m) })
			h.graphCollectorRevision = v.GraphRuntimeRevision()
		}
	}
	h.graphAwaitingRuntime = false
	return h.bindGraphRuntime()
}
func (h *Hookable) graphEmit(m messages.Message) {
	if h.currentFight != nil && h.currentFight.active() {
		if err := h.currentFight.Events.Process(m); err != nil && h.logger != nil {
			h.logger.Error("processing restored graph event", "error", err)
		}
	}
}
func (h *Hookable) validateGraphRecipe(r *HookableGraphRecipe) error {
	if r == nil {
		return fmt.Errorf("missing Hookable recipe")
	}
	name, _, err := r.zoneBinding(h.CurrentZone)
	if err != nil {
		return err
	}
	if h.graphRecipe != r || h.name != name || h.Category != r.Category || !reflect.DeepEqual(h.rankingRules, r.Rankings) || h.finalizing || h.finalized || h.flushingDeferredEnd {
		return fmt.Errorf("Hookable checkpoint recipe or lifecycle mismatch")
	}
	if h.events == nil || h.units == nil || h.Identifier == nil {
		return fmt.Errorf("missing Hookable graph dependency")
	}
	if (h.rankingRules != nil || len(r.DerivedRankings) > 0) != (h.dpsTracker != nil) || (h.rankingRules != nil || len(r.DerivedRankings) > 0) != (h.survivabilityTracker != nil) || (h.rankingRules != nil && h.rankingRules.Speedrun != nil) != (h.speedrunTracker != nil) {
		return fmt.Errorf("Hookable ranking owner mismatch")
	}
	if h.g.GraphUnits() != h.units || h.lootTracking.GraphUnits() != h.units || h.engagementTracker.GraphUnits() != h.units || h.overviewTracker.GraphUnits() != h.units {
		return fmt.Errorf("Hookable tracker units mismatch")
	}
	if h.dpsTracker != nil && h.dpsTracker.GraphUnits() != h.units {
		return fmt.Errorf("Hookable DPS units mismatch")
	}
	if h.speedrunTracker != nil && (h.speedrunTracker.GraphUnits() != h.units || h.speedrunTracker.GraphEngagement() != h.engagementTracker) {
		return fmt.Errorf("Hookable speedrun dependency mismatch")
	}
	if !reflect.DeepEqual(h.derivedRankingRules, r.DerivedRankings) {
		return fmt.Errorf("derived ranking recipe mismatch")
	}
	if (h.derivedName != nil) != (r.DerivedNames != nil) {
		return fmt.Errorf("derived name recipe mismatch")
	}
	if h.derivedName != nil && !reflect.DeepEqual(h.derivedName.config, NewMultiInstanceZone(r.DerivedNames).config) {
		return fmt.Errorf("derived name configuration mismatch")
	}
	expectedDerived := 0
	for name, rules := range r.DerivedRankings {
		if rules != nil && rules.Speedrun != nil {
			expectedDerived++
			tracker := h.derivedSpeedrunTrackers[name]
			if tracker == nil || tracker.GraphUnits() != h.units || tracker.GraphEngagement() != h.engagementTracker {
				return fmt.Errorf("derived speedrun dependency mismatch")
			}
		}
	}
	if len(h.derivedSpeedrunTrackers) != expectedDerived {
		return fmt.Errorf("unexpected derived speedrun owner")
	}
	return nil
}

func derivedRecipeNames(r *HookableGraphRecipe) []string {
	names := make([]string, 0, len(r.DerivedRankings))
	for name := range r.DerivedRankings {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func (h *Hookable) validateGraphPreprocessors() error {
	if len(h.preprocessors) != len(h.graphRecipe.Preprocessors) {
		return fmt.Errorf("preprocessor recipe count mismatch")
	}
	for i, recipe := range h.graphRecipe.Preprocessors {
		if recipe.ID == "" || recipe.New == nil || recipe.Validate == nil || !recipe.Validate(h.preprocessors[i]) {
			return fmt.Errorf("preprocessor recipe mismatch at %d", i)
		}
	}
	return nil
}

func (h *Hookable) validateGraphExtraHooks() error {
	for _, group := range []struct {
		recipes []HookGraphRecipe
		hooks   []instancehook.Hook
	}{{h.graphRecipe.PrefixHooks, h.graphPrefixHooks}, {h.graphRecipe.SuffixHooks, h.graphSuffixHooks}} {
		if len(group.recipes) != len(group.hooks) {
			return fmt.Errorf("hook recipe count mismatch")
		}
		for i, r := range group.recipes {
			if r.ID == "" || r.New == nil || r.Validate == nil || !r.Validate(group.hooks[i], h.Identifier) {
				return fmt.Errorf("hook recipe/dependency mismatch at %d", i)
			}
		}
	}
	return nil
}

// ValidateGraphSharedOwners validates the parse-wide dependency boundary without
// wiring callbacks or mutating the instance. Every configured instance must own
// exactly one aura projection and consume collector referencing these owners.
func (h *Hookable) ValidateGraphSharedOwners(units *unitdb.Units, auraTracker *auras.Tracking, consume *consumeevidence.Tracker, vehicles *vehicles.Tracker, raids *raidgroups.Tracker) error {
	if h.graphRecipe == nil || h.units != units || h.Auras != auraTracker || h.vehicleTracker != vehicles || h.raidGroupTracker != raids {
		return fmt.Errorf("instance shared owner mismatch")
	}
	if err := h.validateGraphRecipe(h.graphRecipe); err != nil {
		return err
	}
	_, setHooks, err := h.graphHooks()
	if err != nil {
		return err
	}
	if h.graphAwaitingRuntime {
		count, participants, _ := h.Characters.GraphRuntimeShape()
		if count != len(setHooks) || !participants {
			return fmt.Errorf("instance archived character runtime mismatch")
		}
	}
	if !h.graphAwaitingRuntime {
		if err := ValidateHookableCharactersRuntime(h.Characters); err != nil {
			return err
		}
	}
	projections, collectors := 0, 0
	for _, hook := range h.hooks {
		switch v := hook.(type) {
		case *auras.Projection:
			projections++
			if v.GraphTracking() != auraTracker {
				return fmt.Errorf("projection shared owner mismatch")
			}
		case *consumeevidence.Collector:
			collectors++
			if v.GraphShared() != consume || v.GraphAuras() != auraTracker {
				return fmt.Errorf("collector shared owner mismatch")
			}
		}
	}
	if projections != 1 || collectors != 1 {
		return fmt.Errorf("missing instance aura/consume composition")
	}
	return nil
}
func (h *Hookable) GraphRuntimePending() bool { return h.graphAwaitingRuntime }

// zoneBinding reconstructs only a code-defined pure matcher; it performs no
// gameplay work and invokes neither factories nor user-provided callbacks.
func (r *HookableGraphRecipe) zoneBinding(z zone.Zone) (string, func(zone.Zone) bool, error) {
	if !r.AzerothCoreFallback {
		if r.ID == AzerothCoreFallbackRecipeID || r.MatchesZone == nil {
			return "", nil, fmt.Errorf("invalid fixed zone recipe")
		}
		return r.Name, r.MatchesZone, nil
	}
	if r.ID != AzerothCoreFallbackRecipeID || r.Format != database.LogFormatAzerothcoreMod || r.Name != "" || r.Category != "" || r.MatchesZone != nil || r.Rankings != nil || len(r.DerivedNames) != 0 || len(r.DerivedRankings) != 0 || len(r.Preprocessors) != 0 || len(r.SuffixHooks) != 0 || len(r.PrefixHooks) != 1 || r.PrefixHooks[0].ID != "azerothcore.instanceHook" {
		return "", nil, fmt.Errorf("invalid AzerothCore fallback recipe")
	}
	// Zero IDs and empty names are accepted by the original production fallback.
	// Do not invent metadata constraints that would drop those observed zones.
	return z.Name, func(next zone.Zone) bool { return next.InstanceID == z.InstanceID }, nil
}
