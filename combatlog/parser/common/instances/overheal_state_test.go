package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestOverhealingStateContinuation(t *testing.T) {
	t.Parallel()
	source := new(Overhealing)
	s, e := source.CaptureState()
	require.NoError(t, e)
	fresh := new(Overhealing)
	require.NoError(t, fresh.RestoreState(s))
	require.Nil(t, fresh.deficits)
	source.FightStarted(uuid.Nil, nil)
	require.NoError(t, source.ProcessMessage(true, uuid.Nil, &messages.Damage{Target: 1, Amount: 100}))
	s, e = source.CaptureState()
	require.NoError(t, e)
	data, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodeOverhealingState(OverhealingStateVersion, data)
	require.NoError(t, e)
	require.NoError(t, fresh.RestoreState(s))
	for _, o := range []*Overhealing{source, fresh} {
		heal := &messages.Heal{Target: 1, Amount: 80}
		require.NoError(t, o.ProcessMessage(false, uuid.Nil, heal))
		require.EqualValues(t, 100, o.deficits[1])
		require.NoError(t, o.ProcessMessage(true, uuid.Nil, heal))
		require.Zero(t, heal.Overheal)
		resource := &messages.ResourceChange{Target: 1, Amount: 30, Resource: types.ResourceHealth}
		require.NoError(t, o.ProcessMessage(true, uuid.Nil, resource))
		require.EqualValues(t, 10, resource.OverResource)
		require.NoError(t, o.ProcessMessage(true, uuid.Nil, &messages.Slain{Victim: 1}))
		require.Empty(t, o.deficits)
	}
	require.Equal(t, source.deficits, fresh.deficits)
	require.EqualValues(t, 100, s.value.Deficits[1])
	_, e = DecodeOverhealingState(OverhealingStateVersion, []byte(`{}`))
	require.Error(t, e)
}
