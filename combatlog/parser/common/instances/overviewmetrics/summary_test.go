package overviewmetrics

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

func TestSummarizeDurationsDeathsWipesAndCompletion(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, time.July, 1, 20, 0, 0, 0, time.UTC)
	encounters := []encounter.Encounter{
		{
			Boss: true, KillType: encounter.KillTypeWipe,
			Combat: encounter.Fight{Start: start, End: start.Add(5 * time.Minute), PlayerDeaths: []messages.Message{nil, nil}},
		},
		{
			Boss: false, KillType: encounter.KillTypeClean,
			Combat: encounter.Fight{Start: start.Add(4 * time.Minute), End: start.Add(10 * time.Minute), PlayerDeaths: []messages.Message{nil}},
		},
		{
			Boss: true, KillType: encounter.KillTypeClean,
			Combat: encounter.Fight{Start: start.Add(20 * time.Minute), End: start.Add(30 * time.Minute)},
		},
	}
	speedrun := &rankings.SpeedrunResult{Proof: []rankings.SpeedrunProof{{Satisfied: true}, {Satisfied: true}}}

	summary := Summarize(encounters, nil, speedrun)
	require.NotNil(t, summary.RequirementsComplete)
	require.True(t, *summary.RequirementsComplete)
	require.Equal(t, int32(3), summary.PlayerDeaths)
	require.Equal(t, int32(1), summary.WipeCount)
	require.Equal(t, 30*time.Minute, summary.EncounterSpanDuration)
	require.Equal(t, 20*time.Minute, summary.TotalCombatDuration)
	require.Equal(t, 15*time.Minute, summary.TotalBossDuration)
	require.Equal(t, int32(1), summary.MetricsVersion)
}

func TestSummarizeUnknownAndIncompleteCompletion(t *testing.T) {
	t.Parallel()

	require.Nil(t, Summarize(nil, nil, nil).RequirementsComplete)
	incomplete := Summarize(nil, nil, &rankings.SpeedrunResult{
		Proof: []rankings.SpeedrunProof{{Satisfied: true}, {Satisfied: false}},
	})
	require.NotNil(t, incomplete.RequirementsComplete)
	require.False(t, *incomplete.RequirementsComplete)
}
