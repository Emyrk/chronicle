package consumeevidence

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestCollectorGraphRestoreDefersRuntimeCallback(t *testing.T) {
	t.Parallel()
	registry := ownergraph.NewRegistry()
	require.NoError(t, auras.RegisterGraphOwners(registry, auras.GraphOptions{}))
	require.NoError(t, RegisterGraphOwners(registry, GraphOptions{}))
	tracker := NewTracker(nil)
	collector := NewCollector(auras.New(nil), tracker)
	snapshot, err := registry.Capture(collector)
	require.NoError(t, err)

	value, err := registry.Restore(snapshot)
	require.NoError(t, err)
	restored := value.(*Collector)
	require.Nil(t, restored.emit)
	require.NotNil(t, restored.auraTracker)
	require.NotNil(t, restored.shared)

	restored.WireGraphRuntime(func(*messages.Consume) {})
	require.NotNil(t, restored.emit)
}

func TestConsumeGraphRejectsCatalogWithoutCompatibilityMetadata(t *testing.T) {
	t.Parallel()
	catalog := newTestCatalog()

	require.ErrorContains(t,
		RegisterGraphOwners(ownergraph.NewRegistry(), GraphOptions{Catalog: catalog}),
		"session compatibility metadata",
	)

	registry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(registry, GraphOptions{}))
	_, err := registry.Capture(NewTracker(catalog))
	require.ErrorContains(t, err, "session compatibility metadata")
}
