// Package roleinfer provides source-aware tank inference from incoming
// hostile auto-attack counts. The algorithm is deliberately class/spec/stance
// agnostic — it relies only on who hostile NPCs choose to melee.
//
// # Algorithm
//
// For each hostile source, count how many Auto Attack attempts each player
// received (including zero-damage misses, dodges, parries, etc.).
// Let maxAttempts be the highest count any player received from that source.
//
//	sourceScore = playerAttempts / (maxAttempts + EvidenceAttempts)
//
// A player's TankScore is the maximum sourceScore across all sources.
// A player is classified as a tank when TankScore ≥ TankThreshold.
package roleinfer

// AlgorithmVersion should be bumped whenever the scoring formula or thresholds
// change so that downstream consumers (frontend, stored data) can detect
// incompatible versions.
const AlgorithmVersion = 1

// TankThreshold is the global classification cutoff: any player with
// TankScore ≥ TankThreshold is classified as a tank.
const TankThreshold = 0.5

// EvidenceAttempts is added to maxAttempts in the denominator so that
// sources with very few swings cannot trivially produce a score of 1.0.
const EvidenceAttempts = 5

// SourceKey identifies a hostile NPC source. Callers should use whatever
// unique identifier makes sense (e.g. a GUID). The type is generic.

// IncomingAutoAttacks maps source → player → attempt count.
// "source" is a hostile NPC; "player" is a raid member.
type IncomingAutoAttacks[S comparable, P comparable] map[S]map[P]int

// TankResult holds the inference output for a single player.
type TankResult struct {
	// TankScore is the maximum sourceScore across all hostile sources.
	TankScore float64
	// IsTank is true when TankScore ≥ TankThreshold.
	IsTank bool
	// StrongestSource is the source key that produced the highest sourceScore.
	// Zero-value when no auto-attacks were recorded.
	StrongestSource any
	// PlayerAttempts is the number of auto-attack attempts from the strongest
	// source directed at this player.
	PlayerAttempts int
	// MaxAttempts is the highest attempt count any player received from the
	// strongest source.
	MaxAttempts int
}

// InferTanks classifies players as tanks based on incoming hostile auto-attack
// attempt counts. Returns a result per player that appears in at least one
// source's target map.
func InferTanks[S comparable, P comparable](attacks IncomingAutoAttacks[S, P]) map[P]*TankResult {
	// Collect all players that appear anywhere.
	allPlayers := make(map[P]struct{})
	for _, targets := range attacks {
		for p := range targets {
			allPlayers[p] = struct{}{}
		}
	}

	results := make(map[P]*TankResult, len(allPlayers))
	for p := range allPlayers {
		results[p] = &TankResult{}
	}

	for src, targets := range attacks {
		// Find maxAttempts for this source.
		var maxAttempts int
		for _, count := range targets {
			if count > maxAttempts {
				maxAttempts = count
			}
		}
		denom := float64(maxAttempts + EvidenceAttempts)

		for p, count := range targets {
			score := float64(count) / denom
			r := results[p]
			if score > r.TankScore {
				r.TankScore = score
				r.StrongestSource = src
				r.PlayerAttempts = count
				r.MaxAttempts = maxAttempts
			}
		}
	}

	for _, r := range results {
		r.IsTank = r.TankScore >= TankThreshold
	}

	return results
}
