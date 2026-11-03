package ratingmath

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTenantScopeThroughput(t *testing.T) {
	t.Parallel()

	// 1000 dps over 60s and 2000 dps over 240s: (60k + 480k) / 300s = 1800 dps,
	// not the 1500 a plain average of the two bosses would give.
	raw, duration, ok := tenantScopeThroughput([]tenantScopeBoss{
		{instance: "Molten Core", encounter: "Lucifron", score: 90, raw: 1000, duration: 60},
		{instance: "Molten Core", encounter: "Ragnaros", score: 95, raw: 2000, duration: 240},
	})
	require.True(t, ok)
	require.InDelta(t, 1800, raw, 1e-9)
	require.InDelta(t, 300, duration, 1e-9)

	// ZG Edge of Madness is one slot: only its best-scoring kill counts.
	raw, duration, ok = tenantScopeThroughput([]tenantScopeBoss{
		{instance: "Zul'Gurub", encounter: "Gri'lek", score: 80, raw: 900, duration: 50},
		{instance: "Zul'Gurub", encounter: "Renataki", score: 99, raw: 1200, duration: 100},
	})
	require.True(t, ok)
	require.InDelta(t, 1200, raw, 1e-9)
	require.InDelta(t, 100, duration, 1e-9)

	// A counted kill without its length makes the raid figure unknown, not partial.
	_, _, ok = tenantScopeThroughput([]tenantScopeBoss{
		{instance: "Molten Core", encounter: "Lucifron", score: 90, raw: 1000, duration: 60},
		{instance: "Molten Core", encounter: "Ragnaros", score: 95, raw: 2000},
	})
	require.False(t, ok)
}
