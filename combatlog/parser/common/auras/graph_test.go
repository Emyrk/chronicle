package auras

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestProjectionGraphRestoreDefersRuntimeCallbacks(t *testing.T) {
	t.Parallel()
	registry := ownergraph.NewRegistry()
	projection := NewProjection(New(nil))
	require.NoError(t, RegisterGraphOwners(registry, GraphOptions{ObserverTracking: projection.GraphTracking()}))
	calls := 0
	projection.SetEmit(func(*messages.Aura) { calls++ })
	snapshot, err := registry.Capture(projection)
	require.NoError(t, err)

	value, err := registry.Restore(snapshot)
	require.NoError(t, err)
	restored := value.(*Projection)
	require.Nil(t, restored.emit)
	require.Zero(t, restored.GraphRuntimeRevision())
	require.Zero(t, calls)
	require.Empty(t, restored.tracker.observers)

	restored.WireGraphRuntime(func(*messages.Aura) {})
	require.NotNil(t, restored.emit)
	require.Len(t, restored.tracker.observers, 1)
}

func TestAuraGraphRejectsDurationModifiersWithoutCompatibilityMetadata(t *testing.T) {
	t.Parallel()
	modifiers := &chrondbc.DurationModifierSet{}

	require.ErrorContains(t,
		RegisterGraphOwners(ownergraph.NewRegistry(), GraphOptions{DurationModifiers: modifiers}),
		"session compatibility metadata",
	)

	registry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(registry, GraphOptions{}))
	_, err := registry.Capture(New(modifiers))
	require.ErrorContains(t, err, "session compatibility metadata")
}

func TestGraphRuntimeRevisionTracksEveryEmitterReplacement(t *testing.T) {
	t.Parallel()
	value := new(Projection)
	require.Zero(t, value.GraphRuntimeRevision())
	value.SetEmit(nil)
	require.Equal(t, uint64(1), value.GraphRuntimeRevision())
	calls := 0
	fn := func(*messages.Aura) { calls++ }
	value.SetEmit(fn)
	require.Equal(t, uint64(2), value.GraphRuntimeRevision())
	value.SetEmit(fn)
	require.Equal(t, uint64(3), value.GraphRuntimeRevision())
	value.SetEmit(nil)
	require.Equal(t, uint64(4), value.GraphRuntimeRevision())
	require.Zero(t, calls)
}
