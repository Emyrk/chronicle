package consumeevidence

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
	"strings"
	"testing"
)

func graphIdentity() snapshot.Compatibility {
	return snapshot.Compatibility{DatasetID: "10000000-0000-0000-0000-000000000001", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: "vanilla", Flavor: "turtle"}
}
func TestConfiguredGraphFreshDependencies(t *testing.T) {
	t.Parallel()
	identity := graphIdentity()
	dependency := newTestCatalog()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r, GraphOptions{Catalog: dependency, Compatibility: identity}))
	tracker := NewTracker(dependency)
	saved, err := r.Capture(tracker)
	require.NoError(t, err)
	wire, err := json.Marshal(saved)
	require.NoError(t, err)
	var persisted ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &persisted))
	freshDependency := newTestCatalog()
	freshRegistry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(freshRegistry, GraphOptions{Catalog: freshDependency, Compatibility: identity}))
	value, err := freshRegistry.Restore(persisted)
	require.NoError(t, err)
	restored := value.(*Tracker)
	require.Same(t, freshDependency, restored.catalog)
	require.NotSame(t, dependency, restored.catalog)
	_, err = r.Capture(NewTracker(freshDependency))
	require.ErrorContains(t, err, "differs from trusted registration")
	_, err = r.Capture(NewTracker(nil))
	require.ErrorContains(t, err, "differs from trusted registration")
	identity.DatasetRevision++
	mismatch := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(mismatch, GraphOptions{Catalog: freshDependency, Compatibility: identity}))
	value, err = mismatch.Restore(persisted)
	require.ErrorContains(t, err, "incompatible")
	require.Nil(t, value)
	defaultRegistry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(defaultRegistry, GraphOptions{}))
	_, err = defaultRegistry.Restore(persisted)
	require.Error(t, err)
	require.Error(t, RegisterGraphOwners(ownergraph.NewRegistry(), GraphOptions{Compatibility: snapshot.Compatibility{DatasetRevision: 1}}))
}
