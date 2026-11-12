package period

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestSlainTypedNilDamageAttribution(t *testing.T) {
	t.Parallel()
	original := &messages.Slain{Victim: 1, Attribution: (*messages.Damage)(nil)}
	s, e := CaptureMessage(original, func(messages.Message) (string, error) {
		t.Fatal("nil attribution is not an owner reference")
		return "", nil
	}, nil)
	require.NoError(t, e)
	b, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodeMessageState(MessageStateVersion, b)
	require.NoError(t, e)
	restored, e := s.Restore(nil, nil)
	require.NoError(t, e)
	require.Equal(t, original, restored)
	require.True(t, restored.(*messages.Slain).Attribution != nil)
	damage, ok := restored.(*messages.Slain).Attribution.(*messages.Damage)
	require.True(t, ok)
	require.Nil(t, damage)
}
