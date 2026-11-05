package infrastructurecosts

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUnitEconomicsConcentrationUsesActiveUserPercentiles(t *testing.T) {
	t.Parallel()

	allocations := make([]UserAllocation, 0, 101)
	for cost := int64(1); cost <= 100; cost++ {
		allocations = append(allocations, UserAllocation{ActiveUploader: true, TotalCostMicrodollars: cost})
	}
	// Storage-only users are excluded from the active-uploader distribution and denominator.
	allocations = append(allocations, UserAllocation{ActiveUploader: false, TotalCostMicrodollars: 10_000})

	got := unitEconomics(15_050, UsageSummary{}, allocations)
	require.InDelta(t, 100.0/5050.0, got.Concentration.Top1, 0.0000001)
	require.InDelta(t, 490.0/5050.0, got.Concentration.Top5, 0.0000001)
	require.InDelta(t, 955.0/5050.0, got.Concentration.Top10, 0.0000001)
}
