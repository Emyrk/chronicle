package period

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestWorkingCoreStateAliasesAndHooks(t *testing.T) {
	t.Parallel()
	type meta struct{ Value int }
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	original := New(guid.GUID(123), &meta{1})
	original.Begin("start", messages.TimedOut(at))
	original.LastActive = original.Start
	calls := 0
	original.SetHook(HookFunction(func(messages.Message) { calls++ }))
	state, e := original.CaptureCoreState(func(m *Moment) (string, error) { require.Same(t, original.Start, m); return "moment", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeCoreState(CoreStateVersion, data)
	require.NoError(t, e)
	injected := &meta{2}
	restored := New(guid.GUID(999), &meta{3})
	restored.SetHook(HookFunction(func(messages.Message) { calls++ }))
	require.NoError(t, restored.RestoreCoreState(state, injected, func(string) (*Moment, error) { return original.Start, nil }))
	require.Equal(t, guid.GUID(123), restored.me)
	require.Same(t, injected, restored.Meta)
	require.Equal(t, 2, injected.Value)
	require.Same(t, restored.Start, restored.LastActive)
	require.Same(t, original.Start, restored.Start)
	require.Nil(t, restored.hook)
	require.Zero(t, calls)
	prior := restored.Period
	require.Error(t, restored.RestoreCoreState(state, injected, func(string) (*Moment, error) { return nil, nil }))
	require.Same(t, prior, restored.Period)
	_, e = DecodeCoreState(CoreStateVersion, []byte(`{}`))
	require.Error(t, e)
}
