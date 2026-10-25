package servicewhatsnew

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStatusUnreadComparison(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		current string
		seen    string
		unread  bool
	}{
		{name: "current release", current: "player-timeline", seen: "player-timeline", unread: false},
		{name: "older release", current: "player-timeline", seen: "custom-panels", unread: true},
		{name: "stale release", current: "player-timeline", seen: "removed-release", unread: true},
		{name: "focus mode after player timeline", current: "focus-mode", seen: "player-timeline", unread: true},
		{name: "layout editing after focus mode", current: "layout-editing", seen: "focus-mode", unread: true},
		{name: "character cosmetics after layout editing", current: "character-cosmetics", seen: "layout-editing", unread: true},
		{name: "no releases", current: "", seen: "", unread: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.unread, hasUnread(test.current, test.seen))
		})
	}

	require.Equal(t, "character-cosmetics", CurrentID())
}
