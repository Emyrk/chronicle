package ratingmath

import (
	"context"
	"errors"
	"math"
)

// MasteryReplay visits the same immutable observations in ascending
// (Score, KilledAt, ID) order on every call. It may fetch them in pages, but
// must propagate visit errors and stop visiting when one is returned. The
// caller must be able to replay the entire sequence from the beginning.
// Neither replay nor visit may retain observations after the call returns.
type MasteryReplay func(context.Context, func(ParseObservation) error) error

// ScoreMasteryStream computes the same result as ScoreMastery with constant
// memory. It replays the input four times: count/validate/best, newest retained
// kill, total retained recency weight, and retained weighted quantiles. The
// supplied context is checked between observations and passed to each replay.
// On error it returns a zero result. Empty input needs only one replay and,
// like ScoreMastery, does not validate the policy.
func ScoreMasteryStream(ctx context.Context, replay MasteryReplay, policy MasteryPolicy) (MasteryResult, error) {
	var result MasteryResult
	if replay == nil {
		return result, errors.New("nil Mastery replay")
	}
	// Check cancellation even if a replay has no observations.
	visit := func(fn func(ParseObservation) error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		var previous ParseObservation
		seen := false
		var visitErr error
		err := replay(ctx, func(item ParseObservation) error {
			if visitErr != nil {
				return visitErr
			}
			if visitErr = ctx.Err(); visitErr != nil {
				return visitErr
			}
			if math.IsNaN(item.Score) || math.IsInf(item.Score, 0) || item.Score < 0 || item.Score > 100 {
				visitErr = errors.New("locked parse must be between 0 and 100")
			} else if seen && (item.Score < previous.Score ||
				item.Score == previous.Score && (item.KilledAt.Before(previous.KilledAt) ||
					item.KilledAt.Equal(previous.KilledAt) && item.ID < previous.ID)) {
				visitErr = errors.New("mastery observations must be sorted")
			}
			if visitErr != nil {
				return visitErr
			}
			previous, seen = item, true
			visitErr = fn(item)
			return visitErr
		})
		if visitErr != nil {
			return visitErr
		}
		if err != nil {
			return err
		}
		return ctx.Err()
	}

	if err := visit(func(item ParseObservation) error {
		result.EligibleKills++
		if item.Score > result.Best {
			result.Best = item.Score
		}
		return nil
	}); err != nil {
		return MasteryResult{}, err
	}
	if result.EligibleKills == 0 {
		return result, nil
	}
	if policy.HalfLife <= 0 || policy.RankWeight == nil ||
		policy.BestWeight < 0 || policy.FormWeight < 0 || policy.FloorWeight < 0 ||
		math.Abs(policy.BestWeight+policy.FormWeight+policy.FloorWeight-1) > 1e-9 {
		return MasteryResult{}, errors.New("invalid Mastery policy")
	}
	result.ExcludedKills = DropCount(result.EligibleKills)
	retained := result.EligibleKills - result.ExcludedKills
	// The latest must be among retained rows: excluded lows can be newer than
	// every retained kill, and anchoring to them can underflow all weights.
	var latest ParseObservation
	haveLatest := false
	if err := visitRetained(visit, result.ExcludedKills, retained, func(item ParseObservation) {
		if !haveLatest || item.KilledAt.After(latest.KilledAt) {
			latest = item
			haveLatest = true
		}
	}); err != nil {
		return MasteryResult{}, err
	}
	weight := func(item ParseObservation) float64 {
		return math.Exp2(-latest.KilledAt.Sub(item.KilledAt).Hours() / policy.HalfLife.Hours())
	}
	var total float64
	if err := visitRetained(visit, result.ExcludedKills, retained, func(item ParseObservation) {
		total += weight(item)
	}); err != nil {
		return MasteryResult{}, err
	}
	if total == 0 {
		return MasteryResult{}, errors.New("recency weights underflowed")
	}
	var cumulative, lastScore float64
	floorFound, formFound := false, false
	if err := visitRetained(visit, result.ExcludedKills, retained, func(item ParseObservation) {
		cumulative += weight(item)
		lastScore = item.Score
		if !floorFound && cumulative >= .25*total {
			result.Floor, floorFound = item.Score, true
		}
		if !formFound && cumulative >= .5*total {
			result.Form, formFound = item.Score, true
		}
	}); err != nil {
		return MasteryResult{}, err
	}
	// Match ScoreMastery's fallback when rounding leaves a threshold unmet.
	if !floorFound {
		result.Floor = lastScore
	}
	if !formFound {
		result.Form = lastScore
	}
	result.Mastery = policy.BestWeight*result.Best + policy.FormWeight*result.Form + policy.FloorWeight*result.Floor
	result.Confidence = 1 - math.Exp(-float64(result.EligibleKills)/4)
	rankWeight := policy.RankWeight(result.EligibleKills)
	if math.IsNaN(rankWeight) || rankWeight < 0 || rankWeight > 1 {
		return MasteryResult{}, errors.New("invalid ranking weight")
	}
	result.Ranked = result.Mastery * rankWeight
	return result, nil
}

// visitRetained skips the lowest rows in a full replay, checking its length.
// The replay must represent the same immutable snapshot on every pass.
func visitRetained(visit func(func(ParseObservation) error) error, drop, retained int, fn func(ParseObservation)) error {
	count := 0
	err := visit(func(item ParseObservation) error {
		if count >= drop && count < drop+retained {
			fn(item)
		}
		count++
		return nil
	})
	if err != nil {
		return err
	}
	if count != drop+retained {
		return errors.New("mastery replay changed length")
	}
	return nil
}
