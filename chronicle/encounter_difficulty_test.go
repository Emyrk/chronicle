package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/stretchr/testify/require"
)

func TestSummarizeEncounterDifficulties(t *testing.T) {
	t.Parallel()
	boss := func(difficulty string, outcome encounter.KillType) encounter.Encounter {
		return encounter.Encounter{Boss: true, KillType: outcome, Combat: encounter.Fight{Difficulty: difficulty}}
	}
	trash := encounter.Encounter{Combat: encounter.Fight{Difficulty: ""}, KillType: encounter.KillTypeClean}
	for _, tt := range []struct {
		name       string
		encounters []encounter.Encounter
		want       encounterDifficulties
	}{
		{"no encounters", nil, encounterDifficulties{All: []string{}}},
		{"normal", []encounter.Encounter{boss("", encounter.KillTypeClean)}, encounterDifficulties{All: []string{""}}},
		{"normal trash heroic bosses", []encounter.Encounter{trash, boss("heroic", encounter.KillTypeClean)}, encounterDifficulties{All: []string{"", "heroic"}, Clear: "heroic"}},
		{"mixed kills", []encounter.Encounter{boss("", encounter.KillTypeClean), boss("heroic", encounter.KillTypeClean)}, encounterDifficulties{All: []string{"", "heroic"}, Mixed: true}},
		{"failed normal attempt heroic kill", []encounter.Encounter{boss("", encounter.KillTypeWipe), boss("heroic", encounter.KillTypeClean)}, encounterDifficulties{All: []string{"", "heroic"}, Mixed: true}},
		{"reset counts", []encounter.Encounter{boss("", encounter.KillTypeReset), boss("heroic", encounter.KillTypeClean)}, encounterDifficulties{All: []string{"", "heroic"}, Mixed: true}},
		{"future resolved variant", []encounter.Encounter{trash, boss("test-hard-mode", encounter.KillTypeClean)}, encounterDifficulties{All: []string{"", "test-hard-mode"}, Clear: "test-hard-mode"}},
		{"duplicate attempts", []encounter.Encounter{boss("heroic", encounter.KillTypeWipe), boss("heroic", encounter.KillTypeClean)}, encounterDifficulties{All: []string{"heroic"}, Clear: "heroic"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, summarizeEncounterDifficulties(tt.encounters))
		})
	}
}
