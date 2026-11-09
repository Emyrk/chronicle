package instances

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRazorfenKraulHostiles_RazorfenSpearhideIsNotBoss(t *testing.T) {
	t.Parallel()

	spearhide := RazorfenKraulHostiles()[4438]
	require.Equal(t, "Razorfen Spearhide", spearhide.Name)
	require.False(t, spearhide.Boss)
	require.True(t, spearhide.CanBattle())
}
