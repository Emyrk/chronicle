package stategraph

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDerivableValueReferences(t *testing.T) {
	t.Parallel()
	r, err := New("/root")
	require.NoError(t, err)
	require.NoError(t, r.Directory("/root", nil))
	require.NoError(t, r.Value("/root/value", "test", nil))
	require.NoError(t, r.Reference("/root/a", "/root/value", "test", nil))
	require.NoError(t, r.Reference("/root/b", "/root/value", "test", nil))
	g, err := r.Graph()
	require.NoError(t, err)
	calls := 0
	typ := DerivableType[*int]{Type: "test", Version: 1, Derivable: true, Derive: func(_ context.Context, _ json.RawMessage) (*int, error) { calls++; n := 42; return &n, nil }}
	payloads := map[Path]ValuePayload{"/root/value": {Type: "test", Version: 1, Payload: json.RawMessage(`42`)}}
	got, err := typ.Restore(t.Context(), g, payloads)
	require.NoError(t, err)
	require.Equal(t, 1, calls)
	require.Same(t, got["/root/a"], got["/root/b"])
	for _, change := range []func(*Graph, map[Path]ValuePayload){
		func(g *Graph, _ map[Path]ValuePayload) { g.Version = 99 },
		func(_ *Graph, p map[Path]ValuePayload) { delete(p, "/root/value") },
		func(_ *Graph, p map[Path]ValuePayload) { p["/root/extra"] = p["/root/value"] },
		func(_ *Graph, p map[Path]ValuePayload) { p["/root/value"] = ValuePayload{Type: "other", Version: 1} },
		func(_ *Graph, p map[Path]ValuePayload) { p["/root/value"] = ValuePayload{Type: "test", Version: 2} },
		func(g *Graph, _ map[Path]ValuePayload) {
			for i := range g.Nodes {
				if g.Nodes[i].Kind == KindReference {
					g.Nodes[i].Target = "/root/missing"
					break
				}
			}
		},
		func(g *Graph, _ map[Path]ValuePayload) {
			for i := range g.Nodes {
				if g.Nodes[i].Kind == KindReference {
					g.Nodes[i].Type = "other"
					break
				}
			}
		},
	} {
		copyGraph := g
		copyGraph.Nodes = append([]Node(nil), g.Nodes...)
		copyPayloads := map[Path]ValuePayload{"/root/value": payloads["/root/value"]}
		change(&copyGraph, copyPayloads)
		calls = 0
		got, err := typ.Restore(t.Context(), copyGraph, copyPayloads)
		require.Error(t, err)
		require.Nil(t, got)
		require.Zero(t, calls)
	}
	typ.Derive = func(context.Context, json.RawMessage) (*int, error) { return nil, errors.New("lookup failed") }
	got, err = typ.Restore(t.Context(), g, payloads)
	require.Error(t, err)
	require.Nil(t, got)
	typ.Derivable = false
	_, err = typ.Restore(t.Context(), g, payloads)
	require.Error(t, err)
}
