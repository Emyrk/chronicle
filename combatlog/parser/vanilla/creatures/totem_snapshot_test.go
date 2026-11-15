package creatures

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

// Resource generation activates a totem through the real production handler,
// retaining the ResourceChange in both start and last-active Moments.
func TestTotemResourceSnapshotContinuation(t *testing.T) {
	t.Parallel()
	r, newChars := wrapperGraphRegistry(t, nil)
	original := newChars()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	id := guid.GUID(0xF130000000000001 | uint64(5925)<<24)
	ch, _ := original.Add(id, at)
	totem, ok := ch.(*Totem)
	require.True(t, ok)
	target, _ := original.Add(guid.GUID(17), at)
	target.(interface {
		Start(string, messages.Message)
	}).Start("combat", messages.TimedOut(at))
	resource := &messages.ResourceChange{MessageBase: messages.Base(at), Caster: &id, Target: target.ID(), Amount: 30, Resource: "mana", Direction: "gain"}
	require.NoError(t, totem.Process(resource))
	require.True(t, totem.IsActive())
	current, ok := totem.Activity.Current()
	require.True(t, ok)
	require.Same(t, resource, current.Get().Start.Timestamp)
	snapshot, err := r.Capture(original)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	root, err := r.Restore(disk)
	require.NoError(t, err)
	restored := root.(*characters.Characters)
	require.NoError(t, restored.WireGraphRuntime())
	restoredCh, ok := restored.Get(id)
	require.True(t, ok)
	restoredTotem := restoredCh.(*Totem)
	restoredPeriod, ok := restoredTotem.Activity.Current()
	require.True(t, ok)
	require.Same(t, restoredPeriod.Get().Start.Timestamp, restoredPeriod.Get().LastActive.Timestamp)
	require.NotSame(t, resource, restoredPeriod.Get().Start.Timestamp)
	// Continue both graphs until the same production timeout closes the period.
	suffix := messages.TimedOut(at.Add(10 * time.Minute))
	require.NoError(t, totem.Process(suffix))
	require.NoError(t, restoredTotem.Process(suffix))
	want, err := r.Capture(original)
	require.NoError(t, err)
	got, err := r.Capture(restored)
	require.NoError(t, err)
	require.Equal(t, want, got)
	require.False(t, restoredTotem.IsActive())
}
