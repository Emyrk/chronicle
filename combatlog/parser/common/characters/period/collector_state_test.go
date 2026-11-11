package period

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/stretchr/testify/require"
)

type hookCountingPeriod struct {
	*EmptyPeriod
	calls int
}

func (p *hookCountingPeriod) SetHook(h Hook) { p.calls++; p.EmptyPeriod.SetHook(h) }
func TestCollectorRestoresAliasesWithoutWiringDependencies(t *testing.T) {
	t.Parallel()
	first := &hookCountingPeriod{EmptyPeriod: NewEmptyPeriod(1)}
	second := &hookCountingPeriod{EmptyPeriod: NewEmptyPeriod(2)}
	collector := &PeriodCollector[*hookCountingPeriod]{History: []*hookCountingPeriod{first, second, first}}
	state, err := collector.CaptureState(func(p *hookCountingPeriod) (string, error) {
		if p == first {
			return "/first", nil
		}
		return "/second", nil
	})
	require.NoError(t, err)
	encoded, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeCollectorState(CollectorStateVersion, encoded)
	require.NoError(t, err)
	restored := &PeriodCollector[*hookCountingPeriod]{}
	require.NoError(t, restored.RestoreState(decoded, func(ref string) (*hookCountingPeriod, error) {
		if ref == "/first" {
			return first, nil
		}
		return second, nil
	}))
	require.Equal(t, []*hookCountingPeriod{first, second, first}, restored.History)
	require.Zero(t, first.calls)
	require.Zero(t, second.calls)
	current, ok := restored.Current()
	require.True(t, ok)
	require.Same(t, first, current)
	events := 0
	restored.WireHook(HookFunction(func(messages.Message) { events++ }))
	require.Zero(t, events)
	require.Equal(t, 2, first.calls)
	require.Equal(t, 1, second.calls)
	first.Begin("start", messages.TimedOut(time.Time{}))
	require.Equal(t, 1, events)
	restored.History[0] = second
	require.Same(t, first, collector.History[0])
	after, err := state.Encode()
	require.NoError(t, err)
	require.Equal(t, encoded, after)
}
func TestCollectorNilEmptyAndFailedLoad(t *testing.T) {
	t.Parallel()
	for _, history := range [][]*EmptyPeriod{nil, {}} {
		original := &PeriodCollector[*EmptyPeriod]{History: history}
		state, err := original.CaptureState(nil)
		require.NoError(t, err)
		encoded, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeCollectorState(CollectorStateVersion, encoded)
		require.NoError(t, err)
		candidate := &PeriodCollector[*EmptyPeriod]{}
		require.NoError(t, candidate.RestoreState(decoded, nil))
		require.Equal(t, history, candidate.History)
	}
	p := NewEmptyPeriod(1)
	original := &PeriodCollector[*EmptyPeriod]{History: []*EmptyPeriod{p}}
	state, err := original.CaptureState(func(*EmptyPeriod) (string, error) { return "/period", nil })
	require.NoError(t, err)
	candidate := &PeriodCollector[*EmptyPeriod]{History: []*EmptyPeriod{p}}
	err = candidate.RestoreState(state, func(string) (*EmptyPeriod, error) { return nil, nil })
	require.Error(t, err)
	require.Same(t, p, candidate.History[0])
	for _, bad := range []string{`null`, `{}`, `{"history":[""]}`, `{"history":null,"history":[]}`, `{"history":[null]}`} {
		_, err := DecodeCollectorState(CollectorStateVersion, []byte(bad))
		require.Error(t, err)
	}
}
