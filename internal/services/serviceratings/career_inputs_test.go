package serviceratings

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
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

func TestCareerReductionParts(t *testing.T) {
	t.Parallel()
	a := leaderboardconfig.CareerKey{Instance: "a"}
	b := leaderboardconfig.CareerKey{Instance: "b"}
	w1, w3 := 1.0, 3.0
	pool := leaderboardconfig.CareerPool{Variants: []leaderboardconfig.CareerVariant{
		{CareerKey: a, Active: true, IncludeAverage: true, Weight: &w1, AverageBosses: []string{"x", "y"}},
		{CareerKey: b, Active: true, IncludeAverage: true, Weight: &w3, AverageBosses: []string{"z"}},
	}}
	inputs := CareerInputs{Raids: []CareerRaidInput{
		{CareerKey: a, Metric: "dps", Mastery: 40, Peak: 60, Form: 40, Floor: 20, EligibleKills: 4, Parts: true,
			BossCounts: []CareerBossCount{{Boss: "x", Count: 3}, {Boss: "y", Count: 1}}},
	}}
	got := ReduceCareer(pool, inputs, "dps")
	require.Equal(t, "ready", got.PerformanceStatus)
	// Raid b has no kills: it counts as zero with weight 3.
	require.InDelta(t, 40.0/4, *got.Form, 1e-9)
	require.InDelta(t, 20.0/4, *got.Floor, 1e-9)
	require.Equal(t, []string{"x", "y"}, got.Contributions[0].AverageBosses)
	require.Equal(t, inputs.Raids[0].BossCounts, got.Contributions[0].BossCounts)

	// Inputs from before Form/Floor existed leave them unknown.
	inputs.Raids[0].Parts = false
	got = ReduceCareer(pool, inputs, "dps")
	require.NotNil(t, got.Mastery)
	require.Nil(t, got.Form)
}

func TestCareerStoredSummaryRenownOnly(t *testing.T) {
	t.Parallel()
	key := leaderboardconfig.CareerKey{Instance: "raid"}
	weight := 1.0
	pool := leaderboardconfig.CareerPool{Variants: []leaderboardconfig.CareerVariant{{
		CareerKey: key, Active: true, IncludeAverage: true, IncludeRenown: true, Weight: &weight,
		RenownBosses: []leaderboardconfig.CareerBoss{{Name: "Boss", Points: 2, HasPoints: true}},
	}}}
	computed := pgtype.Timestamptz{Time: time.Now(), Valid: true}

	// Renown kills but no DPS/HPS evidence: no metric is ever chosen.
	renownOnly, err := json.Marshal(CareerInputs{Kills: []CareerBossKills{{CareerKey: key, Boss: "Boss", Count: 3}}})
	require.NoError(t, err)
	got, err := careerStoredSummary(pool, database.LeaderboardCareerSubject{Inputs: renownOnly, ComputedAt: computed})
	require.NoError(t, err)
	require.Equal(t, "no_evidence", got.PerformanceStatus)
	require.Equal(t, 6.0, got.Renown)

	// Metric evidence without a stored choice is still awaiting publication.
	withMetric, err := json.Marshal(CareerInputs{Raids: []CareerRaidInput{{CareerKey: key, Metric: "dps", Mastery: 50, Peak: 60, EligibleKills: 1}}})
	require.NoError(t, err)
	got, err = careerStoredSummary(pool, database.LeaderboardCareerSubject{Inputs: withMetric, ComputedAt: computed})
	require.NoError(t, err)
	require.Equal(t, "preparing", got.PerformanceStatus)

	// Never computed: still preparing.
	got, err = careerStoredSummary(pool, database.LeaderboardCareerSubject{Inputs: renownOnly})
	require.NoError(t, err)
	require.Equal(t, "preparing", got.PerformanceStatus)
}
