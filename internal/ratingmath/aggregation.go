package ratingmath

import (
	"errors"
	"math"
)

// WeightedBoss identifies one eligible boss in the selected group's current
// content manifest. Missing scores contribute zero but retain their weight in
// the denominator. Callers must provide a complete, unique manifest.
type WeightedBoss struct {
	Instance, Encounter string
	Weight              float64
}

type BossKey struct {
	Instance, Encounter string
}

// AggregateBossScores computes a comparable 0-100 raid or portfolio score.
// A caller must partition scores by group, metric, spec, and window first.
func AggregateBossScores(manifest []WeightedBoss, scores map[BossKey]float64) (float64, error) {
	if len(manifest) == 0 {
		return 0, errors.New("empty eligible boss manifest")
	}
	seen := make(map[BossKey]bool, len(manifest))
	var total, weighted float64
	for _, boss := range manifest {
		key := BossKey{Instance: boss.Instance, Encounter: boss.Encounter}
		if key.Instance == "" || key.Encounter == "" || seen[key] || boss.Weight <= 0 || math.IsNaN(boss.Weight) || math.IsInf(boss.Weight, 0) {
			return 0, errors.New("invalid eligible boss manifest")
		}
		seen[key] = true
		score := scores[key]
		if score < 0 || score > 100 || math.IsNaN(score) || math.IsInf(score, 0) {
			return 0, errors.New("invalid boss score")
		}
		weighted += boss.Weight * score
		total += boss.Weight
	}
	if math.IsInf(total, 0) || math.IsInf(weighted, 0) {
		return 0, errors.New("boss weights overflow")
	}
	return weighted / total, nil
}
