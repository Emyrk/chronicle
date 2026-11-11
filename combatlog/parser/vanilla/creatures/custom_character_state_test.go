package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestTotemCharacterState(t *testing.T) {
	t.Parallel()
	base := new(characters.Base[*TotemPeriod])
	original := &Totem{Base: base, Self: totems.Totem{ID: 123, Name: "Totem", NormalDuration: time.Minute, Modifier: 0.1, StaticBump: time.Second}}
	state, e := original.CaptureState(func(*characters.Base[*TotemPeriod]) (string, error) { return "base", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeTotemState(TotemStateVersion, data)
	require.NoError(t, e)
	restored := new(Totem)
	require.NoError(t, restored.RestoreState(state, func(string) (*characters.Base[*TotemPeriod], error) { return base, nil }))
	require.Same(t, base, restored.Base)
	require.Equal(t, original.Self, restored.Self)
	require.Error(t, restored.RestoreState(state, func(string) (*characters.Base[*TotemPeriod], error) { return nil, nil }))
	require.Same(t, base, restored.Base)
	_, e = DecodeTotemState(TotemStateVersion, []byte(`{"base":"base"}`))
	require.Error(t, e)
}
func TestObjectCharacterState(t *testing.T) {
	t.Parallel()
	base := new(characters.Base[*ObjectPeriod])
	original := &Object{Base: base, MaxLifetime: time.Minute}
	state, e := original.CaptureState(func(*characters.Base[*ObjectPeriod]) (string, error) { return "base", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeObjectState(ObjectStateVersion, data)
	require.NoError(t, e)
	restored := new(Object)
	require.NoError(t, restored.RestoreState(state, func(string) (*characters.Base[*ObjectPeriod], error) { return base, nil }))
	require.Same(t, base, restored.Base)
	require.Equal(t, original.MaxLifetime, restored.MaxLifetime)
	require.Error(t, restored.RestoreState(state, func(string) (*characters.Base[*ObjectPeriod], error) { return nil, nil }))
	require.Same(t, base, restored.Base)
	_, e = DecodeObjectState(ObjectStateVersion, []byte(`{"base":"base"}`))
	require.Error(t, e)
}
