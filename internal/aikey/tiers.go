package aikey

import (
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/billing"
)

// tierOrder lists the tiers lowest first.
var tierOrder = []string{billing.TierFree, billing.TierHonored, billing.TierRevered, billing.TierExalted}

// tierBenefits is the single source of truth for what an AI key may do at
// each supporter tier. Search budgets and sort tiers come from
// serviceinstancesearch; everything specific to AI keys lives here.
var tierBenefits = map[string]chroniclesdk.AIKeyBenefits{
	billing.TierFree: {
		LifetimeHours:  []int{1, 24},
		ViewsPerMinute: 30, ViewsPerDay: 1_000,
		ResultsPerSearch: 25,
		PrivateData:      true,
	},
	billing.TierHonored: {
		LifetimeHours:  []int{1, 24, 7 * 24},
		ViewsPerMinute: 60, ViewsPerDay: 3_000,
		ResultsPerSearch: 100,
		PrivateData:      true,
	},
	billing.TierRevered: {
		LifetimeHours:  []int{1, 24, 7 * 24, 30 * 24},
		ViewsPerMinute: 120, ViewsPerDay: 10_000,
		ResultsPerSearch: 100,
		PrivateData:      true,
	},
	billing.TierExalted: {
		LifetimeHours:  []int{1, 24, 7 * 24, 30 * 24, 90 * 24},
		ViewsPerMinute: 240, ViewsPerDay: 25_000,
		ResultsPerSearch: 100,
		PrivateData:      true,
	},
}

// DefaultLifetimeHours is the lifetime of a key created without a choice.
// Every tier offers it.
const DefaultLifetimeHours = 24

// BenefitsFor returns a tier's benefits. Unknown tiers get the free tier.
func BenefitsFor(tier string) chroniclesdk.AIKeyBenefits {
	b, ok := tierBenefits[tier]
	if !ok {
		tier = billing.TierFree
		b = tierBenefits[tier]
	}
	b.Tier = tier
	b.LifetimeHours = append([]int(nil), b.LifetimeHours...)
	return b
}

// AllTiers returns every tier's benefits, lowest first.
func AllTiers() []chroniclesdk.AIKeyBenefits {
	out := make([]chroniclesdk.AIKeyBenefits, 0, len(tierOrder))
	for _, tier := range tierOrder {
		out = append(out, BenefitsFor(tier))
	}
	return out
}

// MaxLifetime is the longest key lifetime the benefits allow. A key older
// than this stops working, so a downgrade shortens existing keys too.
func MaxLifetime(b chroniclesdk.AIKeyBenefits) time.Duration {
	longest := 0
	for _, h := range b.LifetimeHours {
		longest = max(longest, h)
	}
	return time.Duration(longest) * time.Hour
}

// AllowsLifetime reports whether hours is one of the tier's lifetime options.
func AllowsLifetime(b chroniclesdk.AIKeyBenefits, hours int) bool {
	for _, h := range b.LifetimeHours {
		if h == hours {
			return true
		}
	}
	return false
}

// nextTier is the tier above, or "" at the top.
func nextTier(tier string) string {
	for i, t := range tierOrder {
		if t == tier && i+1 < len(tierOrder) {
			return tierOrder[i+1]
		}
	}
	return ""
}
