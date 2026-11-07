package aikey

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/ratelimit"
)

func TestTierTable(t *testing.T) {
	t.Parallel()

	// Starting values from #1656.
	want := map[string]struct {
		maxLifetime                       time.Duration
		perMinute, perDay, resultsPerPage int
	}{
		billing.TierFree:    {24 * time.Hour, 30, 1_000, 25},
		billing.TierHonored: {7 * 24 * time.Hour, 60, 3_000, 100},
		billing.TierRevered: {30 * 24 * time.Hour, 120, 10_000, 100},
		billing.TierExalted: {90 * 24 * time.Hour, 240, 25_000, 100},
	}
	require.Len(t, tierBenefits, len(want))
	for tier, w := range want {
		b := BenefitsFor(tier)
		require.Equal(t, tier, b.Tier)
		require.Equal(t, w.maxLifetime, MaxLifetime(b), tier)
		require.Equal(t, w.perMinute, b.ViewsPerMinute, tier)
		require.Equal(t, w.perDay, b.ViewsPerDay, tier)
		require.Equal(t, w.resultsPerPage, b.ResultsPerSearch, tier)
	}
	require.Equal(t, []int{1, 24}, BenefitsFor(billing.TierFree).LifetimeHours)

	t.Run("UnknownTierIsFree", func(t *testing.T) {
		t.Parallel()
		b := BenefitsFor("mythic")
		require.Equal(t, billing.TierFree, b.Tier)
		require.Equal(t, 30, b.ViewsPerMinute)
	})

	t.Run("HigherTiersNeverGetLess", func(t *testing.T) {
		t.Parallel()
		tiers := AllTiers()
		require.Len(t, tiers, len(tierOrder))
		for i := 1; i < len(tiers); i++ {
			lo, hi := tiers[i-1], tiers[i]
			require.GreaterOrEqual(t, MaxLifetime(hi), MaxLifetime(lo), hi.Tier)
			require.GreaterOrEqual(t, hi.ViewsPerMinute, lo.ViewsPerMinute, hi.Tier)
			require.GreaterOrEqual(t, hi.ViewsPerDay, lo.ViewsPerDay, hi.Tier)
			require.GreaterOrEqual(t, hi.ResultsPerSearch, lo.ResultsPerSearch, hi.Tier)
			require.Subset(t, hi.LifetimeHours, lo.LifetimeHours, hi.Tier)
		}
	})

	t.Run("EveryTierOffersTheDefaultLifetime", func(t *testing.T) {
		t.Parallel()
		for _, b := range AllTiers() {
			require.True(t, AllowsLifetime(b, DefaultLifetimeHours), b.Tier)
			require.False(t, AllowsLifetime(b, 2), b.Tier)
		}
		require.False(t, AllowsLifetime(BenefitsFor(billing.TierFree), 7*24))
		require.True(t, AllowsLifetime(BenefitsFor(billing.TierHonored), 7*24))
	})

	t.Run("BucketsRefillBeforeCleanup", func(t *testing.T) {
		t.Parallel()
		// Cleanup deletes buckets idle for IdleBucketTTL; each must be full by then.
		for _, b := range AllTiers() {
			for _, l := range []ratelimit.Limit{minuteLimit(b), DayLimit(b)} {
				refill := time.Duration(l.Burst / l.PerSecond * float64(time.Second))
				require.LessOrEqual(t, refill, ratelimit.IdleBucketTTL, b.Tier)
			}
		}
	})

	t.Run("CallersCannotEditTheTable", func(t *testing.T) {
		t.Parallel()
		b := BenefitsFor(billing.TierExalted)
		b.LifetimeHours[0] = 99_999
		require.Equal(t, 1, BenefitsFor(billing.TierExalted).LifetimeHours[0])
	})
}

func TestNextTier(t *testing.T) {
	t.Parallel()
	require.Equal(t, billing.TierHonored, nextTier(billing.TierFree))
	require.Equal(t, billing.TierExalted, nextTier(billing.TierRevered))
	require.Empty(t, nextTier(billing.TierExalted))
}
