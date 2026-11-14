package instances

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/Emyrk/chronicle/internal/timings"
)

const hookableGraphType = "instances.hookable"
const hookableGraphVersion uint32 = 5

type preprocessorGraphRef struct {
	Recipe string `json:"recipe"`
	Owner  string `json:"owner"`
}
type hookableGraphState struct {
	VariantRecipe string                 `json:"variant_recipe"`
	RealmRef      string                 `json:"realm_ref"`
	VersionsRef   string                 `json:"versions_ref"`
	PrefixHooks   []preprocessorGraphRef `json:"prefix_hooks"`
	SuffixHooks   []preprocessorGraphRef `json:"suffix_hooks"`
	Preprocessors []preprocessorGraphRef `json:"preprocessors"`
	Derived       map[string]string      `json:"derived"`
	DerivedName   *string                `json:"derived_name"`
	Recipe        string                 `json:"recipe"`
	Zone          zone.Zone              `json:"zone"`
	MapID         uint32                 `json:"map_id"`
	Verbose       bool                   `json:"verbose"`
	Realm         *realm.Info            `json:"realm"`
	Versions      map[string]string      `json:"versions"`
	Recorder      *guid.GUID             `json:"recorder"`
	LastActivity  time.Time              `json:"last_activity"`
	LastProcessed time.Time              `json:"last_processed"`
	IgnoredEnds   map[int32]struct{}     `json:"ignored_ends"`
	BossDeathEnds bool                   `json:"boss_death_ends"`
	Finalizing    bool                   `json:"finalizing"`
	Finalized     bool                   `json:"finalized"`
	Flushing      bool                   `json:"flushing"`
	Refs          map[string]string      `json:"refs"`
	Completed     []fightGraphValue      `json:"completed"`
	Overheal      json.RawMessage        `json:"overheal"`
}
type fightGraphValue struct {
	// Fight contains only value observations; its pointer-bearing activity and
	// death fields are represented separately below, never marshaled inline.
	Value    encounter.Fight                   `json:"value"`
	Hostiles map[guid.GUID]characterFightGraph `json:"hostiles"`
	Deaths   []string                          `json:"deaths"`
}
type characterFightGraph struct {
	ID       guid.GUID          `json:"id"`
	Activity []periodGraphValue `json:"activity"`
}
type periodGraphValue struct {
	Start string          `json:"start"`
	End   string          `json:"end"`
	Last  string          `json:"last"`
	State period.EndState `json:"state"`
}

func captureCompletedFight(f encounter.Fight, c *ownergraph.Capture) (fightGraphValue, error) {
	v := fightGraphValue{Value: f}
	v.Value.Hostiles = nil
	v.Value.PlayerDeaths = nil
	if f.Hostiles != nil {
		v.Hostiles = make(map[guid.GUID]characterFightGraph, len(f.Hostiles))
	}
	for id, ch := range f.Hostiles {
		cv := characterFightGraph{ID: ch.ID}
		if ch.Activity != nil {
			cv.Activity = make([]periodGraphValue, len(ch.Activity))
		}
		for i, p := range ch.Activity {
			pv := periodGraphValue{State: p.EndState}
			var err error
			for _, x := range []struct {
				m    *period.Moment
				dest *string
			}{{p.Start, &pv.Start}, {p.End, &pv.End}, {p.LastActive, &pv.Last}} {
				if x.m != nil {
					*x.dest, err = c.Ref(x.m)
					if err != nil {
						return v, err
					}
				}
			}
			cv.Activity[i] = pv
		}
		v.Hostiles[id] = cv
	}
	if f.PlayerDeaths != nil {
		v.Deaths = make([]string, len(f.PlayerDeaths))
	}
	for i, m := range f.PlayerDeaths {
		ref, err := c.Ref(m)
		if err != nil {
			return v, err
		}
		v.Deaths[i] = ref
	}
	return v, nil
}
func restoreCompletedFight(v fightGraphValue, c *ownergraph.Restore) (encounter.Fight, error) {
	f := v.Value
	if f.Hostiles != nil || f.PlayerDeaths != nil {
		return f, fmt.Errorf("inline completed fight references forbidden")
	}
	if v.Hostiles != nil {
		f.Hostiles = make(map[guid.GUID]encounter.CharacterFight, len(v.Hostiles))
	}
	for id, ch := range v.Hostiles {
		if ch.ID != id {
			return f, fmt.Errorf("completed character identity mismatch")
		}
		cv := encounter.CharacterFight{ID: ch.ID}
		if ch.Activity != nil {
			cv.Activity = make([]period.Period, len(ch.Activity))
		}
		for i, p := range ch.Activity {
			pv := period.Period{EndState: p.State}
			var err error
			for _, x := range []struct {
				ref  string
				dest **period.Moment
			}{{p.Start, &pv.Start}, {p.End, &pv.End}, {p.Last, &pv.LastActive}} {
				if x.ref != "" {
					*x.dest, err = ownergraph.LoadAs[*period.Moment](c, x.ref)
					if err != nil {
						return f, err
					}
				}
			}
			cv.Activity[i] = pv
		}
		f.Hostiles[id] = cv
	}
	if v.Deaths != nil {
		f.PlayerDeaths = make([]messages.Message, len(v.Deaths))
	}
	for i, ref := range v.Deaths {
		m, err := ownergraph.LoadAs[messages.Message](c, ref)
		if err != nil {
			return f, err
		}
		f.PlayerDeaths[i] = m
	}
	return f, nil
}

// RegisterHookableGraphOwner registers a pre-Finalize aggregate bound to one
// trusted recipe. All referenced leaf owners must be explicitly registered.
func RegisterHookableGraphOwner(r *ownergraph.Registry, recipes ...*HookableGraphRecipe) error {
	byID := make(map[string]*HookableGraphRecipe, len(recipes))
	allowed := make(map[*HookableGraphRecipe]bool, len(recipes))
	if len(recipes) == 0 {
		return fmt.Errorf("missing Hookable graph recipe")
	}
	for _, recipe := range recipes {
		if recipe == nil || recipe.ID == "" || byID[recipe.ID] != nil {
			return fmt.Errorf("missing or duplicate Hookable graph recipe")
		}
		byID[recipe.ID] = recipe
		allowed[recipe] = true
	}
	if err := RegisterMetadataGraphOwners(r); err != nil {
		return err
	}
	return ownergraph.Register(r, ownergraph.Codec[Hookable]{Type: hookableGraphType, Version: hookableGraphVersion, Init: func() *Hookable { return new(Hookable) },
		Capture: func(h *Hookable, c *ownergraph.Capture) ([]byte, error) {
			recipe := h.graphRecipe
			if !allowed[recipe] {
				return nil, fmt.Errorf("unregistered Hookable recipe")
			}
			if err := h.validateGraphRecipe(recipe); err != nil {
				return nil, err
			}
			if err := ValidateHookableCharactersRuntime(h.Characters); err != nil {
				return nil, err
			}
			v := hookableGraphState{VariantRecipe: recipe.variantRecipeID(), Recipe: recipe.ID, Zone: h.CurrentZone, MapID: h.activeMapID, Verbose: h.verbose, Realm: h.realm, Versions: h.versions, Recorder: h.recorderGUID, LastActivity: h.lastActivity, LastProcessed: h.lastProcessedAt, IgnoredEnds: h.ignoredEncounterEnds, BossDeathEnds: h.bossDeathEndsExplicitFight, Refs: map[string]string{}}
			if h.realm != nil {
				ref, err := c.Ref(h.realm)
				if err != nil {
					return nil, err
				}
				v.RealmRef = ref
				v.Realm = nil
			}
			if h.graphVersionsMessage != nil {
				ref, err := c.Ref(h.graphVersionsMessage)
				if err != nil {
					return nil, err
				}
				v.VersionsRef = ref
				v.Versions = nil
				v.Recorder = nil
			}
			v.Preprocessors = make([]preprocessorGraphRef, len(h.preprocessors))
			for i, owner := range h.preprocessors {
				ref, err := c.Ref(owner)
				if err != nil {
					return nil, err
				}
				v.Preprocessors[i] = preprocessorGraphRef{Recipe: recipe.Preprocessors[i].ID, Owner: ref}
			}
			for _, group := range []struct {
				recipes []HookGraphRecipe
				hooks   []instancehook.Hook
				refs    *[]preprocessorGraphRef
			}{{recipe.PrefixHooks, h.graphPrefixHooks, &v.PrefixHooks}, {recipe.SuffixHooks, h.graphSuffixHooks, &v.SuffixHooks}} {
				for i, hook := range group.hooks {
					ref, err := c.Ref(hook)
					if err != nil {
						return nil, err
					}
					*group.refs = append(*group.refs, preprocessorGraphRef{Recipe: group.recipes[i].ID, Owner: ref})
				}
			}
			owners := map[string]any{"units": h.units, "identifier": h.Identifier, "characters": h.Characters, "events": h.events, "armory": h.g, "participants": h.p, "loot": h.lootTracking, "engagement": h.engagementTracker, "overview": h.overviewTracker}
			var telemetry *UnitTelemetryEmitter
			var projection *auras.Projection
			var collector *consumeevidence.Collector
			for _, hook := range h.hooks {
				switch o := hook.(type) {
				case *UnitTelemetryEmitter:
					telemetry = o
				case *auras.Projection:
					projection = o
				case *consumeevidence.Collector:
					collector = o
				}
			}
			optional := []struct {
				key     string
				present bool
				owner   any
			}{{"auras", h.Auras != nil, h.Auras}, {"telemetry", telemetry != nil, telemetry}, {"projection", projection != nil, projection}, {"collector", collector != nil, collector}, {"current", h.currentFight != nil, h.currentFight}, {"explicit", h.explicitEncounter != nil, h.explicitEncounter}, {"deferred", h.deferredEncounterEnd != nil, h.deferredEncounterEnd}, {"dps", h.dpsTracker != nil, h.dpsTracker}, {"survivability", h.survivabilityTracker != nil, h.survivabilityTracker}, {"speedrun", h.speedrunTracker != nil, h.speedrunTracker}, {"vehicles", h.vehicleTracker != nil, h.vehicleTracker}, {"raidgroups", h.raidGroupTracker != nil, h.raidGroupTracker}}
			for _, o := range optional {
				v.Refs[o.key] = ""
				if o.present {
					owners[o.key] = o.owner
				}
			}
			// Fixed reference ordering keeps graph allocation deterministic.
			for _, key := range hookableRefKeys {
				if owner, ok := owners[key]; ok {
					ref, err := c.Ref(owner)
					if err != nil {
						return nil, err
					}
					v.Refs[key] = ref
				}
			}
			if h.derivedName != nil {
				name := h.derivedName.cachedOverride
				v.DerivedName = &name
			}
			if h.derivedSpeedrunTrackers != nil {
				v.Derived = make(map[string]string, len(h.derivedSpeedrunTrackers))
			}
			for _, name := range derivedRecipeNames(recipe) {
				if tracker := h.derivedSpeedrunTrackers[name]; tracker != nil {
					ref, err := c.Ref(tracker)
					if err != nil {
						return nil, err
					}
					v.Derived[name] = ref
				}
			}
			if h.completedFights != nil {
				v.Completed = make([]fightGraphValue, len(h.completedFights))
			}
			for i, f := range h.completedFights {
				value, err := captureCompletedFight(f, c)
				if err != nil {
					return nil, err
				}
				v.Completed[i] = value
			}
			for _, hook := range h.hooks {
				if o, ok := hook.(*Overhealing); ok {
					state, err := o.CaptureState()
					if err != nil {
						return nil, err
					}
					v.Overheal, err = state.Encode()
					if err != nil {
						return nil, err
					}
				}
			}
			return json.Marshal(v)
		}, Restore: func(h *Hookable, version uint32, data []byte, c *ownergraph.Restore) error {
			if version != hookableGraphVersion {
				return fmt.Errorf("unsupported Hookable graph version")
			}
			var v hookableGraphState
			if err := decodeLeafValue(data, &v); err != nil {
				return err
			}
			recipe := byID[v.Recipe]
			if recipe == nil {
				return fmt.Errorf("unknown Hookable recipe")
			}
			if v.VariantRecipe != recipe.variantRecipeID() || v.Recipe != recipe.ID || v.Finalized || v.Finalizing || v.Flushing || len(v.Refs) != len(hookableRefKeys) {
				return fmt.Errorf("invalid Hookable checkpoint recipe/lifecycle")
			}
			for _, key := range hookableRefKeys {
				if _, ok := v.Refs[key]; !ok {
					return fmt.Errorf("missing Hookable reference %s", key)
				}
			}
			name, matches, bindingErr := recipe.zoneBinding(v.Zone)
			if bindingErr != nil {
				return bindingErr
			}
			next := Hookable{graphRecipe: recipe, graphAwaitingRuntime: true, name: name, Category: recipe.Category, MatchesZoneF: matches, rankingRules: recipe.Rankings, CurrentZone: v.Zone, activeMapID: v.MapID, verbose: v.Verbose, realm: v.Realm, versions: v.Versions, recorderGUID: v.Recorder, lastActivity: v.LastActivity, lastProcessedAt: v.LastProcessed, ignoredEncounterEnds: v.IgnoredEnds, bossDeathEndsExplicitFight: v.BossDeathEnds, timings: timings.New()}
			if v.Realm != nil {
				return fmt.Errorf("inline realm forbidden")
			}
			if v.RealmRef != "" {
				value, err := ownergraph.LoadAs[*realm.Info](c, v.RealmRef)
				if err != nil {
					return err
				}
				next.realm = value
			}
			if v.VersionsRef != "" {
				if v.Versions != nil || v.Recorder != nil {
					return fmt.Errorf("inline shared header forbidden")
				}
				value, err := ownergraph.LoadAs[*messages.Versions](c, v.VersionsRef)
				if err != nil {
					return err
				}
				next.SetVersionsMessage(value, false)
			}
			if len(v.Preprocessors) != len(recipe.Preprocessors) {
				return fmt.Errorf("preprocessor recipe count mismatch")
			}
			if v.Preprocessors != nil {
				next.preprocessors = make([]instancehook.Preprocessor, len(v.Preprocessors))
			}
			for i, ref := range v.Preprocessors {
				if ref.Recipe != recipe.Preprocessors[i].ID {
					return fmt.Errorf("preprocessor recipe order mismatch at %d", i)
				}
				owner, err := ownergraph.LoadAs[instancehook.Preprocessor](c, ref.Owner)
				if err != nil {
					return err
				}
				next.preprocessors[i] = owner
			}
			if err := next.validateGraphPreprocessors(); err != nil {
				return err
			}
			if recipe.DerivedNames != nil {
				if v.DerivedName == nil {
					return fmt.Errorf("missing derived name state")
				}
				next.derivedName = NewMultiInstanceZone(recipe.DerivedNames)
				next.derivedName.cachedOverride = *v.DerivedName
			} else if v.DerivedName != nil {
				return fmt.Errorf("unexpected derived name state")
			}
			next.derivedRankingRules = recipe.DerivedRankings
			if v.Derived != nil {
				next.derivedSpeedrunTrackers = make(map[string]*rankings.SpeedrunTracker, len(v.Derived))
			}
			for name, ref := range v.Derived {
				tracker, e := ownergraph.LoadAs[*rankings.SpeedrunTracker](c, ref)
				if e != nil {
					return e
				}
				next.derivedSpeedrunTrackers[name] = tracker
			}
			var err error
			next.units, err = ownergraph.LoadAs[*unitdb.Units](c, v.Refs["units"])
			if err != nil {
				return err
			}
			next.Identifier, err = ownergraph.LoadAs[*identifier.Identifier](c, v.Refs["identifier"])
			if err != nil {
				return err
			}
			for _, group := range []struct {
				recipes []HookGraphRecipe
				refs    []preprocessorGraphRef
				hooks   *[]instancehook.Hook
			}{{recipe.PrefixHooks, v.PrefixHooks, &next.graphPrefixHooks}, {recipe.SuffixHooks, v.SuffixHooks, &next.graphSuffixHooks}} {
				if len(group.recipes) != len(group.refs) {
					return fmt.Errorf("hook recipe count mismatch")
				}
				for i, ref := range group.refs {
					if ref.Recipe != group.recipes[i].ID {
						return fmt.Errorf("hook recipe order mismatch")
					}
					hook, err := ownergraph.LoadAs[instancehook.Hook](c, ref.Owner)
					if err != nil {
						return err
					}
					*group.hooks = append(*group.hooks, hook)
				}
			}
			if err := next.validateGraphExtraHooks(); err != nil {
				return err
			}
			next.Characters, err = ownergraph.LoadAs[*characters.Characters](c, v.Refs["characters"])
			if err != nil {
				return err
			}
			next.events, err = ownergraph.LoadAs[*encounterevents.Events](c, v.Refs["events"])
			if err != nil {
				return err
			}
			next.g, err = ownergraph.LoadAs[*armory.Tracker](c, v.Refs["armory"])
			if err != nil {
				return err
			}
			next.p, err = ownergraph.LoadAs[*participants.Tracker](c, v.Refs["participants"])
			if err != nil {
				return err
			}
			next.lootTracking, err = ownergraph.LoadAs[*loot.LootTracker](c, v.Refs["loot"])
			if err != nil {
				return err
			}
			next.engagementTracker, err = ownergraph.LoadAs[*rankings.EngagementTracker](c, v.Refs["engagement"])
			if err != nil {
				return err
			}
			next.overviewTracker, err = ownergraph.LoadAs[*overviewmetrics.Tracker](c, v.Refs["overview"])
			if err != nil {
				return err
			}
			if v.Refs["current"] != "" {
				next.currentFight, err = ownergraph.LoadAs[*ongoingFight](c, v.Refs["current"])
				if err != nil {
					return err
				}
			}
			if v.Refs["explicit"] != "" {
				next.explicitEncounter, err = ownergraph.LoadAs[*messages.EncounterBoundary](c, v.Refs["explicit"])
				if err != nil {
					return err
				}
			}
			if v.Refs["deferred"] != "" {
				next.deferredEncounterEnd, err = ownergraph.LoadAs[*messages.EncounterBoundary](c, v.Refs["deferred"])
				if err != nil {
					return err
				}
			}
			if v.Refs["dps"] != "" {
				next.dpsTracker, err = ownergraph.LoadAs[*rankings.DPSTracker](c, v.Refs["dps"])
				if err != nil {
					return err
				}
			}
			if v.Refs["survivability"] != "" {
				next.survivabilityTracker, err = ownergraph.LoadAs[*rankings.SurvivabilityTracker](c, v.Refs["survivability"])
				if err != nil {
					return err
				}
			}
			if v.Refs["speedrun"] != "" {
				next.speedrunTracker, err = ownergraph.LoadAs[*rankings.SpeedrunTracker](c, v.Refs["speedrun"])
				if err != nil {
					return err
				}
			}
			if v.Refs["vehicles"] != "" {
				next.vehicleTracker, err = ownergraph.LoadAs[*vehicles.Tracker](c, v.Refs["vehicles"])
				if err != nil {
					return err
				}
			}
			if v.Refs["raidgroups"] != "" {
				next.raidGroupTracker, err = ownergraph.LoadAs[*raidgroups.Tracker](c, v.Refs["raidgroups"])
				if err != nil {
					return err
				}
			}
			var telemetry *UnitTelemetryEmitter
			var projection *auras.Projection
			var collector *consumeevidence.Collector
			if v.Refs["auras"] != "" {
				next.Auras, err = ownergraph.LoadAs[*auras.Tracking](c, v.Refs["auras"])
				if err != nil {
					return err
				}
			}
			if v.Refs["telemetry"] != "" {
				telemetry, err = ownergraph.LoadAs[*UnitTelemetryEmitter](c, v.Refs["telemetry"])
				if err != nil {
					return err
				}
			}
			if v.Refs["projection"] != "" {
				projection, err = ownergraph.LoadAs[*auras.Projection](c, v.Refs["projection"])
				if err != nil {
					return err
				}
			}
			if v.Refs["collector"] != "" {
				collector, err = ownergraph.LoadAs[*consumeevidence.Collector](c, v.Refs["collector"])
				if err != nil {
					return err
				}
			}
			if v.Completed != nil {
				next.completedFights = make([]encounter.Fight, len(v.Completed))
			}
			for i, fight := range v.Completed {
				next.completedFights[i], err = restoreCompletedFight(fight, c)
				if err != nil {
					return err
				}
			}
			ce := &ClassificationEmitter{units: next.units, characters: next.Characters, identifier: next.Identifier}
			cie := &CombatantInfoEmitter{units: next.units, characters: next.Characters, armory: next.g}
			next.hooks = append([]instancehook.Hook(nil), next.graphPrefixHooks...)
			next.hooks = append(next.hooks, next.p, next.g, ce, cie, next.lootTracking, next.engagementTracker, next.overviewTracker)
			if telemetry != nil {
				next.hooks = append(next.hooks, telemetry)
			}
			if v.Overheal != nil && string(v.Overheal) != "null" {
				state, e := DecodeOverhealingState(OverhealingStateVersion, v.Overheal)
				if e != nil {
					return e
				}
				o := new(Overhealing)
				if e = o.RestoreState(state); e != nil {
					return e
				}
				next.hooks = append(next.hooks, o)
			}
			if next.dpsTracker != nil {
				next.hooks = append(next.hooks, next.dpsTracker)
			}
			if next.survivabilityTracker != nil {
				next.hooks = append(next.hooks, next.survivabilityTracker)
			}
			if next.speedrunTracker != nil {
				next.hooks = append(next.hooks, next.speedrunTracker)
			}
			for _, name := range derivedRecipeNames(recipe) {
				if tracker := next.derivedSpeedrunTrackers[name]; tracker != nil {
					next.hooks = append(next.hooks, tracker)
				}
			}
			next.hooks = append(next.hooks, next.graphSuffixHooks...)
			if projection != nil {
				next.hooks = append([]instancehook.Hook{projection}, next.hooks...)
			}
			if collector != nil {
				next.hooks = append(next.hooks, collector)
			}
			if err = next.validateGraphRecipe(recipe); err != nil {
				return err
			}
			if _, _, err = next.graphHooks(); err != nil {
				return err
			}
			units, idf := next.Characters.GraphDependencies()
			if units != next.units || idf != next.Identifier || next.lootTracking.GraphUnits() != next.units || next.engagementTracker.GraphUnits() != next.units || next.overviewTracker.GraphUnits() != next.units {
				return fmt.Errorf("Hookable canonical owner mismatch")
			}
			*h = next
			return nil
		}})
}

var hookableRefKeys = []string{"units", "identifier", "characters", "events", "armory", "participants", "loot", "engagement", "overview", "current", "explicit", "deferred", "dps", "survivability", "speedrun", "vehicles", "raidgroups", "auras", "telemetry", "projection", "collector"}
