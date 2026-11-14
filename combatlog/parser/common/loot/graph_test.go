package loot

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestGraphLootAliasAndContinuation(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := New(units)
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, &messages.Loot{PlayerName: "source", ItemName: "item", ItemID: 12, Quantity: 1}))
	tracker.loot = append(tracker.loot, tracker.loot[0])
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	snapshot, err := r.Capture(tracker)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	var persisted ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &persisted))
	value, err := r.Restore(persisted)
	require.NoError(t, err)
	restored := value.(*LootTracker)
	require.NotSame(t, units, restored.GraphUnits())
	require.Same(t, restored.loot[0], restored.loot[1])
	require.NotSame(t, tracker.loot[0], restored.loot[0])
	require.Equal(t, tracker.loot, restored.loot)
	trade := &messages.LootTrade{ItemName: "item", FromPlayerName: "source", ToPlayerName: "recipient"}
	require.NoError(t, restored.ProcessMessage(false, uuid.Nil, trade))
	require.Equal(t, "recipient", restored.loot[0].ReceivedName)
	require.Zero(t, restored.loot[0].Received)
	require.Equal(t, "source", tracker.loot[0].ReceivedName)
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, trade))
	require.Equal(t, tracker.loot, restored.loot)
}
func TestLootStateRejectsMalformed(t *testing.T) {
	t.Parallel()
	for _, b := range []string{`{}`, `{"loot":[""]}`, `{"loot":[],"loot":[]}`, `{"loot":[],"extra":1}`, `{"loot":[]} {}`} {
		_, err := DecodeTrackerState(TrackerStateVersion, []byte(b))
		require.Error(t, err, b)
	}
	_, err := DecodeTrackerState(99, []byte(`{"loot":[]}`))
	require.Error(t, err)
	for _, drops := range [][]*FinalLoot{nil, {}} {
		tracker := New(unitdb.New())
		tracker.loot = drops
		s, err := tracker.CaptureState(func(*FinalLoot) (string, error) { panic("empty") })
		require.NoError(t, err)
		b, err := s.Encode()
		require.NoError(t, err)
		s, err = DecodeTrackerState(1, b)
		require.NoError(t, err)
		restored, err := s.Restore(unitdb.New(), func(string) (*FinalLoot, error) { panic("empty") })
		require.NoError(t, err)
		require.Equal(t, drops, restored.loot)
	}
	tracker := New(unitdb.New())
	tracker.loot = []*FinalLoot{nil}
	_, err = tracker.CaptureState(func(*FinalLoot) (string, error) { return "x", nil })
	require.Error(t, err)
}

func TestLootGraphRejectsMissingObservation(t *testing.T) {
	t.Parallel()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	tracker := New(unitdb.New())
	tracker.loot = []*FinalLoot{{ItemName: "item"}}
	snapshot, err := r.Capture(tracker)
	require.NoError(t, err)
	for i := range snapshot.Graph.Nodes {
		n := &snapshot.Graph.Nodes[i]
		if string(n.Path) != snapshot.Root {
			continue
		}
		var envelope struct {
			Version uint32          `json:"version"`
			Data    json.RawMessage `json:"data"`
		}
		require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
		var state trackerGraphState
		require.NoError(t, json.Unmarshal(envelope.Data, &state))
		state.State = json.RawMessage(`{"loot":["absent"]}`)
		envelope.Data, err = json.Marshal(state)
		require.NoError(t, err)
		n.Metadata, err = json.Marshal(envelope)
		require.NoError(t, err)
	}
	value, err := r.Restore(snapshot)
	require.Error(t, err)
	require.Nil(t, value)
}
