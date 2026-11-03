package ratingmath

import (
	"errors"
	"math"
	"slices"
	"time"
)

// ParseObservation is a canonical, eligible locked parse for one character and boss.
// Callers select the cohort and time window before passing observations here.
type ParseObservation struct {
	Score    float64
	KilledAt time.Time
	ID       string // stable tie-breaker for equal scores and timestamps
}

type MasteryPolicy struct {
	BestWeight  float64
	FormWeight  float64
	FloorWeight float64
	// RankWeight receives the full eligible kill count, including excluded lows.
	RankWeight func(int) float64
}

type MasteryResult struct {
	Best, Form, Floor, Mastery, Ranked, Confidence float64
	EligibleKills, ExcludedKills                   int
}

// ScoreMastery computes per-boss values without changing historical parse
// scores. Missing parses do not become zero-valued observations.
func ScoreMastery(observations []ParseObservation, policy MasteryPolicy) (MasteryResult, error) {
	var result MasteryResult
	if len(observations) == 0 {
		return result, nil
	}
	if policy.RankWeight == nil ||
		policy.BestWeight < 0 || policy.FormWeight < 0 || policy.FloorWeight < 0 ||
		math.Abs(policy.BestWeight+policy.FormWeight+policy.FloorWeight-1) > 1e-9 {
		return result, errors.New("invalid Mastery policy")
	}
	items := slices.Clone(observations)
	for _, observation := range items {
		if math.IsNaN(observation.Score) || math.IsInf(observation.Score, 0) || observation.Score < 0 || observation.Score > 100 {
			return result, errors.New("locked parse must be between 0 and 100")
		}
		if observation.Score > result.Best {
			result.Best = observation.Score
		}
	}
	slices.SortFunc(items, func(a, b ParseObservation) int {
		if a.Score < b.Score {
			return -1
		}
		if a.Score > b.Score {
			return 1
		}
		if n := a.KilledAt.Compare(b.KilledAt); n != 0 {
			return n
		}
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
	result.EligibleKills = len(items)
	result.ExcludedKills = DropCount(len(items))
	items = items[result.ExcludedKills:]
	// Use the lower nearest-rank quantiles of the retained, score-ordered
	// kills. Timestamps only determine eligibility and stable tie order.
	result.Form = items[(len(items)-1)/2].Score
	result.Floor = items[(len(items)-1)/4].Score
	result.Mastery = policy.BestWeight*result.Best + policy.FormWeight*result.Form + policy.FloorWeight*result.Floor
	result.Confidence = 1 - math.Exp(-float64(result.EligibleKills)/4)
	weight := policy.RankWeight(result.EligibleKills)
	if math.IsNaN(weight) || weight < 0 || weight > 1 {
		return MasteryResult{}, errors.New("invalid ranking weight")
	}
	result.Ranked = result.Mastery * weight
	return result, nil
}

// Peak is a moving comparison of a character's best positive raw metric with
// rank one in the same explicitly selected cohort and window.
func Peak(best, rankOne float64) (float64, error) {
	if math.IsNaN(best) || math.IsNaN(rankOne) || math.IsInf(best, 0) || math.IsInf(rankOne, 0) || best <= 0 || rankOne <= 0 || best > rankOne {
		return 0, errors.New("invalid Peak comparison")
	}
	return 100 * best / rankOne, nil
}

// PeakTime compares a guild's fastest eligible boss kill to the fastest
// eligible kill in its tenant cohort. Lower durations are better.
func PeakTime(best, rankOne float64) (float64, error) {
	if math.IsNaN(best) || math.IsNaN(rankOne) || math.IsInf(best, 0) || math.IsInf(rankOne, 0) ||
		best <= 0 || rankOne <= 0 || best < rankOne {
		return 0, errors.New("invalid time Peak comparison")
	}
	return 100 * rankOne / best, nil
}

// RenownAward credits the configured points for one eligible boss kill.
// It deliberately does not inspect parse score or raw performance.
func RenownAward(bossPoints float64) (float64, error) {
	if math.IsNaN(bossPoints) || math.IsInf(bossPoints, 0) || bossPoints < 0 {
		return 0, errors.New("invalid Renown points")
	}
	return bossPoints, nil
}
