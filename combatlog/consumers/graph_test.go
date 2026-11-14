package consumers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

type graphConsumer struct {
	Name  string
	Calls int
	sink  *[]string
}

func (c *graphConsumer) Process(messages.Message) error {
	c.Calls++
	*c.sink = append(*c.sink, c.Name)
	return nil
}
func graphRegistry(t *testing.T) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[graphConsumer]{Type: "test.consumer", Version: 1, Init: func() *graphConsumer { return new(graphConsumer) }, Capture: func(c *graphConsumer, _ *ownergraph.Capture) ([]byte, error) { return json.Marshal(c) }, Restore: func(c *graphConsumer, _ uint32, b []byte, _ *ownergraph.Restore) error { return json.Unmarshal(b, c) }}))
	recipes := []GraphRecipe{}
	for _, name := range []string{"a", "b", "a"} {
		recipes = append(recipes, GraphRecipe{ID: name, Validate: func(c Consumer) error {
			v, ok := c.(*graphConsumer)
			if !ok || v == nil || v.Name != name {
				return fmt.Errorf("wrong consumer")
			}
			return nil
		}})
	}
	require.NoError(t, RegisterGraphOwner(r, recipes))
	return r
}
func TestOrderedGraphRoundTrip(t *testing.T) {
	t.Parallel()
	r := graphRegistry(t)
	a, b := &graphConsumer{Name: "a"}, &graphConsumer{Name: "b"}
	root := New(slog.Default(), a, b, a)
	snap, err := r.Capture(root)
	require.NoError(t, err)
	raw, err := json.Marshal(snap)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "graph.json")
	require.NoError(t, os.WriteFile(path, raw, 0600))
	raw, err = os.ReadFile(path)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, &snap))
	v, err := r.Restore(snap)
	require.NoError(t, err)
	got := v.(*Consumers)
	require.Same(t, got.list[0], got.list[2])
	require.NotSame(t, a, got.list[0])
	require.Empty(t, got.Times())
	require.Error(t, got.Process(nil))
	_, err = got.Advance(context.Background(), nil)
	require.Error(t, err)
	var order []string
	runtime := []GraphRuntime{}
	for _, id := range []string{"a", "b", "a"} {
		runtime = append(runtime, GraphRuntime{ID: id, Preflight: func(Consumer) error { return nil }, Wire: func(c Consumer) error { c.(*graphConsumer).sink = &order; return nil }})
	}
	bad := append([]GraphRuntime(nil), runtime...)
	bad[2].Preflight = func(Consumer) error { return fmt.Errorf("bad") }
	require.Error(t, got.WireGraphRuntime(slog.Default(), bad))
	require.Nil(t, got.list[0].(*graphConsumer).sink)
	require.NoError(t, got.WireGraphRuntime(slog.Default(), runtime))
	require.Error(t, got.WireGraphRuntime(slog.Default(), runtime))
	require.NoError(t, got.Process(nil))
	require.Equal(t, []string{"a", "b", "a"}, order)
	again, err := r.Restore(snap)
	require.NoError(t, err)
	require.Zero(t, again.(*Consumers).list[0].(*graphConsumer).Calls)
	for _, mutate := range []func(*graphState){func(s *graphState) { s.Consumers[0], s.Consumers[1] = s.Consumers[1], s.Consumers[0] }, func(s *graphState) { s.Consumers[0].Ref = "/missing" }, func(s *graphState) { s.Consumers[0].Ref = snap.Root }} {
		var broken ownergraph.Snapshot
		require.NoError(t, json.Unmarshal(raw, &broken))
		for i, n := range broken.Graph.Nodes {
			if string(n.Path) != broken.Root {
				continue
			}
			var envelope struct {
				Version uint32     `json:"version"`
				Data    graphState `json:"data"`
			}
			require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
			mutate(&envelope.Data)
			broken.Graph.Nodes[i].Metadata, err = json.Marshal(envelope)
			require.NoError(t, err)
		}
		_, err = r.Restore(broken)
		require.Error(t, err)
	}
	root.Advancer = badAdvancer{}
	_, err = r.Capture(root)
	require.Error(t, err)
}

type badAdvancer struct{}

func (badAdvancer) Advance(context.Context) ([]messages.Message, error) { panic("must not advance") }

func TestGraphRuntimeWireFailureIsTerminal(t *testing.T) {
	t.Parallel()
	r := graphRegistry(t)
	snap, err := r.Capture(New(slog.Default(), &graphConsumer{Name: "a"}, &graphConsumer{Name: "b"}, &graphConsumer{Name: "a"}))
	require.NoError(t, err)
	v, err := r.Restore(snap)
	require.NoError(t, err)
	root := v.(*Consumers)
	failure := fmt.Errorf("runtime unavailable")
	var wired []string
	runtime := []GraphRuntime{}
	for _, id := range []string{"a", "b", "a"} {
		runtime = append(runtime, GraphRuntime{ID: id, Preflight: func(Consumer) error { return nil }, Wire: func(c Consumer) error {
			wired = append(wired, c.(*graphConsumer).Name)
			if len(wired) == 2 {
				return failure
			}
			return nil
		}})
	}
	require.ErrorIs(t, root.WireGraphRuntime(slog.Default(), runtime), failure)
	require.Equal(t, []string{"a", "b"}, wired)
	require.Error(t, root.WireGraphRuntime(slog.Default(), runtime))
	require.Len(t, wired, 2)
	require.Error(t, root.Process(nil))
	_, err = root.Advance(context.Background(), badAdvancer{})
	require.Error(t, err)
	_, err = r.Capture(root)
	require.Error(t, err)
}
