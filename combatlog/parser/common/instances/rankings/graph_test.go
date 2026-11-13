package rankings

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestDPSGraphCanonicalDependencies(t *testing.T) {
	t.Parallel()
	calls := 0
	recipe := identifier.TrustedRecipe{ID: "test/static", Factory: func() *identifier.Identifier {
		calls++
		return identifier.NewIdentifier(map[uint32]identifier.Identity{101: {Name: "Boss", Boss: true}})
	}}
	idf, err := recipe.New()
	require.NoError(t, err)
	units := unitdb.New()
	tracker := NewDPSTracker(units, idf, DamageRuleNone)
	type root struct {
		Tracker    *DPSTracker
		Units      *unitdb.Units
		Identifier *identifier.Identifier
	}
	r := ownergraph.NewRegistry()
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[root]{Type: "test/dps-root", Version: 1, Init: func() *root { return new(root) },
		Capture: func(v *root, c *ownergraph.Capture) ([]byte, error) {
			a, err := c.Ref(v.Tracker)
			if err != nil {
				return nil, err
			}
			b, err := c.Ref(v.Units)
			if err != nil {
				return nil, err
			}
			d, err := c.Ref(v.Identifier)
			if err != nil {
				return nil, err
			}
			return json.Marshal([]string{a, b, d})
		},
		Restore: func(v *root, _ uint32, b []byte, c *ownergraph.Restore) error {
			var paths []string
			if err := json.Unmarshal(b, &paths); err != nil {
				return err
			}
			var err error
			v.Tracker, err = ownergraph.Loader[*DPSTracker](c)(paths[0])
			if err != nil {
				return err
			}
			v.Units, err = ownergraph.Loader[*unitdb.Units](c)(paths[1])
			if err != nil {
				return err
			}
			v.Identifier, err = ownergraph.Loader[*identifier.Identifier](c)(paths[2])
			return err
		},
	}))
	require.NoError(t, RegisterDPSGraphOwner(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, identifier.RegisterGraphOwner(r, recipe))
	snapshot, err := r.Capture(&root{tracker, units, idf})
	require.NoError(t, err)
	require.Equal(t, 1, calls, "capture must not rebuild static configuration")
	value, err := r.Restore(snapshot)
	require.NoError(t, err)
	restored := value.(*root)
	require.Same(t, restored.Units, restored.Tracker.units)
	require.Same(t, restored.Identifier, restored.Tracker.identifier)
	require.NotSame(t, units, restored.Units)
	require.NotSame(t, idf, restored.Identifier)
	require.Equal(t, 2, calls, "trusted static identifier is reconstructed once, not once per reference")
	require.Equal(t, tracker.damageDone, restored.Tracker.damageDone)
	require.Equal(t, tracker.results, restored.Tracker.results, "restore does not finalize or process gameplay")
}

func TestDPSGraphRejectsMalformedEnvelope(t *testing.T) {
	t.Parallel()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterDPSGraphOwner(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	snapshot, err := r.Capture(NewDPSTracker(unitdb.New(), nil, DamageRuleNone))
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	for _, mutation := range []string{"null identifier", "missing units", "unknown leaf version", "unknown graph version", "wrong dependency", "duplicate field"} {
		t.Run(mutation, func(t *testing.T) {
			t.Parallel()
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if string(n.Path) != bad.Root {
					continue
				}
				var envelope struct {
					Version uint32          `json:"version"`
					Data    json.RawMessage `json:"data"`
				}
				require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
				var fields map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(envelope.Data, &fields))
				switch mutation {
				case "null identifier":
					fields["identifier"] = json.RawMessage("null")
				case "missing units":
					delete(fields, "units")
				case "unknown leaf version":
					fields["state_version"] = json.RawMessage("999")
				case "unknown graph version":
					envelope.Version = 999
				case "wrong dependency":
					fields["units"], _ = json.Marshal(bad.Root)
				}
				var err error
				envelope.Data, err = json.Marshal(fields)
				require.NoError(t, err)
				if mutation == "duplicate field" {
					envelope.Data = append([]byte(`{"units":"wrong",`), envelope.Data[1:]...)
				}
				n.Metadata, err = json.Marshal(envelope)
				require.NoError(t, err)
			}
			value, err := r.Restore(bad)
			require.Error(t, err)
			require.Nil(t, value)
		})
	}
}
