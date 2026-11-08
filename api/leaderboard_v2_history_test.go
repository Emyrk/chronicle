package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestBuildPlayerHistory(t *testing.T) {
	t.Parallel()
	config := []database.ResolveLeaderboardConfigurationRow{
		{Kind: "instance", InstanceName: "Raid"},
		{Kind: "variant", InstanceName: "Raid", DifficultyName: "Normal", MaxPlayers: 40},
		{Kind: "boss", InstanceName: "Raid", EncounterName: "Boss", HasPoints: true, Points: 2},
		{Kind: "boss_variant", InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "Normal", MaxPlayers: 40, HasPoints: true, Points: 9},
	}
	row := func(boss, spec, metric string, value float64) database.ListLeaderboardV2PlayerHistoryRow {
		return database.ListLeaderboardV2PlayerHistoryRow{InstanceName: "Raid", DifficultyName: "Normal", MaxPlayers: 40, EncounterName: boss, PlayerClass: "PRIEST", PlayerSpec: spec, Metric: metric, MetricValue: value, BestMetric: 500}
	}
	rows := []database.ListLeaderboardV2PlayerHistoryRow{
		row("Boss", "Holy", "hps", 400),
		row("Boss", "Shadow", "dps", 300),
		row("Boss", "Shadow", "dps", 350),
		row("Disabled", "Shadow", "dps", 200),
	}
	rows[0].HasParse, rows[0].Parse = true, 91

	out := buildPlayerHistory(config, rows)
	require.False(t, out.Truncated)
	require.Len(t, out.Groups, 2, "the disabled boss is omitted")
	holy, shadow := out.Groups[0], out.Groups[1]
	require.Equal(t, "hps", holy.Metric)
	require.Len(t, holy.Kills, 1)
	require.Equal(t, int16(91), *holy.Kills[0].Parse)
	require.Len(t, shadow.Kills, 2)
	require.Nil(t, shadow.Kills[0].Parse)
	for _, g := range out.Groups {
		require.Equal(t, 9.0, g.RenownAward, "variant award overrides the boss default")
		require.Equal(t, int64(3), g.RenownKills, "Renown counts every kill of the boss, across specs and metrics")
		require.Equal(t, 500.0, g.Benchmark)
	}
}
