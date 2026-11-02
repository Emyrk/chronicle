package ratingmath

import "github.com/Emyrk/chronicle/database"

// Edge of Madness rotates its four bosses. Each distinct encounter earns full
// rank credit after one kill; the global policy still applies to other bosses.
func masteryRankWeight(policy database.RatingGroupPolicy, instance, boss string) func(int) float64 {
	fullRankKills := policy.FullRankKills
	if instance == "Zul'Gurub" {
		switch boss {
		case "Gri'lek", "Hazza'rah", "Renataki", "Wushoolay":
			fullRankKills = 1
		}
	}
	return func(n int) float64 {
		if n >= int(fullRankKills) || fullRankKills == 1 {
			return 1
		}
		return policy.RankOneWeight + (1-policy.RankOneWeight)*float64(n-1)/float64(fullRankKills-1)
	}
}
