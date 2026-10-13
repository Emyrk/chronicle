package billing

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRoleIsAdFree(t *testing.T) {
	t.Parallel()
	require.True(t, RoleIsAdFree([]string{"user", "supporter"}))
	require.False(t, RoleIsAdFree([]string{"user"}))
}

func TestSubscriptionIsAdFree(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, time.October, 13, 12, 0, 0, 0, time.UTC)
	future := pgtype.Timestamptz{Time: now.Add(time.Hour), Valid: true}
	past := pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true}

	tests := []struct {
		name string
		sub  database.BillingSubscription
		want bool
	}{
		{name: "active supporter", sub: database.BillingSubscription{Tier: TierSupporter, Status: "active"}, want: true},
		{name: "trialing supporter", sub: database.BillingSubscription{Tier: TierSupporter, Status: "trialing"}, want: true},
		{name: "canceled but paid through", sub: database.BillingSubscription{Tier: TierSupporter, Status: "canceled", CurrentPeriodEnd: future}, want: true},
		{name: "expired cancellation", sub: database.BillingSubscription{Tier: TierSupporter, Status: "canceled", CurrentPeriodEnd: past}, want: false},
		{name: "past due", sub: database.BillingSubscription{Tier: TierSupporter, Status: "past_due"}, want: false},
		{name: "wrong tier", sub: database.BillingSubscription{Tier: TierFree, Status: "active"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, subscriptionIsAdFree(now, tt.sub))
		})
	}
}

func TestGiftWindowUsesCalendarMonthsAndStacks(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, time.January, 31, 12, 0, 0, 0, time.UTC)
	start, expires := giftWindow(now, pgtype.Timestamptz{}, 1)
	require.Equal(t, now, start)
	require.Equal(t, now.AddDate(0, 1, 0), expires)

	latest := pgtype.Timestamptz{Time: time.Date(2026, time.April, 15, 12, 0, 0, 0, time.UTC), Valid: true}
	start, expires = giftWindow(now, latest, 3)
	require.Equal(t, latest.Time, start)
	require.Equal(t, latest.Time.AddDate(0, 3, 0), expires)
}
