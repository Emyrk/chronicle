package serviceratings

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/stretchr/testify/require"
)

func TestCareerReduction(t *testing.T) {
	t.Parallel()
	a := leaderboardconfig.CareerKey{Instance: "A", Difficulty: "Normal", MaxPlayers: 10}
	b := leaderboardconfig.CareerKey{Instance: "A", Difficulty: "Heroic", MaxPlayers: 25}
	os := leaderboardconfig.CareerKey{Instance: "Obsidian Sanctum", MaxPlayers: 10}
	weight := 2.0
	pool := leaderboardconfig.CareerPool{Fingerprint: "current", Variants: []leaderboardconfig.CareerVariant{
		{CareerKey: a, Active: true, IncludeAverage: true, IncludeRenown: true, Weight: &weight, RenownBosses: []leaderboardconfig.CareerBoss{{Name: "boss", Points: 3, HasPoints: true}}},
		{CareerKey: b, Active: true, IncludeAverage: true, Weight: &weight},
		{CareerKey: os, Active: true, IncludeRenown: true, RenownBosses: []leaderboardconfig.CareerBoss{{Name: "optional", Points: 0, HasPoints: true}}},
	}}
	inputs := CareerInputs{Raids: []CareerRaidInput{
		{CareerKey: a, Metric: "dps", Mastery: 80, Peak: 90, EligibleKills: 1},
		{CareerKey: a, Metric: "hps", Mastery: 70, Peak: 99, EligibleKills: 4},
	}, Kills: []CareerBossKills{{CareerKey: a, Boss: "boss", Count: 2}, {CareerKey: os, Boss: "optional", Count: 5}}}
	require.Equal(t, "dps", ChooseCareerMetric(pool, inputs))
	got := ReduceCareer(pool, inputs, "dps")
	require.Equal(t, "ready", got.PerformanceStatus)
	require.Equal(t, 40.0, *got.Mastery)
	require.Equal(t, 45.0, *got.Peak)
	require.Equal(t, 6.0, got.Renown)
	require.Len(t, got.Contributions, 3)
	require.Zero(t, got.Contributions[1].Mastery)
	require.EqualValues(t, 5, got.Contributions[2].EligibleRenownKills)
	require.Zero(t, got.Contributions[2].Renown)
	require.Equal(t, "current", got.PoolFingerprint)

	inputs.Raids[1].Mastery = 80
	require.Equal(t, "hps", ChooseCareerMetric(pool, inputs))
	inputs.Raids[1].EligibleKills = 1
	require.Equal(t, "dps", ChooseCareerMetric(pool, inputs))

	pool.Issues = []leaderboardconfig.CareerIssue{{CareerKey: a, Code: leaderboardconfig.CareerMissingWeight}}
	got = ReduceCareer(pool, inputs, "dps")
	require.Equal(t, "weights_pending", got.PerformanceStatus)
	require.Nil(t, got.Mastery)
	require.Nil(t, got.Peak)
	require.Equal(t, 6.0, got.Renown)
	require.Empty(t, ChooseCareerMetric(pool, inputs))
	pool.Issues[0].Code = leaderboardconfig.CareerEmptyAverage
	require.Equal(t, "configuration_pending", ReduceCareer(pool, inputs, "dps").PerformanceStatus)
}

func TestCareerUnavailableAndGuild(t *testing.T) {
	t.Parallel()
	require.Equal(t, "no_active_raids", ReduceCareer(leaderboardconfig.CareerPool{}, CareerInputs{}, "").PerformanceStatus)
	key := leaderboardconfig.CareerKey{Instance: "raid"}
	weight := 1.0
	pool := leaderboardconfig.CareerPool{Variants: []leaderboardconfig.CareerVariant{{CareerKey: key, Active: true, IncludeAverage: true, Weight: &weight}}}
	preparing := ReduceCareer(pool, CareerInputs{}, "")
	require.Equal(t, "preparing", preparing.PerformanceStatus)
	require.Nil(t, preparing.ChosenMetric)
	require.Equal(t, "no_evidence", ReduceCareer(pool, CareerInputs{}, "dps").PerformanceStatus)
	require.Empty(t, ChooseCareerMetric(pool, CareerInputs{}))
	inputs := CareerInputs{Raids: []CareerRaidInput{{CareerKey: key, Metric: "kill_time", Mastery: 60, Peak: 80, EligibleKills: 1}}}
	got := ReduceCareer(pool, inputs, "kill_time")
	require.Equal(t, "ready", got.PerformanceStatus)
	require.Equal(t, 60.0, *got.Mastery)
	require.Equal(t, 80.0, *got.Peak)
	// A player with only one metric must not lose to a synthetic absent candidate.
	inputs.Raids[0].Metric = "hps"
	require.Equal(t, "hps", ChooseCareerMetric(pool, inputs))
	pool.Variants[0].Active = false
	require.Equal(t, "no_active_raids", ReduceCareer(pool, inputs, "hps").PerformanceStatus)
}
