// Package roleinfer provides source-aware tank inference from incoming
// hostile auto-attack counts. The algorithm is deliberately class/spec/stance
// agnostic — it relies only on who hostile NPCs choose to melee.
//
// # Algorithm
//
// For each encounter and hostile source, count how many Auto Attack attempts
// each player received (including zero-damage misses, dodges, parries, etc.).
// Let maxAttempts be the highest count any player received from that source.
//
//	sourceScore = playerAttempts / (maxAttempts + EvidenceAttempts)
//
// Each player keeps their best sourceScore per encounter. Across selected
// encounters, cumulative evidence is compared with the player who accumulated
// the most evidence:
//
//	persistenceScore = playerCumulativeScore / maxCumulativeScore
//	tankScore = min(strongestSourceScore, persistenceScore)
//
// A player is classified as a tank when TankScore ≥ TankThreshold. This keeps
// single-encounter behavior unchanged while requiring evidence to persist when
// several encounters are selected.
package roleinfer

// AlgorithmVersion should be bumped whenever the scoring formula or thresholds
// change so that downstream consumers (frontend, stored data) can detect
// incompatible versions.
const AlgorithmVersion = 2

// TankThreshold is the one global classification cutoff. Both strongest-source
// evidence and cross-encounter persistence must reach this value because
// TankScore is the lesser of those scores.
const TankThreshold = 0.4

// EvidenceAttempts is added to maxAttempts in the denominator so that
// sources with very few swings cannot trivially produce a score of 1.0.
const EvidenceAttempts = 5

// IncomingAutoAttacks maps source → player → attempt count.
// "source" is a hostile NPC; "player" is a raid member.
type IncomingAutoAttacks[S comparable, P comparable] map[S]map[P]int

// TankResult holds the inference output for a single player.
type TankResult[S comparable] struct {
	// TankScore is the lesser of StrongestSourceScore and PersistenceScore.
	TankScore float64
	// StrongestSourceScore is the best source score in any encounter.
	StrongestSourceScore float64
	// CumulativeScore is the sum of the player's best source score per encounter.
	CumulativeScore float64
	// PersistenceScore compares CumulativeScore with the largest player total.
	PersistenceScore float64
	// IsTank is true when TankScore ≥ TankThreshold.
	IsTank bool
	// StrongestSource is the source key that produced StrongestSourceScore.
	// Zero-value when no auto-attacks were recorded.
	StrongestSource S
	// PlayerAttempts is the number of auto-attack attempts from the strongest
	// source directed at this player.
	PlayerAttempts int
	// MaxAttempts is the highest attempt count any player received from the
	// strongest source.
	MaxAttempts int
}

// InferTanks classifies one encounter's incoming hostile Auto Attack counts.
// It is equivalent to InferTanksAcrossEncounters with a single encounter.
func InferTanks[S comparable, P comparable](attacks IncomingAutoAttacks[S, P]) map[P]*TankResult[S] {
	return InferTanksAcrossEncounters([]IncomingAutoAttacks[S, P]{attacks})
}

// InferTanksAcrossEncounters classifies players across a selected encounter
// range. Returns a result per player that appears in at least one source's
// target map.
func InferTanksAcrossEncounters[S comparable, P comparable](encounters []IncomingAutoAttacks[S, P]) map[P]*TankResult[S] {
	results := make(map[P]*TankResult[S])

	for _, attacks := range encounters {
		// Only the strongest source for a player in each encounter contributes to
		// cumulative evidence. This avoids encounters with many adds receiving
		// disproportionate weight.
		encounterBest := make(map[P]float64)

		for src, targets := range attacks {
			var maxAttempts int
			for _, count := range targets {
				if count > maxAttempts {
					maxAttempts = count
				}
			}
			denom := float64(maxAttempts + EvidenceAttempts)

			for player, count := range targets {
				score := float64(count) / denom
				if score > encounterBest[player] {
					encounterBest[player] = score
				}

				result := results[player]
				if result == nil {
					result = &TankResult[S]{}
					results[player] = result
				}
				if score > result.StrongestSourceScore {
					result.StrongestSourceScore = score
					result.StrongestSource = src
					result.PlayerAttempts = count
					result.MaxAttempts = maxAttempts
				}
			}
		}

		for player, score := range encounterBest {
			results[player].CumulativeScore += score
		}
	}

	var maxCumulativeScore float64
	for _, result := range results {
		if result.CumulativeScore > maxCumulativeScore {
			maxCumulativeScore = result.CumulativeScore
		}
	}

	for _, result := range results {
		if maxCumulativeScore > 0 {
			result.PersistenceScore = result.CumulativeScore / maxCumulativeScore
		}
		result.TankScore = min(result.StrongestSourceScore, result.PersistenceScore)
		result.IsTank = result.TankScore >= TankThreshold
	}

	return results
}
