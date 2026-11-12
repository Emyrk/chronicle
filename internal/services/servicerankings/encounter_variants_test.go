package servicerankings

import (
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestPersistedInstanceParsesPreserveDifficultyVariants(t *testing.T) {
	t.Parallel()
	rankings := []database.ListRankingsForInstanceRow{
		{PlayerGuid: "player", EncounterName: "Boss", DifficultyName: "", MaxPlayers: 25, Dps: 100, PlayerSpec: "Fury"},
		{PlayerGuid: "player", EncounterName: "Boss", DifficultyName: "heroic", MaxPlayers: 25, Dps: 200, PlayerSpec: "Fury"},
	}
	results := []database.ParseScoreResultsResolved{
		{PlayerGuid: "player", EncounterName: "Boss", DifficultyName: "", MaxPlayers: 25, MetricValue: 100, PreciseScore: 40, Status: string(parsepolicy.StatusOK)},
		{PlayerGuid: "player", EncounterName: "Boss", DifficultyName: "heroic", MaxPlayers: 25, MetricValue: 200, PreciseScore: 80, Status: string(parsepolicy.StatusOK)},
	}
	players, complete := buildPersistedInstanceParsePlayers(rankings, results, []string{"Boss"}, parsepolicy.MetricDPS, parsepolicy.CohortModeSpec)
	require.True(t, complete)
	require.Len(t, players, 1)
	require.Len(t, players[0].Bosses, 2)
	require.Equal(t, "", players[0].Bosses[0].DifficultyName)
	require.Equal(t, "heroic", players[0].Bosses[1].DifficultyName)
	require.Equal(t, int16(25), players[0].Bosses[1].MaxPlayers)
	require.Equal(t, 100.0, players[0].Bosses[0].MetricValue)
	require.Equal(t, 200.0, players[0].Bosses[1].MetricValue)
	require.NotNil(t, players[0].AverageParse)
	require.Equal(t, 60.0, players[0].AverageParse.PreciseScore)
	require.Equal(t, 2, players[0].AverageParse.Selected)
	_, complete = buildPersistedInstanceParsePlayers(rankings, results[:1], []string{"Boss"}, parsepolicy.MetricDPS, parsepolicy.CohortModeSpec)
	require.False(t, complete, "one difficulty's result must not satisfy another difficulty")
}

func TestCharacterScoreSeparatesDifficultyVariants(t *testing.T) {
	t.Parallel()
	parses := []chroniclesdk.CharacterParse{
		{InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "", MaxPlayers: 25, PreciseScore: 100},
		{InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "", MaxPlayers: 25, PreciseScore: 100},
		{InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "heroic", MaxPlayers: 25, PreciseScore: 20},
	}
	score := ComputeCharacterScore(parses)
	require.Equal(t, 2, score.EncounterGroups)
	require.Equal(t, 60.0, score.Value)
}
