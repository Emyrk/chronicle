package state

import (
	"testing"

	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"
	"github.com/stretchr/testify/require"
)

func TestLives(t *testing.T) {
	lives := NewLives(messages.Cast{})
	require.False(t, lives.IsActive())

	lives.StartLife(messages.Cast{})
	require.True(t, lives.IsActive())

	lives.EndLife(messages.Cast{})
	require.False(t, lives.IsActive())
}
