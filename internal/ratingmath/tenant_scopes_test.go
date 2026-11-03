package ratingmath

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTenantScopeScoresObservedBossesAndEdgeRotation(t *testing.T) {
	t.Parallel()
	bosses := []tenantScopeBoss{
		{instance: "Zul'Gurub", encounter: "Gri'lek", score: 70},
		{instance: "Zul'Gurub", encounter: "Hazza'rah", score: 90},
		{instance: "Zul'Gurub", encounter: "Hakkar", score: 50},
		{instance: "Molten Core", encounter: "Ragnaros", score: 100},
	}
	for _, rating := range []string{"peak", "mastery", "ranked_mastery"} {
		raids, err := tenantScopeScores(rating, bosses)
		require.NoError(t, err)
		require.Equal(t, map[string]float64{"Zul'Gurub": 70, "Molten Core": 100}, raids,
			"only observed logical slots count; no global score")
	}
	raids, err := tenantScopeScores("renown", bosses)
	require.NoError(t, err)
	require.Equal(t, map[string]float64{"Zul'Gurub": 210, "Molten Core": 100}, raids,
		"Renown sums individual curated awards, even for rotating bosses")
}

func TestTenantScopeScoresMissingBossAndInvalidEvidence(t *testing.T) {
	t.Parallel()
	raids, err := tenantScopeScores("peak", []tenantScopeBoss{{instance: "Raid", encounter: "Only boss", score: 90}})
	require.NoError(t, err)
	require.Equal(t, map[string]float64{"Raid": 90}, raids, "missing bosses are omitted, not scored as zero")
	raids, err = tenantScopeScores("peak", nil)
	require.NoError(t, err)
	require.Empty(t, raids)
	for _, tc := range [][]tenantScopeBoss{
		{{instance: "Raid", encounter: "Boss", score: math.Inf(1)}},
		{{instance: "Raid", encounter: "Boss", score: -1}},
		{{instance: "Raid", encounter: "Boss", score: 1}, {instance: "Raid", encounter: "Boss", score: 1}},
	} {
		_, err := tenantScopeScores("peak", tc)
		require.Error(t, err)
	}
	_, err = tenantScopeScores("unknown", nil)
	require.Error(t, err)
}
