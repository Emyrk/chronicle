package ratingmath

import (
	"math"
	"testing"
)

func TestTenantScopeScoresObservedWeightsAndRotatingSlots(t *testing.T) {
	t.Parallel()
	bosses := []tenantScopeBoss{
		{instance: "ZG", encounter: "Edge A", slot: "Edge", score: 70},
		{instance: "ZG", encounter: "Edge B", slot: "Edge", score: 90},
		{instance: "ZG", encounter: "Hakkar", slot: "Hakkar", score: 50},
		{instance: "MC", encounter: "Ragnaros", slot: "Ragnaros", score: 100},
	}
	// The two Edge variants occupy one slot. Unobserved bosses and raids
	// cannot enter the denominator, even if their weights are available.
	bossWeights := map[tenantScopeSlot]float64{
		{"ZG", "Edge"}: 3, {"ZG", "Hakkar"}: 1,
		{"MC", "Ragnaros"}: 2, {"MC", "unobserved"}: 999,
	}
	raidWeights := map[string]float64{"ZG": 1, "MC": 3, "unobserved": 999}
	for _, rating := range []string{"peak", "mastery", "ranked_mastery"} {
		rating := rating
		t.Run(rating, func(t *testing.T) {
			t.Parallel()
			raids, global, err := tenantScopeScores(rating, bosses, bossWeights, raidWeights)
			if err != nil {
				t.Fatal(err)
			}
			if len(raids) != 2 || raids["ZG"] != 80 || raids["MC"] != 100 || global != 95 {
				t.Fatalf("raids=%v global=%v", raids, global)
			}
		})
	}
}

func TestTenantScopeScoresRenownSumsEarnedPoints(t *testing.T) {
	t.Parallel()
	bosses := []tenantScopeBoss{
		{instance: "ZG", encounter: "Edge A", slot: "Edge", score: 10},
		{instance: "ZG", encounter: "Edge B", slot: "Edge", score: 20},
		{instance: "MC", encounter: "Ragnaros", slot: "Ragnaros", score: 30},
	}
	raids, global, err := tenantScopeScores("renown", bosses, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(raids) != 2 || raids["ZG"] != 30 || raids["MC"] != 30 || global != 60 {
		t.Fatalf("raids=%v global=%v", raids, global)
	}
}

func TestTenantScopeScoresRejectsMissingPolicyOrInvalidEvidence(t *testing.T) {
	t.Parallel()
	boss := []tenantScopeBoss{{instance: "ZG", encounter: "Edge A", slot: "Edge", score: 90}}
	for _, tc := range []struct {
		name   string
		bosses []tenantScopeBoss
		bossW  map[tenantScopeSlot]float64
		raidW  map[string]float64
	}{
		{"missing boss weight", boss, nil, map[string]float64{"ZG": 1}},
		{"missing raid weight", boss, map[tenantScopeSlot]float64{{"ZG", "Edge"}: 1}, nil},
		{"invalid boss weight", boss, map[tenantScopeSlot]float64{{"ZG", "Edge"}: math.NaN()}, map[string]float64{"ZG": 1}},
		{"duplicate boss", append(append([]tenantScopeBoss{}, boss...), boss...), nil, nil},
		{"invalid score", []tenantScopeBoss{{instance: "ZG", encounter: "Edge A", slot: "Edge", score: math.Inf(1)}}, nil, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if _, _, err := tenantScopeScores("peak", tc.bosses, tc.bossW, tc.raidW); err == nil {
				t.Fatal("expected error")
			}
		})
	}
	if _, _, err := tenantScopeScores("invalid", boss, nil, nil); err == nil {
		t.Fatal("expected invalid rating error")
	}
	if raids, global, err := tenantScopeScores("peak", nil, nil, nil); err != nil || raids != nil || global != 0 {
		t.Fatalf("empty: raids=%v global=%v err=%v", raids, global, err)
	}
}
