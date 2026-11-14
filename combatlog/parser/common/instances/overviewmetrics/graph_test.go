package overviewmetrics

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestTrackerGraphRoundTrip(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := NewTracker(units)
	tracker.abilities[abilityKey{name: "test"}] = &DeadliestAbility{Name: "test", Damage: 15, Hits: 2}
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	snapshot, err := r.Capture(tracker)
	require.NoError(t, err)
	value, err := r.Restore(snapshot)
	require.NoError(t, err)
	restored := value.(*Tracker)
	require.NotSame(t, units, restored.GraphUnits())
	require.Equal(t, tracker.abilities, restored.abilities)
}
func TestTrackerGraphEnvelopeRejectsMalformed(t *testing.T) {
	t.Parallel()
	for _, b := range []string{`{}`, `{"units":null,"state_version":1,"state":{}}`, `{"units":"a","units":"b","state_version":1,"state":{}}`, `{"units":"a","state_version":1,"state":{},"extra":0}`} {
		require.Error(t, decodeGraphEnvelope([]byte(b), "units", "state_version", "state"))
	}
}
