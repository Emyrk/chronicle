package auras

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
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
	dependency := &chrondbc.DurationModifierSet{}
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r, GraphOptions{DurationModifiers: dependency, Compatibility: identity}))
	tracker := New(dependency)
	saved, err := r.Capture(tracker)
	require.NoError(t, err)
	wire, err := json.Marshal(saved)
	require.NoError(t, err)
	var persisted ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &persisted))
	freshDependency := &chrondbc.DurationModifierSet{}
	freshRegistry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(freshRegistry, GraphOptions{DurationModifiers: freshDependency, Compatibility: identity}))
	value, err := freshRegistry.Restore(persisted)
	require.NoError(t, err)
	restored := value.(*Tracking)
	require.Same(t, freshDependency, restored.mods)
	require.NotSame(t, dependency, restored.mods)
	_, err = r.Capture(New(freshDependency))
	require.ErrorContains(t, err, "differs from trusted registration")
	_, err = r.Capture(New(nil))
	require.ErrorContains(t, err, "differs from trusted registration")
	identity.DatasetRevision++
	mismatch := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(mismatch, GraphOptions{DurationModifiers: freshDependency, Compatibility: identity}))
	value, err = mismatch.Restore(persisted)
	require.ErrorContains(t, err, "incompatible")
	require.Nil(t, value)
	defaultRegistry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(defaultRegistry, GraphOptions{}))
	_, err = defaultRegistry.Restore(persisted)
	require.Error(t, err)
	require.Error(t, RegisterGraphOwners(ownergraph.NewRegistry(), GraphOptions{Compatibility: snapshot.Compatibility{DatasetRevision: 1}}))
}

func TestGraphObserversRequireTrustedCaptureBinding(t *testing.T) {
	t.Parallel()
	tracker := New(nil)
	calls := 0
	tracker.AddObserver(func(Notification) { calls++ })
	plain := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(plain, GraphOptions{}))
	_, err := plain.Capture(tracker)
	require.ErrorContains(t, err, "trusted capture binding")
	bound := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(bound, GraphOptions{ObserverTracking: tracker}))
	saved, err := bound.Capture(tracker)
	require.NoError(t, err)
	value, err := plain.Restore(saved)
	require.NoError(t, err)
	require.Zero(t, value.(*Tracking).GraphObserverCount())
	require.Zero(t, calls)
	tracker.AddObserver(func(Notification) { calls++ })
	_, err = bound.Capture(tracker)
	require.ErrorContains(t, err, "trusted capture binding")
	require.Zero(t, calls)
}
