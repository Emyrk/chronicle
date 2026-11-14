package instances

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func fightGraphDefinitions() map[string]*phases.EncounterPhases {
	return map[string]*phases.EncounterPhases{"Boss": {EncounterName: "Boss", Definitions: []phases.Definition{{Key: "one", Name: "One", Order: 0}, {Key: "two", Name: "Two", Order: 1}}}}
}
func fightGraphRegistry(t *testing.T) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterOngoingFightGraphOwner(r))
	require.NoError(t, RegisterPhaseTrackerGraphOwner(r, fightGraphDefinitions()))
	require.NoError(t, period.RegisterGraphOwners(r))
	require.NoError(t, encounterevents.RegisterGraphOwners(r))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	return r
}
func fightGraphFixture(t *testing.T) *ongoingFight {
	t.Helper()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	damage := &messages.Damage{MessageBase: messages.Base(at), Amount: 42}
	death := &messages.Slain{MessageBase: messages.Base(at), Victim: guid.GUID(1), Attribution: damage}
	start := &period.Moment{Timestamp: death, Reason: "start"}
	success := true
	f := &ongoingFight{EncounterID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), MapID: 42, ActiveHostiles: map[guid.GUID]struct{}{2: {}}, Events: encounterevents.New(false), PlayerDeaths: []messages.Message{death, death}, Start: start, End: start, AuthoritativeName: "Boss", AuthoritativeSuccess: &success, AuthoritativeStart: &messages.EncounterBoundary{MessageBase: messages.Base(at)}, StagedPhaseTransitions: []phases.Transition{{SourceGUID: 2, ToPhaseKey: "two", Timestamp: at.Add(time.Second)}}}
	f.Phases = newPhaseTracker(fightGraphDefinitions()["Boss"], 2, *start)
	require.NotNil(t, f.Phases)
	require.NoError(t, f.Events.Process(damage))
	return f
}
func TestOngoingFightGraphDiskRoundTrip(t *testing.T) {
	t.Parallel()
	original := fightGraphFixture(t)
	snap, err := fightGraphRegistry(t).Capture(original)
	require.NoError(t, err)
	data, err := json.Marshal(snap)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "inflight.json")
	require.NoError(t, os.WriteFile(path, data, 0600))
	data, err = os.ReadFile(path)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(data, &disk))
	restore := func() *ongoingFight {
		v, e := fightGraphRegistry(t).Restore(disk)
		require.NoError(t, e)
		return v.(*ongoingFight)
	}
	a, b := restore(), restore()
	require.NotSame(t, original, a)
	require.NotSame(t, a, b)
	roundtrip, err := fightGraphRegistry(t).Capture(a)
	require.NoError(t, err)
	roundtripBytes, err := json.Marshal(roundtrip)
	require.NoError(t, err)
	require.JSONEq(t, string(data), string(roundtripBytes))
	require.Same(t, a.Start, a.End)
	require.Same(t, a.PlayerDeaths[0], a.PlayerDeaths[1])
	require.Same(t, a.Start.Timestamp, a.PlayerDeaths[0])
	require.Same(t, a.Start.Timestamp, a.Phases.fightStart.Timestamp)
	var pending *messages.Damage
	_, err = a.Events.CaptureState(func(_ int, d *messages.Damage) (string, error) { pending = d; return "damage", nil })
	require.NoError(t, err)
	require.Same(t, pending, a.PlayerDeaths[0].(*messages.Slain).Attribution)
	pending.Amount = 99
	require.EqualValues(t, 42, b.PlayerDeaths[0].(*messages.Slain).Attribution.(*messages.Damage).Amount)
	require.Equal(t, original.Phases.phases, a.Phases.phases, "restore must not open/close phases or generate IDs")
	// Restore itself does not consume staged transitions or finalize the fight.
	require.Len(t, a.StagedPhaseTransitions, 1)
	require.True(t, a.Phases.transition(a.StagedPhaseTransitions[0]))
	require.Len(t, b.Phases.phases, 1)
}
func TestOngoingFightGraphRejectsMalformedReferences(t *testing.T) {
	t.Parallel()
	snap, err := fightGraphRegistry(t).Capture(fightGraphFixture(t))
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	for _, kind := range []string{"missing target", "wrong reference type", "missing events", "bad version", "extra field"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if kind == "missing target" && n.Kind == stategraph.KindReference {
					n.Target = "/owners/missing"
					break
				}
				if string(n.Path) != bad.Root {
					continue
				}
				var envelope map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
				var v map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(envelope["data"], &v))
				switch kind {
				case "wrong reference type":
					v["start"] = v["events"]
				case "missing events":
					v["events"] = json.RawMessage(`""`)
				case "bad version":
					envelope["version"] = json.RawMessage(`99`)
				case "extra field":
					v["unexpected"] = json.RawMessage(`true`)
				}
				var e error
				envelope["data"], e = json.Marshal(v)
				require.NoError(t, e)
				n.Metadata, e = json.Marshal(envelope)
				require.NoError(t, e)
			}
			_, e := fightGraphRegistry(t).Restore(bad)
			require.Error(t, e)
		})
	}
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterOngoingFightGraphOwner(r))
	_, err = r.Capture(fightGraphFixture(t))
	require.Error(t, err)
	r = fightGraphRegistry(t)
	f := fightGraphFixture(t)
	f.Phases.defs.EncounterName = "Untrusted"
	_, err = r.Capture(f)
	require.ErrorContains(t, err, "recipe mismatch")
}

func TestOngoingFightGraphOpenAndOptionalState(t *testing.T) {
	t.Parallel()
	for _, withPhases := range []bool{false, true} {
		t.Run(map[bool]string{false: "without phases", true: "with phases"}[withPhases], func(t *testing.T) {
			t.Parallel()
			f := fightGraphFixture(t)
			f.End = nil
			if !withPhases {
				f.Phases = nil
				f.StagedPhaseTransitions = nil
			}
			f.AuthoritativeStart = nil
			f.AuthoritativeSuccess = nil
			f.PlayerDeaths = nil
			f.Difficulty = "Heroic"
			difficulty := f.Difficulty
			f.ZoneDifficulty = &difficulty
			snap, err := fightGraphRegistry(t).Capture(f)
			require.NoError(t, err)
			value, err := fightGraphRegistry(t).Restore(snap)
			require.NoError(t, err)
			restored := value.(*ongoingFight)
			require.True(t, restored.active())
			require.Nil(t, restored.End)
			require.Equal(t, f.Difficulty, restored.Difficulty)
			require.Equal(t, f.ZoneDifficulty, restored.ZoneDifficulty)
			require.NotSame(t, f.ZoneDifficulty, restored.ZoneDifficulty)
			require.Nil(t, restored.AuthoritativeStart)
			require.Nil(t, restored.AuthoritativeSuccess)
			require.Nil(t, restored.PlayerDeaths)
			require.Equal(t, withPhases, restored.Phases != nil)
		})
	}
}

func TestOngoingFightGraphRejectsUntrustedRestoreRecipe(t *testing.T) {
	t.Parallel()
	snap, err := fightGraphRegistry(t).Capture(fightGraphFixture(t))
	require.NoError(t, err)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterOngoingFightGraphOwner(r))
	definitions := fightGraphDefinitions()
	definitions["Boss"].Definitions[0].Name = "Changed"
	require.NoError(t, RegisterPhaseTrackerGraphOwner(r, definitions))
	require.NoError(t, period.RegisterGraphOwners(r))
	require.NoError(t, encounterevents.RegisterGraphOwners(r))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	_, err = r.Restore(snap)
	require.ErrorContains(t, err, "recipe mismatch")
}
