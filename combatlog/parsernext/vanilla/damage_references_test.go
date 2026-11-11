package vanilla

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/stretchr/testify/require"
)

func TestDamageGraphIdentityAndRejections(t *testing.T) {
	t.Parallel()
	first := &messages.Damage{Amount: 1, SpellData: &chrondbc.Spell{ID: 1}}
	equal := &messages.Damage{Amount: 1, SpellData: &chrondbc.Spell{ID: 1}}
	g, err := CaptureDamageGraph([]DamageOwner{{Path: "/root/buffer/0", Damage: first}, {Path: "/root/buffer/1", Damage: first}, {Path: "/root/buffer/2", Damage: equal}}, map[stategraph.Path]*messages.Damage{"/root/cache/a": first, "/root/cache/nil": nil})
	require.NoError(t, err)
	f := &referenceFetcher{spell: &chrondbc.Spell{ID: 1}}
	restored, err := g.Restore(t.Context(), f)
	require.NoError(t, err)
	require.Same(t, restored["/root/buffer/0"], restored["/root/buffer/1"])
	require.Same(t, restored["/root/buffer/0"], restored["/root/cache/a"])
	require.NotSame(t, restored["/root/buffer/0"], restored["/root/buffer/2"])
	require.Same(t, restored["/root/buffer/0"].SpellData, restored["/root/buffer/2"].SpellData)
	require.NotContains(t, restored, stategraph.Path("/root/cache/nil"))
	require.Equal(t, 1, f.calls)
	wire, err := json.Marshal(g)
	require.NoError(t, err)
	for _, mutate := range []func(*DamageGraph){
		func(g *DamageGraph) { p := g.Values["/root/buffer/0"]; p.Version = 99; g.Values["/root/buffer/0"] = p },
		func(g *DamageGraph) {
			p := g.Values["/root/buffer/0"]
			p.Type = "wrong"
			g.Values["/root/buffer/0"] = p
		},
		func(g *DamageGraph) { delete(g.Values, "/root/buffer/0") },
		func(g *DamageGraph) { g.Values["/root/extra"] = g.Values["/root/buffer/0"] },
		func(g *DamageGraph) {
			for i := range g.Graph.Nodes {
				if g.Graph.Nodes[i].Path == "/root/buffer/0/spell" {
					g.Graph.Nodes[i].Type = messages.DamageStateType
				}
			}
		},
		func(g *DamageGraph) {
			p := g.Values["/root/buffer/0"]
			p.Payload = json.RawMessage(`{}`)
			g.Values["/root/buffer/0"] = p
		},
	} {
		var changed DamageGraph
		require.NoError(t, json.Unmarshal(wire, &changed))
		mutate(&changed)
		got, err := changed.Restore(t.Context(), f)
		require.Error(t, err)
		require.Nil(t, got)
	}
	_, err = CaptureDamageGraph([]DamageOwner{{Path: "/outside/value", Damage: first}}, nil)
	require.Error(t, err)
	_, err = CaptureDamageGraph([]DamageOwner{{Path: "/root/nil", Damage: nil}}, nil)
	require.Error(t, err)
}
