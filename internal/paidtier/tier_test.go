package paidtier

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestEffective(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		keys []string
		want string
	}{
		{want: Free},
		{keys: []string{"unknown", "chronicle-honored"}, want: Honored},
		{keys: []string{"chronicle-revered", "chronicle-honored"}, want: Revered},
		{keys: []string{"chronicle-exalted", "chronicle-revered", "chronicle-honored"}, want: Exalted},
	} {
		rows := make([]database.BillingEntitlement, 0, len(tc.keys))
		for _, key := range tc.keys {
			rows = append(rows, database.BillingEntitlement{EntitlementKey: key})
		}
		require.Equal(t, tc.want, Effective(rows))
	}
}
