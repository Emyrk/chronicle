package rankings

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestSpeedrunGraphCanonicalDependenciesAndContinuation(t *testing.T) {
	t.Parallel()
	rules := speedrunStateRules()
	units := unitdb.New()
	engagement := NewEngagementTracker(units)
	tracker := NewSpeedrunTracker(rules, units, engagement)
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	id := uuid.MustParse("10000000-0000-0000-0000-000000000001")
	tracker.FightStarted(id, msg(start))
	engagement.FightStarted(id, msg(start))
	tracker.ActivityChange(msg(start.Add(time.Second)), slainSpeedrunCharacter(100, 1))
	registry := func(rules []SpeedrunRules) *ownergraph.Registry {
		r := ownergraph.NewRegistry()
		require.NoError(t, RegisterSpeedrunGraphOwner(r, rules))
		require.NoError(t, RegisterEngagementGraphOwner(r))
		require.NoError(t, unitdb.RegisterGraphOwner(r))
		return r
	}
	r := registry([]SpeedrunRules{rules})
	snapshot, err := r.Capture(tracker)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	var persisted ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &persisted))
	value, err := r.Restore(persisted)
	require.NoError(t, err)
	restored := value.(*SpeedrunTracker)
	require.Same(t, restored.GraphUnits(), restored.GraphEngagement().GraphUnits())
	require.NotSame(t, units, restored.GraphUnits())
	require.NotSame(t, engagement, restored.GraphEngagement())
	require.Equal(t, tracker.currentFightStart, restored.currentFightStart)
	require.Equal(t, engagement.results, restored.engagement.results)
	for _, v := range []*SpeedrunTracker{tracker, restored} {
		v.FightEnded(id, msg(start.Add(time.Minute)))
	}
	a, err := tracker.CaptureState()
	require.NoError(t, err)
	b, err := restored.CaptureState()
	require.NoError(t, err)
	require.Equal(t, speedrunStateBytes(t, a), speedrunStateBytes(t, b))
	_, err = registry(nil).Restore(persisted)
	require.ErrorContains(t, err, "unregistered speedrun rules")
	_, err = registry(nil).Capture(tracker)
	require.ErrorContains(t, err, "unregistered speedrun rules")
}
func TestSurvivabilityGraphRoundTrip(t *testing.T) {
	t.Parallel()
	tracker := NewSurvivabilityTracker()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterSurvivabilityGraphOwner(r))
	snapshot, err := r.Capture(tracker)
	require.NoError(t, err)
	value, err := r.Restore(snapshot)
	require.NoError(t, err)
	require.Equal(t, tracker, value)
}
func TestHookGraphEnvelopeRejectsMalformed(t *testing.T) {
	t.Parallel()
	for _, b := range []string{`{}`, `{"units":null,"state_version":1,"state":{}}`, `{"units":"a","units":"b","state_version":1,"state":{}}`, `{"units":"a","state_version":1,"state":{},"extra":0}`} {
		require.Error(t, decodeGraphEnvelope([]byte(b), "units", "state_version", "state"))
	}
}

func TestHookGraphsRejectCorruptPayloads(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	rules := speedrunStateRules()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterEngagementGraphOwner(r))
	require.NoError(t, RegisterSpeedrunGraphOwner(r, []SpeedrunRules{rules}))
	require.NoError(t, RegisterSurvivabilityGraphOwner(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	for _, tracker := range []any{NewEngagementTracker(units), NewSpeedrunTracker(rules, units, NewEngagementTracker(units)), NewSurvivabilityTracker()} {
		snapshot, err := r.Capture(tracker)
		require.NoError(t, err)
		wire, err := json.Marshal(snapshot)
		require.NoError(t, err)
		for _, mutation := range []string{"version", "payload"} {
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if string(n.Path) != bad.Root {
					continue
				}
				var envelope struct {
					Version uint32          `json:"version"`
					Data    json.RawMessage `json:"data"`
				}
				require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
				if mutation == "version" {
					envelope.Version = 99
				} else {
					envelope.Data = json.RawMessage(`{}`)
				}
				n.Metadata, err = json.Marshal(envelope)
				require.NoError(t, err)
			}
			value, err := r.Restore(bad)
			require.Error(t, err)
			require.Nil(t, value)
		}
	}
}
