package main

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestDifficultyExportPreservesSemanticDifferences(t *testing.T) {
	t.Parallel()
	instance := database.LogInstancesGuild{}
	normal := jsonBytes(t, instanceValues(instance, "instance/0"))
	instance.MixedDifficulty = true
	require.NotEqual(t, normal, jsonBytes(t, instanceValues(instance, "instance/0")))
	require.Contains(t, instanceFields, "mixed_difficulty")
	encounter := database.LogInstanceEncounter{}
	unknown := jsonBytes(t, encounterValues(encounter, "encounter/0", "instance/0"))
	encounter.Difficulty = pgtype.Text{String: "", Valid: true}
	explicitNormal := jsonBytes(t, encounterValues(encounter, "encounter/0", "instance/0"))
	require.NotEqual(t, unknown, explicitNormal)
	encounter.Difficulty.String = "Heroic"
	require.NotEqual(t, explicitNormal, jsonBytes(t, encounterValues(encounter, "encounter/0", "instance/0")))
	require.Contains(t, encounterFields, "difficulty")
	rows := []database.LogInstanceDifficulty{{Difficulty: "Heroic"}, {Difficulty: ""}}
	require.Equal(t, []string{"", "Heroic"}, difficultyValues(rows))
	require.Equal(t, "Heroic", rows[0].Difficulty, "canonicalization must not modify query results")
	require.NotEqual(t, jsonBytes(t, difficultyValues(nil)), jsonBytes(t, difficultyValues(rows)))
	require.Equal(t, []string{}, difficultyValues(nil))
}

func TestFactionIncludedInPublicationAllowlists(t *testing.T) {
	t.Parallel()
	require.Contains(t, structureFields["log_instance_players"], "faction")
	require.Contains(t, publicationFields["game_players"], "faction")
}
