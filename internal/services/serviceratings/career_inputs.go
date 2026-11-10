package serviceratings

import (
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"time"
)

// CareerInputs retains both metric candidates without embedding mutable weights
// or awards. Producers supply boss-based raid scores, never guild clear scores.
type CareerInputs struct {
	Raids []CareerRaidInput
	Kills []CareerBossKills
}

type CareerRaidInput struct {
	leaderboardconfig.CareerKey
	Metric        string
	Mastery       float64
	Peak          float64
	EligibleKills int64
}

type CareerBossKills struct {
	leaderboardconfig.CareerKey
	Boss  string
	Count int64
}

// CareerSummary is a transport-free reduction of persisted inputs. Nil averages
// mean configuration is blocked or there is no active positive denominator.
type CareerSummary struct {
	ChosenMetric            *string
	PerformanceStatus       string
	Mastery                 *float64
	Peak                    *float64
	Renown                  float64
	Issues                  []leaderboardconfig.CareerIssue
	PoolFingerprint         string
	StoredPolicyFingerprint string
	ComputedAt              *time.Time
	RefreshPending          bool
	Contributions           []CareerContribution
}

type CareerContribution struct {
	leaderboardconfig.CareerKey
	IncludeAverage      bool
	IncludeRenown       bool
	Weight              *float64
	Mastery             float64
	Peak                float64
	Renown              float64
	EligibleMetricKills int64
	EligibleRenownKills int64
}

// ReduceCareer applies current policy but never changes the persisted metric.
// A missing subject raid contributes zero with its full denominator weight.
// The storage reader sets computation/fingerprint freshness separately.
func ReduceCareer(pool leaderboardconfig.CareerPool, inputs CareerInputs, chosen string) CareerSummary {
	out := CareerSummary{Issues: pool.Issues, PoolFingerprint: pool.Fingerprint, PerformanceStatus: "no_active_raids", Contributions: []CareerContribution{}}
	validMetric := chosen == "dps" || chosen == "hps" || chosen == "kill_time"
	if validMetric {
		out.ChosenMetric = &chosen
	}
	var denominator, mastery, peak float64
	var metricKills int64
	for _, variant := range pool.Variants {
		if !variant.Active {
			continue
		}
		contribution := CareerContribution{CareerKey: variant.CareerKey, IncludeAverage: variant.IncludeAverage, IncludeRenown: variant.IncludeRenown, Weight: variant.Weight}
		if variant.IncludeRenown {
			for _, boss := range variant.RenownBosses {
				for _, kill := range inputs.Kills {
					if kill.CareerKey != variant.CareerKey || kill.Boss != boss.Name {
						continue
					}
					contribution.EligibleRenownKills += kill.Count
					if boss.HasPoints {
						contribution.Renown += float64(kill.Count) * boss.Points
					}
				}
			}
		}
		out.Renown += contribution.Renown
		if variant.IncludeAverage {
			for _, raid := range inputs.Raids {
				if raid.CareerKey == variant.CareerKey && raid.Metric == chosen {
					contribution.Mastery += raid.Mastery
					contribution.Peak += raid.Peak
					contribution.EligibleMetricKills += raid.EligibleKills
				}
			}
			metricKills += contribution.EligibleMetricKills
			if variant.Weight != nil {
				denominator += *variant.Weight
				mastery += contribution.Mastery * *variant.Weight
				peak += contribution.Peak * *variant.Weight
			}
		}
		out.Contributions = append(out.Contributions, contribution)
	}
	if !pool.AveragesReady() {
		out.PerformanceStatus = "weights_pending"
		for _, issue := range pool.Issues {
			if issue.Code != leaderboardconfig.CareerMissingWeight {
				out.PerformanceStatus = "configuration_pending"
				break
			}
		}
	} else if denominator > 0 {
		if !validMetric {
			out.PerformanceStatus = "preparing"
		} else if metricKills == 0 {
			out.PerformanceStatus = "no_evidence"
		} else {
			out.PerformanceStatus = "ready"
			mastery /= denominator
			peak /= denominator
			out.Mastery, out.Peak = &mastery, &peak
		}
	}
	return out
}

// ChooseCareerMetric is a publication-time decision, not a read-time fallback.
// A blocked/empty average cannot select a winner. Guilds use kill_time directly.
func ChooseCareerMetric(pool leaderboardconfig.CareerPool, inputs CareerInputs) string {
	dps, hps := ReduceCareer(pool, inputs, "dps"), ReduceCareer(pool, inputs, "hps")
	if dps.PerformanceStatus != "ready" && dps.PerformanceStatus != "no_evidence" {
		return ""
	}
	if hps.PerformanceStatus != "ready" && hps.PerformanceStatus != "no_evidence" {
		return ""
	}
	if dps.Mastery == nil && hps.Mastery == nil {
		return ""
	}
	if dps.Mastery == nil {
		return "hps"
	}
	if hps.Mastery == nil {
		return "dps"
	}
	if *dps.Mastery > *hps.Mastery {
		return "dps"
	}
	if *hps.Mastery > *dps.Mastery {
		return "hps"
	}
	var damageKills, healingKills int64
	for _, variant := range pool.Variants {
		if !variant.Active || !variant.IncludeAverage {
			continue
		}
		for _, raid := range inputs.Raids {
			if raid.CareerKey != variant.CareerKey {
				continue
			}
			switch raid.Metric {
			case "dps":
				damageKills += raid.EligibleKills
			case "hps":
				healingKills += raid.EligibleKills
			}
		}
	}
	if healingKills > damageKills {
		return "hps"
	}
	return "dps"
}
