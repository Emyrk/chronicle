package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestVanillaPlusStateBoundary(t *testing.T) {
	t.Parallel()
	v := newVanillaPlus()
	unit := &messages.Unit{}
	unit.Guid = guid.GUID(0xF130002CEE000001)
	v.ProcessMessages([]messages.Message{unit})
	s := v.CaptureState()
	b, err := s.Encode()
	require.NoError(t, err)
	decoded, err := DecodeVanillaPlusState(1, b)
	require.NoError(t, err)
	restored, err := decoded.Restore()
	require.NoError(t, err)
	shadow := guid.GUID(0xF130009C44000001)
	a, c := &messages.Damage{Caster: &shadow}, &messages.Damage{Caster: &shadow}
	v.ProcessMessages([]messages.Message{a})
	restored.ProcessMessages([]messages.Message{c})
	require.Equal(t, a, c)
	unit.Guid = guid.GUID(0xF130002CEE000002)
	after, err := s.Encode()
	require.NoError(t, err)
	require.Equal(t, b, after)
	for _, payload := range []string{"null", "{}", `{"boss":{}}`, string(b) + " {}"} {
		_, err := DecodeVanillaPlusState(1, []byte(payload))
		require.Error(t, err)
	}
	_, err = DecodeVanillaPlusState(2, b)
	require.Error(t, err)
}
