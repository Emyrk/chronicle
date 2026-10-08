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
		{name: "current release", current: "custom-panels", seen: "custom-panels", unread: false},
		{name: "older release", current: "custom-panels", seen: "historical-performance", unread: true},
		{name: "stale release", current: "custom-panels", seen: "removed-release", unread: true},
		{name: "no releases", current: "", seen: "", unread: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.unread, hasUnread(test.current, test.seen))
		})
	}

	require.Equal(t, "custom-panels", CurrentID())
}
