package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestTotemPeriodStateContinuation(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 123456789, time.UTC)
	original := &TotemPeriod{WorkingPeriod: period.New(123, &TotemMeta{BumpBy: time.Minute, MaxLifetime: at.Add(2 * time.Minute)})}
	original.Begin("start", messages.TimedOut(at))
	original.LastActive = original.Start
	calls := 0
	original.SetHook(period.HookFunction(func(messages.Message) { calls++ }))
	state, e := original.CaptureState(func(*period.Moment) (string, error) { return "moment", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeTotemPeriodState(TotemPeriodStateVersion, data)
	require.NoError(t, e)
	restored := new(TotemPeriod)
	resolve := func(string) (*period.Moment, error) { return original.Start, nil }
	require.NoError(t, restored.RestoreState(state, resolve))
	require.Same(t, original.Start, restored.Start)
	require.Same(t, restored.Start, restored.LastActive)
	require.Equal(t, *original.Meta, *restored.Meta)
	require.NotSame(t, original.Meta, restored.Meta)
	require.Zero(t, calls)
	previous := restored.WorkingPeriod
	require.Error(t, restored.RestoreState(state, func(string) (*period.Moment, error) { return nil, nil }))
	require.Same(t, previous, restored.WorkingPeriod)
	restored.HandleTimeout(at.Add(time.Minute))
	require.True(t, restored.IsActive())
	original.HandleTimeout(at.Add(time.Minute + time.Nanosecond))
	beforeRestored := calls
	restored.HandleTimeout(at.Add(time.Minute + time.Nanosecond))
	require.Equal(t, original.Get(), restored.Get())
	require.False(t, restored.IsActive())
	// Restored period emits no callback until runtime wiring is explicitly attached.
	require.Greater(t, calls, 0)
	require.Equal(t, beforeRestored, calls)
	_, e = DecodeTotemPeriodState(TotemPeriodStateVersion, []byte(`{}`))
	require.Error(t, e)
}
func TestObjectPeriodStateContinuation(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 123456789, time.UTC)
	original := &ObjectPeriod{WorkingPeriod: period.New(123, &ObjectMeta{}), MaxLifetime: time.Minute}
	original.Begin("start", messages.TimedOut(at))
	original.LastActive = original.Start
	calls := 0
	original.SetHook(period.HookFunction(func(messages.Message) { calls++ }))
	state, e := original.CaptureState(func(*period.Moment) (string, error) { return "moment", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeObjectPeriodState(ObjectPeriodStateVersion, data)
	require.NoError(t, e)
	restored := new(ObjectPeriod)
	resolve := func(string) (*period.Moment, error) { return original.Start, nil }
	require.NoError(t, restored.RestoreState(state, resolve))
	require.Same(t, original.Start, restored.Start)
	require.Same(t, restored.Start, restored.LastActive)
	require.Equal(t, *original.Meta, *restored.Meta)
	require.NotSame(t, original.Meta, restored.Meta)
	require.Zero(t, calls)
	previous := restored.WorkingPeriod
	require.Error(t, restored.RestoreState(state, func(string) (*period.Moment, error) { return nil, nil }))
	require.Same(t, previous, restored.WorkingPeriod)
	restored.HandleTimeout(at.Add(time.Minute))
	require.True(t, restored.IsActive())
	original.HandleTimeout(at.Add(time.Minute + time.Nanosecond))
	beforeRestored := calls
	restored.HandleTimeout(at.Add(time.Minute + time.Nanosecond))
	require.Equal(t, original.Get(), restored.Get())
	require.False(t, restored.IsActive())
	// Restored period emits no callback until runtime wiring is explicitly attached.
	require.Greater(t, calls, 0)
	require.Equal(t, beforeRestored, calls)
	_, e = DecodeObjectPeriodState(ObjectPeriodStateVersion, []byte(`{}`))
	require.Error(t, e)
}
