package stategraph_test

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/stretchr/testify/require"
)

func TestGraphIsDeterministic(t *testing.T) {
	t.Parallel()

	build := func(reverse bool) stategraph.Graph {
		registry, err := stategraph.New("/root")
		require.NoError(t, err)
		require.NoError(t, registry.Directory("/root", nil))
		require.NoError(t, registry.Directory("/root/shared", nil))
		require.NoError(t, registry.Directory("/root/owners", nil))

		steps := []func() error{
			func() error { return registry.Value("/root/shared/units", "units", nil) },
			func() error { return registry.Value("/root/owners/instance", "instance", nil) },
			func() error {
				return registry.Reference("/root/owners/instance/units", "/root/shared/units", "units", nil)
			},
		}
		if reverse {
			for i := len(steps) - 1; i >= 0; i-- {
				require.NoError(t, steps[i]())
			}
		} else {
			for _, step := range steps {
				require.NoError(t, step())
			}
		}
		require.NoError(t, registry.DependsOn("/root/owners/instance", "/root/shared/units"))
		graph, err := registry.Graph()
		require.NoError(t, err)
		return graph
	}

	first, err := json.Marshal(build(false))
	require.NoError(t, err)
	second, err := json.Marshal(build(true))
	require.NoError(t, err)
	require.JSONEq(t, string(first), string(second))
	require.Equal(t, string(first), string(second))

	graph := build(false)
	node, ok := graph.Find("/root/shared/units")
	require.True(t, ok)
	require.Equal(t, stategraph.KindValue, node.Kind)
	require.Len(t, graph.Children("/root/owners/instance"), 1)
	require.Len(t, graph.ReferencesTo("/root/shared/units"), 1)
	require.Len(t, graph.DependenciesFrom("/root/owners/instance"), 1)
}

func TestRegistryRejectsConflicts(t *testing.T) {
	t.Parallel()

	t.Run("DuplicatePath", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.ErrorContains(t, registry.Value("/root/shared/units", "units", nil), "already registered")
	})

	t.Run("NonCanonicalPath", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.ErrorContains(t, registry.Directory("/root/shared/../other", nil), "not normalized")
	})

	t.Run("MissingParent", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.NoError(t, registry.Value("/root/missing/value", "value", nil))
		_, err := registry.Graph()
		require.ErrorContains(t, err, "missing parent")
	})

	t.Run("MissingReferenceTarget", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.NoError(t, registry.Reference("/root/shared/missing", "/root/nowhere", "units", nil))
		_, err := registry.Graph()
		require.ErrorContains(t, err, "missing target")
	})

	t.Run("ReferenceTargetKind", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.NoError(t, registry.Reference("/root/shared/alias", "/root/shared", "units", nil))
		_, err := registry.Graph()
		require.ErrorContains(t, err, "must be a value")
	})

	t.Run("ReferenceType", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.NoError(t, registry.Reference("/root/shared/wrong", "/root/shared/units", "other", nil))
		_, err := registry.Graph()
		require.ErrorContains(t, err, "expects type")
	})

	t.Run("ReferenceChildren", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.NoError(t, registry.Reference("/root/shared/alias", "/root/shared/units", "units", nil))
		require.NoError(t, registry.Value("/root/shared/alias/child", "child", nil))
		_, err := registry.Graph()
		require.ErrorContains(t, err, "cannot have child")
	})

	t.Run("MissingDependency", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.NoError(t, registry.DependsOn("/root/shared/units", "/root/missing"))
		_, err := registry.Graph()
		require.ErrorContains(t, err, "dependency target")
	})

	t.Run("DependencyCycle", func(t *testing.T) {
		t.Parallel()
		registry := validRegistry(t)
		require.NoError(t, registry.Value("/root/shared/auras", "auras", nil))
		require.NoError(t, registry.DependsOn("/root/shared/units", "/root/shared/auras"))
		require.NoError(t, registry.DependsOn("/root/shared/auras", "/root/shared/units"))
		_, err := registry.Graph()
		require.ErrorContains(t, err, "dependency cycle")
	})
}

func validRegistry(t *testing.T) *stategraph.Registry {
	t.Helper()
	registry, err := stategraph.New("/root")
	require.NoError(t, err)
	require.NoError(t, registry.Directory("/root", nil))
	require.NoError(t, registry.Directory("/root/shared", nil))
	require.NoError(t, registry.Value("/root/shared/units", "units", nil))
	return registry
}
