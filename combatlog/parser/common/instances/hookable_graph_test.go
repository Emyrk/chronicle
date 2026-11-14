package instances

import (
	"context"
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func hookableRecipe() *HookableGraphRecipe {
	return &HookableGraphRecipe{ID: "configured-test-v1", Format: database.LogFormat243CcAddon, Name: "Boss", Factories: characters.TrustedFactoryRecipe{ID: "common-v1"}, MatchesZone: func(zone.Zone) bool { return true }, Rankings: &rankings.Rankings{Damage: rankings.DamageRuleNone, Speedrun: &rankings.SpeedrunRules{Requirements: []rankings.SpeedrunRequirement{{Name: "boss", EntryIDs: []uint32{100}, Count: 1}}}}}
}
func hookableIDRecipe() identifier.TrustedRecipe {
	return identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
}
func hookableGraphRegistry(t *testing.T, recipe *HookableGraphRecipe, configured ...*Hookable) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	rules := []rankings.SpeedrunRules{*recipe.Rankings.Speedrun}
	for _, name := range derivedRecipeNames(recipe) {
		if value := recipe.DerivedRankings[name]; value != nil && value.Speedrun != nil {
			rules = append(rules, *value.Speedrun)
		}
	}
	identity := snapshot.Compatibility{DatasetID: uuid.MustParse("00000000-0000-0000-0000-000000000005").String(), DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: string(recipe.Format), Flavor: ""}
	// Compatibility requires a nonempty effective flavor for configured recipes.
	identity.Flavor = "wrath"
	mods := &chrondbc.DurationModifierSet{}
	catalog := &chrondbc.ConsumableCatalog{}
	options := auras.GraphOptions{DurationModifiers: mods, Compatibility: identity}
	consumeOptions := consumeevidence.GraphOptions{Catalog: catalog, Compatibility: identity}
	if len(configured) > 0 && configured[0].Auras != nil {
		options.ObserverTracking = configured[0].Auras
		options.DurationModifiers = configured[0].Auras.GraphDurationModifiers()
		for _, hook := range configured[0].hooks {
			if col, ok := hook.(*consumeevidence.Collector); ok {
				consumeOptions.Catalog = col.GraphShared().GraphCatalog()
			}
		}
	}
	require.NoError(t, auras.RegisterGraphOwners(r, options))
	require.NoError(t, consumeevidence.RegisterGraphOwners(r, consumeOptions))
	require.NoError(t, RegisterUnitTelemetryGraphOwner(r))
	for _, err := range []error{
		RegisterHookableGraphOwner(r, recipe), RegisterOngoingFightGraphOwner(r), RegisterPhaseTrackerGraphOwner(r, fightGraphDefinitions()),
		characters.RegisterGraphOwners(r, characters.GraphOptions{Factories: recipe.Factories, Identifier: hookableIDRecipe(), ValidateRuntime: ValidateHookableCharactersRuntime}),
		period.RegisterGraphOwners(r), unitdb.RegisterGraphOwner(r), identifier.RegisterGraphOwner(r, hookableIDRecipe()), messages.RegisterDamageGraphOwner(r),
		encounterevents.RegisterGraphOwners(r), rankings.RegisterDPSGraphOwner(r), rankings.RegisterEngagementGraphOwner(r), rankings.RegisterSurvivabilityGraphOwner(r), rankings.RegisterSpeedrunGraphOwner(r, rules), overviewmetrics.RegisterGraphOwner(r), loot.RegisterGraphOwners(r), armory.RegisterGraphOwner(r), participants.RegisterGraphOwner(r), vehicles.RegisterGraphOwner(r), raidgroups.RegisterGraphOwner(r),
	} {
		require.NoError(t, err)
	}
	return r
}
func configuredHookable(t *testing.T) (*Hookable, *HookableGraphRecipe) {
	t.Helper()
	recipe := hookableRecipe()
	idf, err := hookableIDRecipe().New()
	require.NoError(t, err)
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: recipe.Format, Flavor: recipe.Flavor})
	h, err := recipe.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(), zone.Zone{}, idf)
	require.NoError(t, err)
	require.Len(t, h.hooks, 11, "real constructor must install standard hooks, overhealing and ranking owners")
	fight := fightGraphFixture(t)
	fight.End = nil
	h.currentFight = fight
	h.explicitEncounter = fight.AuthoritativeStart
	h.deferredEncounterEnd = fight.AuthoritativeStart
	h.events.Damage = []byte{1, 2, 3}
	common := characters.NewCommonCharacter(1, h.Characters)
	common.Start("start", fight.Start.Timestamp)
	h.Characters.All.Add(common, fight.Start.Timestamp.Date())
	h.completedFights = []encounter.Fight{{EncounterID: fight.EncounterID, Hostiles: map[guid.GUID]encounter.CharacterFight{1: {ID: 1, Activity: []period.Period{{Start: fight.Start, End: fight.Start, LastActive: fight.Start}}}}, PlayerDeaths: fight.PlayerDeaths}}
	require.NoError(t, h.lootTracking.ProcessMessage(false, fight.EncounterID, &messages.Loot{MessageBase: messages.Base(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)), PlayerName: "Unresolved", ItemName: "Item", ItemID: 1, Quantity: 1}))
	return h, recipe
}
func TestHookableGraphConfiguredDiskRestore(t *testing.T) {
	t.Parallel()
	original, recipe := configuredHookable(t)
	snap, err := hookableGraphRegistry(t, recipe).Capture(original)
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "checkpoint.json")
	require.NoError(t, os.WriteFile(path, wire, 0600))
	wire, err = os.ReadFile(path)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	restore := func() *Hookable {
		r := hookableRecipe()
		value, e := hookableGraphRegistry(t, r).Restore(disk)
		require.NoError(t, e)
		return value.(*Hookable)
	}
	a, b := restore(), restore()
	require.NotSame(t, original, a)
	require.NotSame(t, a, b)
	require.True(t, a.graphAwaitingRuntime)
	require.Error(t, a.Process(messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))))
	_, err = a.Finalize(t.Context())
	require.Error(t, err)
	require.Nil(t, a.hooks[2].(*ClassificationEmitter).emit)
	require.Nil(t, a.hooks[3].(*CombatantInfoEmitter).emit)
	require.Equal(t, original.events.Damage, a.events.Damage)
	require.Same(t, a.currentFight.Start, a.completedFights[0].Hostiles[1].Activity[0].Start)
	require.Same(t, a.currentFight.PlayerDeaths[0], a.completedFights[0].PlayerDeaths[0])
	require.Same(t, a.explicitEncounter, a.deferredEncounterEnd)
	require.Same(t, a.explicitEncounter, a.currentFight.AuthoritativeStart)
	require.Same(t, a.units, a.lootTracking.GraphUnits())
	db, idf := a.Characters.GraphDependencies()
	require.Same(t, a.units, db)
	require.Same(t, a.Identifier, idf)
	// Restoring never installs hooks or runs Finalize, including loot resolution.
	require.False(t, a.finalized)
	require.True(t, a.currentFight.active())
	require.NoError(t, a.WireGraphRuntime(slog.New(slog.NewTextHandler(io.Discard, nil))))
	require.Error(t, a.WireGraphRuntime(slog.Default()))
	require.NoError(t, ValidateHookableCharactersRuntime(a.Characters))
	again, err := hookableGraphRegistry(t, a.graphRecipe).Capture(a)
	require.NoError(t, err)
	after, err := json.Marshal(again)
	require.NoError(t, err)
	require.JSONEq(t, string(wire), string(after))
	// Runtime emitters close over the restored current fight, not an old owner.
	a.currentFight = &ongoingFight{Start: a.currentFight.Start, Events: encounterevents.New(false)}
	a.hooks[3].(*CombatantInfoEmitter).emit(&messages.Combatant{MessageBase: messages.Base(time.Date(2026, 1, 1, 0, 0, 1, 0, time.UTC))})
	require.NotSame(t, a.currentFight.Events, b.currentFight.Events)
	a.events.Damage[0] = 9
	require.Equal(t, byte(1), b.events.Damage[0])
}
func TestHookableGraphFailsClosed(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"finalized", "finalizing", "extra hook", "preprocessor", "unbound callback", "derived"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			h, r := configuredHookable(t)
			switch kind {
			case "finalized":
				h.finalized = true
			case "finalizing":
				h.finalizing = true
			case "extra hook":
				h.AddHook(h.p)
			case "preprocessor":
				h.preprocessors = append(h.preprocessors, nil)
			case "unbound callback":
				h.Characters.SetNoKnownParticipantsAliveProvider(func() bool { return true })
			case "derived":
				h.derivedName = &MultiInstanceZone{}
			}
			_, err := hookableGraphRegistry(t, r).Capture(h)
			require.Error(t, err)
		})
	}
	h, r := configuredHookable(t)
	snap, err := hookableGraphRegistry(t, r).Capture(h)
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	for _, kind := range []string{"finalized", "recipe", "missing", "wrong type"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if string(n.Path) != bad.Root {
					continue
				}
				var env map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &env))
				var v hookableGraphState
				require.NoError(t, json.Unmarshal(env["data"], &v))
				switch kind {
				case "finalized":
					v.Finalized = true
				case "recipe":
					v.Recipe = "wrong"
				case "missing":
					delete(v.Refs, "current")
				case "wrong type":
					v.Refs["characters"] = v.Refs["units"]
				}
				var e error
				env["data"], e = json.Marshal(v)
				require.NoError(t, e)
				n.Metadata, e = json.Marshal(env)
				require.NoError(t, e)
			}
			_, e := hookableGraphRegistry(t, hookableRecipe()).Restore(bad)
			require.Error(t, e)
		})
	}
}

func TestHookableGraphProductionAttachmentsAndDerived(t *testing.T) {
	t.Parallel()
	makeRecipe := func() *HookableGraphRecipe {
		r := hookableRecipe()
		r.Format = database.LogFormatV22Cleu
		r.DerivedNames = map[string][]uint32{"Wing": {100}}
		r.DerivedRankings = map[string]*rankings.Rankings{"Wing": {Speedrun: &rankings.SpeedrunRules{Requirements: []rankings.SpeedrunRequirement{{Name: "wing boss", EntryIDs: []uint32{100}, Count: 1}}}}}
		return r
	}
	recipe := makeRecipe()
	idf, err := hookableIDRecipe().New()
	require.NoError(t, err)
	h, err := recipe.New(parsectx.With(t.Context(), parsectx.Context{Format: recipe.Format, Flavor: recipe.Flavor}), slog.Default(), unitdb.New(), zone.Zone{}, idf)
	require.NoError(t, err)
	h.currentFight = fightGraphFixture(t)
	h.currentFight.End = nil
	h.derivedName.cachedOverride = "Wing"
	tracker := auras.New(&chrondbc.DurationModifierSet{})
	require.NoError(t, h.AttachAuraProjection(tracker))
	require.NoError(t, h.AttachConsumeCollector(tracker, consumeevidence.NewTracker(&chrondbc.ConsumableCatalog{})))
	require.NoError(t, ValidateHookableCharactersRuntime(h.Characters))
	for _, hook := range h.hooks {
		if telemetry, ok := hook.(*UnitTelemetryEmitter); ok {
			require.NoError(t, telemetry.ProcessMessage(true, h.currentFight.EncounterID, &messages.UnitResources{MessageBase: messages.Base(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)), Unit: 1, CurrentHealth: 70, MaximumHealth: 100}))
		}
	}
	snap, err := hookableGraphRegistry(t, recipe, h).Capture(h)
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "configured.json")
	require.NoError(t, os.WriteFile(path, wire, 0600))
	disk, err := os.ReadFile(path)
	require.NoError(t, err)
	var checkpoint ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(disk, &checkpoint))
	restoredRecipe := makeRecipe()
	value, err := hookableGraphRegistry(t, restoredRecipe).Restore(checkpoint)
	require.NoError(t, err)
	restored := value.(*Hookable)
	require.Equal(t, 0, restored.Auras.GraphObserverCount())
	require.NotSame(t, h.Auras.GraphDurationModifiers(), restored.Auras.GraphDurationModifiers())
	require.Equal(t, "Wing", restored.derivedName.cachedOverride)
	require.Same(t, restored.units, restored.derivedSpeedrunTrackers["Wing"].GraphUnits())
	require.Same(t, restored.engagementTracker, restored.derivedSpeedrunTrackers["Wing"].GraphEngagement())
	for _, hook := range restored.hooks {
		if telemetry, ok := hook.(*UnitTelemetryEmitter); ok {
			require.Nil(t, telemetry.emit)
			require.Same(t, restored.Characters, telemetry.GraphCharacters())
		}
	}
	require.NoError(t, restored.WireGraphRuntime(slog.Default()))
	require.Equal(t, h.Auras.GraphObserverCount(), restored.Auras.GraphObserverCount())
	after, err := hookableGraphRegistry(t, restoredRecipe, restored).Capture(restored)
	require.NoError(t, err)
	afterJSON, err := json.Marshal(after)
	require.NoError(t, err)
	require.JSONEq(t, string(wire), string(afterJSON))
	for _, hook := range restored.hooks {
		if p, ok := hook.(*auras.Projection); ok {
			p.SetEmit(func(*messages.Aura) {})
		}
	}
	_, err = hookableGraphRegistry(t, restoredRecipe, restored).Capture(restored)
	require.ErrorContains(t, err, "callback changed")
}

func TestHookableGraphAttachmentFailureIsAtomic(t *testing.T) {
	t.Parallel()
	h, _ := configuredHookable(t)
	tracker := auras.New(&chrondbc.DurationModifierSet{})
	other := auras.New(&chrondbc.DurationModifierSet{})
	shared := consumeevidence.NewTracker(&chrondbc.ConsumableCatalog{})
	checkFailure := func(attach func() error) {
		t.Helper()
		beforeHooks := append([]instancehook.Hook(nil), h.hooks...)
		beforeCharacters, beforeParticipants, beforePhase := h.Characters.GraphRuntimeShape()
		beforeAuras := h.Auras
		beforeObservers := tracker.GraphObserverCount()
		require.Error(t, attach())
		require.Equal(t, beforeHooks, h.hooks)
		afterCharacters, afterParticipants, afterPhase := h.Characters.GraphRuntimeShape()
		require.Equal(t, beforeCharacters, afterCharacters)
		require.Equal(t, beforeParticipants, afterParticipants)
		require.Equal(t, beforePhase, afterPhase)
		require.True(t, beforeAuras == h.Auras)
		require.Equal(t, beforeObservers, tracker.GraphObserverCount())
	}
	checkFailure(func() error { return h.AttachAuraProjection(nil) })
	checkFailure(func() error { return h.AttachConsumeCollector(tracker, shared) })
	require.NoError(t, ValidateHookableCharactersRuntime(h.Characters))
	require.NoError(t, h.AttachAuraProjection(tracker))
	checkFailure(func() error { return h.AttachAuraProjection(tracker) })
	checkFailure(func() error { return h.AttachAuraProjection(other) })
	checkFailure(func() error { return h.AttachConsumeCollector(other, shared) })
	checkFailure(func() error { return h.AttachConsumeCollector(tracker, nil) })
	require.NoError(t, ValidateHookableCharactersRuntime(h.Characters))
	require.NoError(t, h.AttachConsumeCollector(tracker, shared))
	checkFailure(func() error { return h.AttachConsumeCollector(tracker, shared) })
	require.NoError(t, ValidateHookableCharactersRuntime(h.Characters))
	require.Zero(t, other.GraphObserverCount())

	// A failed atomic character binding must not register its proposed hook.
	checkFailure(func() error { return h.Characters.BindGraphRuntimeWithHook(h, nil, h.p) })
	require.NoError(t, ValidateHookableCharactersRuntime(h.Characters))

	// An already invalid binding cannot be silently accepted as legacy mode.
	h.Characters.SetPhaseTransitionCallback(nil)
	checkFailure(func() error { return h.AttachAuraProjection(tracker) })
	checkFailure(func() error { return h.AttachConsumeCollector(tracker, shared) })
	require.Error(t, ValidateHookableCharactersRuntime(h.Characters))
}

// Test-only owner exercises ordered recipe validation independently of Wrath.
type orderedGraphPreprocessor struct{ Name string }

func (p *orderedGraphPreprocessor) ProcessMessage(messages.Message) error { return nil }

func TestHookableGraphOrderedPreprocessorRecipes(t *testing.T) {
	t.Parallel()
	h, r := configuredHookable(t)
	for _, name := range []string{"first", "second"} {
		r.Preprocessors = append(r.Preprocessors, PreprocessorGraphRecipe{ID: name, New: func() instancehook.Preprocessor { return &orderedGraphPreprocessor{Name: name} }, Validate: func(p instancehook.Preprocessor) bool {
			v, ok := p.(*orderedGraphPreprocessor)
			return ok && v != nil && v.Name == name
		}})
		h.preprocessors = append(h.preprocessors, &orderedGraphPreprocessor{Name: name})
	}
	fresh, err := r.New(parsectx.With(t.Context(), parsectx.Context{Format: r.Format, Flavor: r.Flavor}), slog.Default(), h.units, zone.Zone{}, h.Identifier)
	require.NoError(t, err)
	require.Len(t, fresh.preprocessors, 2)
	require.Equal(t, "first", fresh.preprocessors[0].(*orderedGraphPreprocessor).Name)
	require.Equal(t, "second", fresh.preprocessors[1].(*orderedGraphPreprocessor).Name)
	require.NotSame(t, h.preprocessors[0], fresh.preprocessors[0])
	registry := func() *ownergraph.Registry {
		reg := hookableGraphRegistry(t, r)
		require.NoError(t, ownergraph.Register(reg, ownergraph.Codec[orderedGraphPreprocessor]{Type: "test.orderedPreprocessor", Version: 1, Init: func() *orderedGraphPreprocessor { return new(orderedGraphPreprocessor) }, Capture: func(p *orderedGraphPreprocessor, _ *ownergraph.Capture) ([]byte, error) { return json.Marshal(p) }, Restore: func(p *orderedGraphPreprocessor, _ uint32, b []byte, _ *ownergraph.Restore) error {
			return json.Unmarshal(b, p)
		}}))
		return reg
	}
	_, err = hookableGraphRegistry(t, r).Capture(h)
	require.Error(t, err, "an explicit recipe does not bypass owner registration")
	snap, err := registry().Capture(h)
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	restored, err := registry().Restore(disk)
	require.NoError(t, err)
	next := restored.(*Hookable)
	require.Equal(t, "first", next.preprocessors[0].(*orderedGraphPreprocessor).Name)
	require.Equal(t, "second", next.preprocessors[1].(*orderedGraphPreprocessor).Name)
	require.True(t, next.graphAwaitingRuntime)
	require.NoError(t, next.WireGraphRuntime(slog.Default()))
	for _, kind := range []string{"order", "wrong owner", "missing owner", "missing recipe"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if string(n.Path) != bad.Root {
					continue
				}
				var env map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &env))
				var value hookableGraphState
				require.NoError(t, json.Unmarshal(env["data"], &value))
				switch kind {
				case "order":
					value.Preprocessors[0], value.Preprocessors[1] = value.Preprocessors[1], value.Preprocessors[0]
				case "wrong owner":
					value.Preprocessors[0].Owner = value.Preprocessors[1].Owner
				case "missing owner":
					value.Preprocessors[0].Owner = "/missing"
				case "missing recipe":
					value.Preprocessors[0].Recipe = ""
				}
				data, e := json.Marshal(value)
				require.NoError(t, e)
				env["data"] = data
				n.Metadata, e = json.Marshal(env)
				require.NoError(t, e)
			}
			_, e := registry().Restore(bad)
			require.Error(t, e)
		})
	}
}

type identifierGraphHook struct {
	instancehook.BaseHook
	ID   *identifier.Identifier
	Name string
}

func (*identifierGraphHook) Finalize(context.Context) error                         { return nil }
func (*identifierGraphHook) ProcessMessage(bool, uuid.UUID, messages.Message) error { return nil }

func TestHookableGraphOrderedIdentifierHooks(t *testing.T) {
	t.Parallel()
	_, recipe := configuredHookable(t)
	makeRecipe := func(name string) HookGraphRecipe {
		return HookGraphRecipe{ID: name, New: func(id *identifier.Identifier) instancehook.Hook { return &identifierGraphHook{ID: id, Name: name} }, Validate: func(h instancehook.Hook, id *identifier.Identifier) bool {
			v, ok := h.(*identifierGraphHook)
			return ok && v != nil && v.ID == id && v.Name == name
		}}
	}
	recipe.PrefixHooks = []HookGraphRecipe{makeRecipe("before")}
	recipe.SuffixHooks = []HookGraphRecipe{makeRecipe("after")}
	id, err := hookableIDRecipe().New()
	require.NoError(t, err)
	h, err := recipe.New(parsectx.With(t.Context(), parsectx.Context{Format: recipe.Format, Flavor: recipe.Flavor}), slog.Default(), unitdb.New(), zone.Zone{}, id)
	require.NoError(t, err)
	reg := hookableGraphRegistry(t, recipe)
	require.NoError(t, ownergraph.Register(reg, ownergraph.Codec[identifierGraphHook]{Type: "test.identifierHook", Version: 1, Init: func() *identifierGraphHook { return new(identifierGraphHook) }, Capture: func(h *identifierGraphHook, c *ownergraph.Capture) ([]byte, error) {
		ref, e := c.Ref(h.ID)
		if e != nil {
			return nil, e
		}
		return json.Marshal([]string{ref, h.Name})
	}, Restore: func(h *identifierGraphHook, _ uint32, b []byte, c *ownergraph.Restore) error {
		var v []string
		if e := json.Unmarshal(b, &v); e != nil {
			return e
		}
		id, e := ownergraph.LoadAs[*identifier.Identifier](c, v[0])
		if e != nil {
			return e
		}
		h.ID, h.Name = id, v[1]
		return nil
	}}))
	snap, err := reg.Capture(h)
	require.NoError(t, err)
	value, err := reg.Restore(snap)
	require.NoError(t, err)
	restored := value.(*Hookable)
	require.Same(t, restored.graphPrefixHooks[0], restored.hooks[0])
	require.Same(t, restored.graphSuffixHooks[0], restored.hooks[len(restored.hooks)-1])
	require.Same(t, restored.Identifier, restored.graphPrefixHooks[0].(*identifierGraphHook).ID)
	require.Same(t, restored.Identifier, restored.graphSuffixHooks[0].(*identifierGraphHook).ID)
	require.NoError(t, restored.WireGraphRuntime(slog.Default()))
	_, err = reg.Capture(restored)
	require.NoError(t, err)
	restored.graphSuffixHooks[0].(*identifierGraphHook).ID = id
	_, err = reg.Capture(restored)
	require.Error(t, err, "foreign canonical dependency must fail capture")
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	for _, kind := range []string{"order", "missing", "foreign type"} {
		t.Run(kind, func(t *testing.T) {
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if string(n.Path) != bad.Root {
					continue
				}
				var env map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &env))
				var v hookableGraphState
				require.NoError(t, json.Unmarshal(env["data"], &v))
				switch kind {
				case "order":
					v.PrefixHooks, v.SuffixHooks = v.SuffixHooks, v.PrefixHooks
				case "missing":
					v.PrefixHooks = nil
				case "foreign type":
					v.PrefixHooks[0].Owner = v.Refs["units"]
				}
				env["data"], err = json.Marshal(v)
				require.NoError(t, err)
				n.Metadata, err = json.Marshal(env)
				require.NoError(t, err)
			}
			_, err = reg.Restore(bad)
			require.Error(t, err)
		})
	}
}
