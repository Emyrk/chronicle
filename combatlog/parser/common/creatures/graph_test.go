package creatures

import (
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestIdentityGraphSuffix(t *testing.T) {
	t.Parallel()
	r := ownergraph.NewRegistry()
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, RegisterGraphOwner(r))
	c := New(slog.Default())
	require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: "first"}}))
	death := &messages.UnitDied{}
	death.ID = guid.GUID(0xF130000001000001)
	death.Name = "Creature"
	require.NoError(t, c.Process(death))
	snap, err := r.Capture(c)
	require.NoError(t, err)
	raw, err := json.Marshal(snap)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, &snap))
	v, err := r.Restore(snap)
	require.NoError(t, err)
	got := v.(*Creatures)
	require.NotSame(t, c.Units, got.Units)
	require.Error(t, got.Process(death))
	require.NoError(t, got.WireGraphRuntime(slog.Default()))
	require.Error(t, got.WireGraphRuntime(slog.Default()))
	for _, m := range []messages.Message{&messages.Zone{Zone: zone.Zone{Name: "second"}}, death, death} {
		require.NoError(t, c.Process(m))
		require.NoError(t, got.Process(m))
	}
	expected, err := r.Capture(c)
	require.NoError(t, err)
	actual, err := r.Capture(got)
	require.NoError(t, err)
	require.Equal(t, expected, actual)
	v, err = r.Restore(snap)
	require.NoError(t, err)
	other := v.(*Creatures)
	got.ZonedUnits["first"][1] = "changed"
	require.Equal(t, "Creature", other.ZonedUnits["first"][1])
	require.NotSame(t, other.Units, got.Units)
}

func TestIdentityGraphRejectsMalformedState(t *testing.T) {
	t.Parallel()
	r := ownergraph.NewRegistry()
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, RegisterGraphOwner(r))
	snap, err := r.Capture(New(slog.Default()))
	require.NoError(t, err)
	raw, err := json.Marshal(snap)
	require.NoError(t, err)
	for _, mutate := range []func(map[string]json.RawMessage){
		func(s map[string]json.RawMessage) { delete(s, "current_zone") },
		func(s map[string]json.RawMessage) { s["zoned_units"] = json.RawMessage(`null`) },
		func(s map[string]json.RawMessage) { s["units"] = json.RawMessage(`"/missing"`) },
		func(s map[string]json.RawMessage) { s["extra"] = json.RawMessage(`1`) },
	} {
		var broken ownergraph.Snapshot
		require.NoError(t, json.Unmarshal(raw, &broken))
		for i, n := range broken.Graph.Nodes {
			if string(n.Path) != broken.Root {
				continue
			}
			var envelope struct {
				Version uint32                     `json:"version"`
				Data    map[string]json.RawMessage `json:"data"`
			}
			require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
			mutate(envelope.Data)
			broken.Graph.Nodes[i].Metadata, err = json.Marshal(envelope)
			require.NoError(t, err)
		}
		_, err = r.Restore(broken)
		require.Error(t, err)
	}
	var state graphState
	require.Error(t, decodeGraph([]byte(`{"units":"a","units":"b"}`), &state))
	require.Error(t, decodeGraph([]byte(`{} {}`), &state))
}
