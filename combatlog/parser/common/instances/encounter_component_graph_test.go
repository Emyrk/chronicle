package instances

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const componentSpellType = "test.encounter-component-spell"

type componentSpellState struct {
	ID          chrondbc.SpellID `json:"id"`
	MaxDuration int32            `json:"max_duration"`
}

func encounterComponentRegistry(t *testing.T, observer ...*auras.Tracking) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterEncounterComponentGraph(r))
	require.NoError(t, RegisterEncounterRankingGraph(r))
	require.NoError(t, encounterevents.RegisterGraphOwners(r))
	require.NoError(t, rankings.RegisterDPSGraphOwner(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	options := auras.GraphOptions{}
	if len(observer) > 0 {
		options.ObserverTracking = observer[0]
	}
	require.NoError(t, auras.RegisterGraphOwners(r, options))
	require.NoError(t, vehicles.RegisterGraphOwner(r))
	require.NoError(t, raidgroups.RegisterGraphOwner(r))
	require.NoError(t, participants.RegisterGraphOwner(r))
	require.NoError(t, armory.RegisterGraphOwner(r))
	require.NoError(t, consumeevidence.RegisterGraphOwners(r, consumeevidence.GraphOptions{}))
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[chrondbc.Spell]{
		Type: componentSpellType, Version: 1,
		Init: func() *chrondbc.Spell { return new(chrondbc.Spell) },
		Capture: func(spell *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) {
			return json.Marshal(componentSpellState{ID: spell.ID, MaxDuration: spell.Duration.MaxDuration})
		},
		Restore: func(spell *chrondbc.Spell, version uint32, payload []byte, _ *ownergraph.Restore) error {
			if version != 1 {
				return fmt.Errorf("unsupported test spell version")
			}
			var state componentSpellState
			if err := json.Unmarshal(payload, &state); err != nil {
				return err
			}
			*spell = chrondbc.Spell{ID: state.ID, Duration: chrondbc.SpellDuration{MaxDuration: state.MaxDuration}}
			return nil
		},
	}))
	return r
}

func encounterComponentFixture(t *testing.T) (*EncounterComponentGraph, uuid.UUID, *chrondbc.Spell) {
	t.Helper()
	ranking, pull, fightID := rankingGraphFixture(t)
	units := ranking.DPS.GraphUnits()
	player := guid.GUID(1)
	spell := &chrondbc.Spell{ID: 17538, Duration: chrondbc.SpellDuration{MaxDuration: 120000}}

	armoryTracker := armory.New(units)
	playerMessage := &messages.Combatant{Combatant: combatant.Combatant{Guid: player, Name: "Mage", GearSetups: []combatant.GearItem{{ItemID: 100, BonusIDs: []int{2}}}}}
	require.NoError(t, units.ProcessMessage(playerMessage))
	armoryTracker.Player(playerMessage)

	auraTracker := auras.New(nil)
	auraTracker.AddObserver(armoryTracker.ObserveAura)
	auraTracker.Process(&messages.Aura{MessageBase: messages.Base(pull.Date().Add(-time.Second)), Target: player, SpellData: spell, SpellName: "Arcane Protection", IsBuff: true, State: types.AuraStateAdded, Amount: 1})
	auraProjection := auras.NewProjection(auraTracker)
	auraProjection.FightStarted(fightID, pull)

	consumeTracker := consumeevidence.NewTracker(nil)
	itemID := int32(13461)
	consumeTracker.Process(&messages.SpellGo{MessageBase: messages.Base(pull.Date().Add(-2 * time.Second)), Caster: player, ItemID: &itemID, SpellData: spell}, false)
	consumeCollector := consumeevidence.NewCollector(auraTracker, consumeTracker)
	consumeCollector.FightStarted(fightID, pull)

	vehicleTracker := vehicles.New()
	vehicleTracker.Process(&messages.Versions{MessageBase: messages.Base(pull.Date().Add(-3 * time.Second)), SessionID: "session"})
	vehicleTracker.Process(&messages.VehicleControl{MessageBase: messages.Base(pull.Date().Add(-time.Second)), Action: messages.VehicleControlAssign, VehicleGUID: guid.GUID(0xF15000812400008F), ControllerGUID: player})

	raidTracker := raidgroups.New()
	var groups [messages.RaidGroupCount][messages.RaidGroupSize]guid.GUID
	groups[0][0] = player
	raidTracker.Process(&messages.RaidGroup{MessageBase: messages.Base(pull.Date().Add(-time.Second)), Groups: groups})

	participantTracker := participants.New()
	participantTracker.Active[player] = true
	participantTracker.FightStarted(fightID, pull)

	return &EncounterComponentGraph{
		Ranking: ranking, Units: units, Auras: auraTracker, AuraProjection: auraProjection,
		Vehicles: vehicleTracker, RaidGroups: raidTracker, Participants: participantTracker,
		Armory: armoryTracker, ConsumeTracker: consumeTracker, ConsumeCollector: consumeCollector,
	}, fightID, spell
}

func TestEncounterComponentGraphDiskRestoreAndContinuation(t *testing.T) {
	t.Parallel()
	original, fightID, _ := encounterComponentFixture(t)
	registry := encounterComponentRegistry(t, original.Auras)
	snapshot, err := registry.Capture(original)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "encounter-component.json")
	require.NoError(t, os.WriteFile(path, wire, 0600))
	disk, err := os.ReadFile(path)
	require.NoError(t, err)
	var decoded ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(disk, &decoded))

	restore := func() *EncounterComponentGraph {
		value, err := encounterComponentRegistry(t).Restore(decoded)
		require.NoError(t, err)
		return value.(*EncounterComponentGraph)
	}
	restored, independent := restore(), restore()
	require.NotSame(t, original, restored)
	require.NotSame(t, restored, independent)
	require.Same(t, restored.Units, restored.Ranking.DPS.GraphUnits())
	require.Same(t, restored.Units, restored.Armory.GraphUnits())
	require.Same(t, restored.Auras, restored.AuraProjection.GraphTracking())
	require.Same(t, restored.Auras, restored.ConsumeCollector.GraphAuras())
	require.Same(t, restored.ConsumeTracker, restored.ConsumeCollector.GraphShared())

	unitsOwners, spellOwners := 0, 0
	for _, node := range decoded.Graph.Nodes {
		if node.Kind != stategraph.KindValue {
			continue
		}
		switch node.Type {
		case unitdb.StateType:
			unitsOwners++
		case componentSpellType:
			spellOwners++
		}
	}
	require.Equal(t, 1, unitsOwners)
	require.Equal(t, 1, spellOwners)

	// Per-instance observations remain detached while current metadata uses the
	// one canonical Units owner.
	restored.Units.UpdatePlayer(combatant.Combatant{Guid: 1, Name: "Mage", GearSetups: []combatant.GearItem{{ItemID: 999}}})
	current, ok := restored.Armory.CurrentPlayer(1)
	require.True(t, ok)
	require.Equal(t, 999, current.GearSetups[0].ItemID)
	require.Equal(t, 100, restored.Armory.PlayerObservations[1].GearSetups[0].ItemID)
	require.Equal(t, 100, independent.Armory.PlayerObservations[1].GearSetups[0].ItemID)
	restored.Units.UpdatePlayer(combatant.Combatant{Guid: 1, Name: "Mage", GearSetups: []combatant.GearItem{{ItemID: 100, BonusIDs: []int{2}}}})

	// Restore attached no callbacks. Explicit runtime wiring is required before
	// continuation and establishes the trusted observer order.
	var originalAuras, restoredAuras []*messages.Aura
	var originalConsumes, restoredConsumes []*messages.Consume
	original.AuraProjection.SetEmit(func(message *messages.Aura) { originalAuras = append(originalAuras, message) })
	original.ConsumeCollector.SetEmit(func(message *messages.Consume) { originalConsumes = append(originalConsumes, message) })
	require.NoError(t, restored.WireGraphRuntime(EncounterComponentRuntime{
		EmitAura:    func(message *messages.Aura) { restoredAuras = append(restoredAuras, message) },
		EmitConsume: func(message *messages.Consume) { restoredConsumes = append(restoredConsumes, message) },
	}))
	require.ErrorContains(t, restored.WireGraphRuntime(EncounterComponentRuntime{
		EmitAura:    func(*messages.Aura) { t.Fatal("duplicate aura callback installed") },
		EmitConsume: func(*messages.Consume) { t.Fatal("duplicate consume callback installed") },
	}), "already wired")

	continueEncounterComponent(t, original, fightID)
	continueEncounterComponent(t, restored, fightID)
	require.Equal(t, originalAuras, restoredAuras)
	require.Equal(t, originalConsumes, restoredConsumes)
	require.NotEmpty(t, restoredAuras)
	require.NotEmpty(t, restoredConsumes)
	require.Same(t, restoredAuras[0].SpellData, restoredConsumes[0].SpellData)

	originalAfter, err := encounterComponentRegistry(t, original.Auras).Capture(original)
	require.NoError(t, err)
	restoredAfter, err := encounterComponentRegistry(t, restored.Auras).Capture(restored)
	require.NoError(t, err)
	originalBytes, err := json.Marshal(originalAfter)
	require.NoError(t, err)
	restoredBytes, err := json.Marshal(restoredAfter)
	require.NoError(t, err)
	require.Equal(t, originalBytes, restoredBytes)

	// Snapshot bytes and the second independent restore remain reusable and frozen.
	after, err := json.Marshal(decoded)
	require.NoError(t, err)
	require.Equal(t, wire, after)
	require.Equal(t, 100, independent.Armory.PlayerObservations[1].GearSetups[0].ItemID)
}

func continueEncounterComponent(t *testing.T, root *EncounterComponentGraph, fightID uuid.UUID) {
	t.Helper()
	at := time.Date(2026, time.January, 1, 0, 0, 2, 0, time.UTC)
	caster := guid.GUID(1)
	damage := &messages.Damage{MessageBase: messages.Base(at), Caster: &caster, Target: guid.GUID(0xF130000065000001), Amount: 200}
	require.NoError(t, root.AuraProjection.ProcessMessage(true, fightID, damage))
	require.NoError(t, root.ConsumeCollector.ProcessMessage(true, fightID, damage))
	require.NoError(t, root.Participants.ProcessMessage(true, fightID, damage))
	require.NoError(t, root.Ranking.InProgress.Process(damage))
	root.Vehicles.Process(&messages.VehicleControl{MessageBase: messages.Base(at), Action: messages.VehicleControlRelease, VehicleGUID: guid.GUID(0xF15000812400008F), ControllerGUID: caster})
	var groups [messages.RaidGroupCount][messages.RaidGroupSize]guid.GUID
	groups[0][0] = caster
	groups[0][1] = 2
	root.RaidGroups.Process(&messages.RaidGroup{MessageBase: messages.Base(at), Groups: groups})
}

func TestEncounterComponentGraphCaptureRejectsInconsistentAliases(t *testing.T) {
	t.Parallel()
	root, _, _ := encounterComponentFixture(t)
	otherRanking, _, _ := rankingGraphFixture(t)
	root.Armory = armory.New(otherRanking.DPS.GraphUnits())

	_, err := encounterComponentRegistry(t).Capture(root)
	require.ErrorContains(t, err, "one canonical Units owner")
}

func TestEncounterComponentGraphRejectsMalformedDependencies(t *testing.T) {
	t.Parallel()
	root, _, _ := encounterComponentFixture(t)
	incomplete := ownergraph.NewRegistry()
	require.NoError(t, RegisterEncounterComponentGraph(incomplete))
	_, err := incomplete.Capture(root)
	require.ErrorContains(t, err, "unsupported owner")

	r := encounterComponentRegistry(t, root.Auras)
	snapshot, err := r.Capture(root)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)

	for _, mutation := range []string{"missing target", "wrong dependency type", "unsupported version", "extra root field"} {
		t.Run(mutation, func(t *testing.T) {
			t.Parallel()
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			var unitsPath, vehiclesPath string
			for _, node := range bad.Graph.Nodes {
				if node.Kind != stategraph.KindValue {
					continue
				}
				if node.Type == unitdb.StateType {
					unitsPath = string(node.Path)
				}
				if node.Type == vehicles.StateType {
					vehiclesPath = string(node.Path)
				}
			}
			for i := range bad.Graph.Nodes {
				node := &bad.Graph.Nodes[i]
				if string(node.Path) != bad.Root {
					continue
				}
				var envelope map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(node.Metadata, &envelope))
				switch mutation {
				case "unsupported version":
					envelope["version"] = json.RawMessage("999")
				case "wrong dependency type", "extra root field":
					var data map[string]json.RawMessage
					require.NoError(t, json.Unmarshal(envelope["data"], &data))
					if mutation == "wrong dependency type" {
						data["units"], _ = json.Marshal(vehiclesPath)
					} else {
						data["unexpected"] = json.RawMessage("true")
					}
					encoded, marshalErr := json.Marshal(data)
					require.NoError(t, marshalErr)
					envelope["data"] = encoded
				}
				metadata, marshalErr := json.Marshal(envelope)
				require.NoError(t, marshalErr)
				node.Metadata = metadata
			}
			if mutation == "missing target" {
				for i := range bad.Graph.Nodes {
					node := &bad.Graph.Nodes[i]
					if node.Kind == stategraph.KindReference && string(node.Target) == unitsPath {
						node.Target = "/owners/missing"
						break
					}
				}
			}
			value, err := encounterComponentRegistry(t).Restore(bad)
			require.Error(t, err)
			require.Nil(t, value)
		})
	}
}
