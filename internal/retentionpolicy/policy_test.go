package retentionpolicy_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/retentionpolicy"
	"github.com/stretchr/testify/require"
)

func TestResolveTier(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		keys []string
		want retentionpolicy.Tier
	}{
		{name: "no entitlements", want: retentionpolicy.TierStandard},
		{name: "unknown entitlement", keys: []string{"another-product"}, want: retentionpolicy.TierStandard},
		{name: "honored", keys: []string{retentionpolicy.EntitlementChronicleHonored}, want: retentionpolicy.TierHonored},
		{name: "revered", keys: []string{retentionpolicy.EntitlementChronicleRevered}, want: retentionpolicy.TierRevered},
		{name: "exalted", keys: []string{retentionpolicy.EntitlementChronicleExalted}, want: retentionpolicy.TierExalted},
		{
			name: "highest tier wins regardless of order",
			keys: []string{
				retentionpolicy.EntitlementChronicleRevered,
				retentionpolicy.EntitlementChronicleExalted,
				retentionpolicy.EntitlementChronicleHonored,
			},
			want: retentionpolicy.TierExalted,
		},
		{
			name: "recognized tier wins with unknown keys",
			keys: []string{"custom", retentionpolicy.EntitlementChronicleHonored, "future"},
			want: retentionpolicy.TierHonored,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, retentionpolicy.ResolveTier(tt.keys))
		})
	}
}

func TestPeriodFor(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		tier     retentionpolicy.Tier
		category retentionpolicy.Category
		key      retentionpolicy.PolicyKey
		want     retentionpolicy.Period
	}{
		{name: "standard raid", tier: retentionpolicy.TierStandard, category: retentionpolicy.CategoryRaid, want: retentionpolicy.Period{Years: 1}},
		{name: "standard dungeon", tier: retentionpolicy.TierStandard, category: retentionpolicy.CategoryDungeon, want: retentionpolicy.Period{Months: 3}},
		{name: "honored raid", tier: retentionpolicy.TierHonored, category: retentionpolicy.CategoryRaid, want: retentionpolicy.Period{Years: 1}},
		{name: "honored dungeon", tier: retentionpolicy.TierHonored, category: retentionpolicy.CategoryDungeon, want: retentionpolicy.Period{Months: 6}},
		{name: "revered raid", tier: retentionpolicy.TierRevered, category: retentionpolicy.CategoryRaid, want: retentionpolicy.Period{Years: 1, Months: 6}},
		{name: "revered dungeon", tier: retentionpolicy.TierRevered, category: retentionpolicy.CategoryDungeon, want: retentionpolicy.Period{Months: 9}},
		{name: "exalted raid", tier: retentionpolicy.TierExalted, category: retentionpolicy.CategoryRaid, want: retentionpolicy.Period{Years: 3}},
		{name: "exalted dungeon", tier: retentionpolicy.TierExalted, category: retentionpolicy.CategoryDungeon, want: retentionpolicy.Period{Years: 3}},
		{name: "unknown category is raid", tier: retentionpolicy.TierRevered, category: retentionpolicy.Category("scenario"), want: retentionpolicy.Period{Years: 1, Months: 6}},
		{name: "unknown tier is standard", tier: retentionpolicy.Tier("future"), category: retentionpolicy.CategoryDungeon, want: retentionpolicy.Period{Months: 3}},
		{name: "default key uses category", tier: retentionpolicy.TierHonored, category: retentionpolicy.CategoryDungeon, key: retentionpolicy.PolicyKeyDefault, want: retentionpolicy.Period{Months: 6}},
		{name: "explicit key overrides category", tier: retentionpolicy.TierHonored, category: retentionpolicy.CategoryRaid, key: retentionpolicy.PolicyKeyDungeon, want: retentionpolicy.Period{Months: 6}},
		{name: "custom key falls back to category", tier: retentionpolicy.TierHonored, category: retentionpolicy.CategoryDungeon, key: retentionpolicy.PolicyKey("custom"), want: retentionpolicy.Period{Months: 6}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, retentionpolicy.PeriodFor(tt.tier, tt.category, tt.key))
		})
	}
}

func TestPeriodForKey(t *testing.T) {
	t.Parallel()

	period, ok := retentionpolicy.PeriodForKey(retentionpolicy.TierRevered, retentionpolicy.PolicyKeyRaid)
	require.True(t, ok)
	require.Equal(t, retentionpolicy.Period{Years: 1, Months: 6}, period)

	period, ok = retentionpolicy.PeriodForKey(retentionpolicy.TierRevered, retentionpolicy.PolicyKey("custom"))
	require.False(t, ok)
	require.Zero(t, period)
}

func TestRetainUntilUsesCalendarPeriodFromEndTime(t *testing.T) {
	t.Parallel()

	endTime := time.Date(2024, time.February, 29, 18, 30, 0, 0, time.FixedZone("test", -5*60*60))
	got := retentionpolicy.RetainUntil(
		endTime,
		retentionpolicy.TierRevered,
		retentionpolicy.CategoryRaid,
		"",
	)

	require.Equal(t, endTime.AddDate(1, 6, 0), got)
	require.Equal(t, endTime.Location(), got.Location())
}
