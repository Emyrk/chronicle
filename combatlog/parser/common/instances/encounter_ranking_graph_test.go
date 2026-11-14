package instances

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func rankingGraphRegistry(t *testing.T) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterEncounterRankingGraph(r))
	require.NoError(t, encounterevents.RegisterGraphOwners(r))
	require.NoError(t, rankings.RegisterDPSGraphOwner(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	return r
}

func rankingGraphFixture(t *testing.T) (*EncounterRankingGraph, *messages.Damage, uuid.UUID) {
	t.Helper()
	caster := guid.GUID(1)
	target := guid.GUID(0xF130000065000001)
	units := unitdb.New()
	units.Info[caster] = unitinfo.Info{Guid: caster, IsPlayer: true, CanCooperate: true}
	units.Info[target] = unitinfo.Info{Guid: target}
	root := &EncounterRankingGraph{InProgress: encounterevents.New(false), Finalized: encounterevents.NewEvents(), DPS: rankings.NewDPSTracker(units, nil, rankings.DamageRuleNone)}
	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	d := &messages.Damage{MessageBase: messages.Base(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)), Caster: &caster, Target: target, Amount: 100}
	root.DPS.FightStarted(id, d)
	require.NoError(t, root.DPS.ProcessMessage(true, id, d))
	require.NoError(t, root.InProgress.Process(d))
	require.NoError(t, root.InProgress.Process(&messages.Slain{MessageBase: messages.Base(d.Date().Add(time.Second)), Victim: target, Attribution: d}))
	root.Finalized.Damage = []byte{1, 2, 3}
	return root, d, id
}

func graphDamage(t *testing.T, root *EncounterRankingGraph) *messages.Damage {
	t.Helper()
	var eventDamage, rankingDamage *messages.Damage
	_, err := root.InProgress.CaptureState(func(_ int, d *messages.Damage) (string, error) { eventDamage = d; return "/damage", nil })
	require.NoError(t, err)
	_, err = root.DPS.CaptureState(func(d *messages.Damage) (string, error) { rankingDamage = d; return "/damage", nil })
	require.NoError(t, err)
	require.NotNil(t, eventDamage)
	require.Same(t, eventDamage, rankingDamage)
	return eventDamage
}

func TestEncounterRankingGraphDiskRoundTripAndContinuation(t *testing.T) {
	t.Parallel()
	registry := rankingGraphRegistry(t)
	original, damage, id := rankingGraphFixture(t)
	snapshot, err := registry.Capture(original)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "component.json")
	require.NoError(t, os.WriteFile(path, wire, 0600))
	disk, err := os.ReadFile(path)
	require.NoError(t, err)
	var decoded ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(disk, &decoded))
	restore := func() *EncounterRankingGraph {
		// Fresh registry too: restoration must not retain original object pointers.
		value, err := rankingGraphRegistry(t).Restore(decoded)
		require.NoError(t, err)
		return value.(*EncounterRankingGraph)
	}
	restored, independent := restore(), restore()
	restoredDamage := graphDamage(t, restored)
	independentDamage := graphDamage(t, independent)
	require.NotSame(t, damage, restoredDamage)
	require.NotSame(t, restoredDamage, independentDamage)
	require.Equal(t, damage, restoredDamage)
	require.Equal(t, original.Finalized, restored.Finalized)
	restored.Finalized.Damage[0] = 9
	require.Equal(t, byte(1), original.Finalized.Damage[0])
	require.Equal(t, byte(1), independent.Finalized.Damage[0])
	restored.Finalized.Damage[0] = 1

	// Eager Slain bytes must remain historical when canonical pending Damage changes.
	beforeState, err := original.InProgress.Slain.CaptureEagerState()
	require.NoError(t, err)
	before, err := beforeState.Encode()
	require.NoError(t, err)
	damage.Unranked, restoredDamage.Unranked = 7, 7
	require.Zero(t, independentDamage.Unranked)
	for _, root := range []*EncounterRankingGraph{original, restored} {
		caster := guid.GUID(1)
		suffix := &messages.Damage{MessageBase: messages.Base(damage.Date().Add(2 * time.Second)), Caster: &caster, Target: damage.Target, Amount: 200}
		require.NoError(t, root.DPS.ProcessMessage(true, id, suffix))
		require.NoError(t, root.InProgress.Process(suffix))
		root.DPS.FightEnded(id, nil)
		require.NoError(t, root.InProgress.Damage.SerializeBuffered(func(d *messages.Damage) {
			root.DPS.ClassifyDamage(id, rankings.DamageTargets{Mode: rankings.DamageTargetsEntries, EntryIDs: []uint32{999}}, d, nil)
		}))
		eagerState, err := root.InProgress.Slain.CaptureEagerState()
		require.NoError(t, err)
		eager, err := eagerState.Encode()
		require.NoError(t, err)
		require.Equal(t, before, eager)
		require.NoError(t, root.InProgress.Finalize(root.Finalized, id))
	}
	require.Equal(t, original.Finalized, restored.Finalized)
	require.Equal(t, rankingGraphDPSBytes(t, original), rankingGraphDPSBytes(t, restored))
	// Snapshot bytes and an independent restoration remain unchanged by continuation.
	after, err := json.Marshal(decoded)
	require.NoError(t, err)
	require.Equal(t, wire, after)
	require.Equal(t, int32(100), graphDamage(t, restore()).Amount)
}

func rankingGraphDPSBytes(t *testing.T, root *EncounterRankingGraph) []byte {
	t.Helper()
	state, err := root.DPS.CaptureState(func(d *messages.Damage) (string, error) { return fmt.Sprintf("/damage/%d", d.Amount), nil })
	require.NoError(t, err)
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func TestEncounterRankingGraphEagerDamage(t *testing.T) {
	t.Parallel()
	root, damage, _ := rankingGraphFixture(t)
	require.NoError(t, root.InProgress.Damage.SerializeBuffered(nil))
	damage.Amount = 999 // encoded event bytes still describe the earlier observation
	r := rankingGraphRegistry(t)
	snapshot, err := r.Capture(root)
	require.NoError(t, err)
	fresh, err := r.Restore(snapshot)
	require.NoError(t, err)
	restored := fresh.(*EncounterRankingGraph)
	a, err := root.InProgress.CaptureState(nil)
	require.NoError(t, err)
	b, err := restored.InProgress.CaptureState(nil)
	require.NoError(t, err)
	ap, err := a.Encode()
	require.NoError(t, err)
	bp, err := b.Encode()
	require.NoError(t, err)
	require.Equal(t, ap, bp)
}

func TestEncounterRankingGraphRejectsIncompleteGraphs(t *testing.T) {
	t.Parallel()
	root, _, _ := rankingGraphFixture(t)
	empty := ownergraph.NewRegistry()
	require.NoError(t, RegisterEncounterRankingGraph(empty))
	_, err := empty.Capture(root)
	require.ErrorContains(t, err, "unsupported owner")
	r := rankingGraphRegistry(t)
	_, err = r.Capture(&EncounterRankingGraph{InProgress: root.InProgress})
	require.Error(t, err)
	good, err := r.Capture(root)
	require.NoError(t, err)
	wire, err := json.Marshal(good)
	require.NoError(t, err)
	for _, mutation := range []string{"missing target", "wrong type", "unknown version", "extra field", "wrong reference type", "missing field"} {
		t.Run(mutation, func(t *testing.T) {
			t.Parallel()
			var err error
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if mutation == "missing target" && n.Kind == stategraph.KindReference {
					n.Target = "/owners/missing"
					break
				}
				if string(n.Path) != bad.Root {
					continue
				}
				var envelope map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
				switch mutation {
				case "wrong type":
					n.Type = "unknown-owner"
				case "unknown version":
					envelope["version"] = json.RawMessage("999")
				case "extra field", "wrong reference type", "missing field":
					var data map[string]json.RawMessage
					require.NoError(t, json.Unmarshal(envelope["data"], &data))
					switch mutation {
					case "extra field":
						data["unexpected"] = json.RawMessage("true")
					case "wrong reference type":
						data["dps"] = data["in_progress"]
					case "missing field":
						delete(data, "finalized")
					}
					envelope["data"], err = json.Marshal(data)
					require.NoError(t, err)
				}
				n.Metadata, err = json.Marshal(envelope)
				require.NoError(t, err)
			}
			value, err := rankingGraphRegistry(t).Restore(bad)
			require.Error(t, err)
			require.Nil(t, value)
		})
	}
}
