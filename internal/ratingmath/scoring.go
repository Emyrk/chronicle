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
	HalfLife    time.Duration
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
	if policy.HalfLife <= 0 || policy.RankWeight == nil ||
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
	// Normalizing to the newest retained observation does not change weighted
	// quantiles: the excluded latest kill would multiply every retained weight
	// by the same factor, which cancels in each cumulative threshold.
	latest := items[0].KilledAt
	for _, item := range items {
		if item.KilledAt.After(latest) {
			latest = item.KilledAt
		}
	}
	weights := make([]float64, len(items))
	var total float64
	for i, item := range items {
		weights[i] = math.Exp2(-latest.Sub(item.KilledAt).Hours() / policy.HalfLife.Hours())
		total += weights[i]
	}
	if total == 0 {
		return MasteryResult{}, errors.New("recency weights underflowed")
	}
	quantile := func(q float64) float64 {
		var cumulative float64
		for i, item := range items {
			cumulative += weights[i]
			if cumulative >= q*total {
				return item.Score
			}
		}
		return items[len(items)-1].Score
	}
	result.Form, result.Floor = quantile(0.5), quantile(0.25)
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

// RenownAward adds the configured boss credit and designated final-boss
// bonus. It deliberately does not inspect parse score or raw performance.
func RenownAward(bossPoints, finalBossBonus float64, isFinalBoss bool) (float64, error) {
	if math.IsNaN(bossPoints) || math.IsInf(bossPoints, 0) || bossPoints < 0 || math.IsNaN(finalBossBonus) || math.IsInf(finalBossBonus, 0) || finalBossBonus < 0 {
		return 0, errors.New("invalid Renown points")
	}
	if isFinalBoss {
		award := bossPoints + finalBossBonus
		if math.IsInf(award, 0) {
			return 0, errors.New("renown award overflows")
		}
		return award, nil
	}
	return bossPoints, nil
}
