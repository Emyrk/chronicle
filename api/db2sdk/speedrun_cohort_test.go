package db2sdk

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestSpeedrunCohortRun(t *testing.T) {
	t.Parallel()

	guildID := uuid.New()
	proof, err := json.Marshal(chroniclesdk.SpeedrunProofPayload{
		Proof: []chroniclesdk.SpeedrunProof{
			{Satisfied: true},
			{Satisfied: false},
		},
	})
	require.NoError(t, err)

	startedAt := time.Date(2026, time.July, 1, 20, 0, 0, 0, time.UTC)
	completedAt := startedAt.Add(90 * time.Minute)
	duration := completedAt.Sub(startedAt).Milliseconds()

	run := SpeedrunCohortRun(database.InstanceSpeedrunCohortRow{
		InstanceID:             uuid.New(),
		HashedSlug:             pgtype.Text{String: "raid-slug", Valid: true},
		StartTime:              pgtype.Timestamptz{Time: startedAt, Valid: true},
		CompletionTime:         pgtype.Timestamptz{Time: completedAt, Valid: true},
		DurationMs:             duration,
		Qualified:              true,
		Proof:                  proof,
		GuildID:                uuid.NullUUID{UUID: guildID, Valid: true},
		GuildName:              "Example Guild",
		EncounterKillTimesJson: `[{"encounter_name":"Lucifron","duration_ms":184000}]`,
	})

	require.Equal(t, "raid-slug", run.Slug)
	require.Equal(t, 1, run.RequirementsSatisfied)
	require.Equal(t, 2, run.RequirementsTotal)
	require.False(t, run.RequirementsComplete)
	require.True(t, run.Qualified)
	require.Equal(t, duration, *run.DurationMs)
	require.Equal(t, completedAt, *run.CompletionTime)
	require.Equal(t, guildID, *run.GuildID)
	require.Equal(t, []chroniclesdk.EncounterKillTime{{
		EncounterName: "Lucifron",
		DurationMs:    184_000,
	}}, run.EncounterKillTimes)
}

func TestInstanceOverviewMetrics(t *testing.T) {
	t.Parallel()

	spellID := int32(12345)
	metrics := InstanceOverviewMetrics(database.InstanceOverviewMetric{
		RequirementsComplete: pgtype.Bool{Bool: true, Valid: true},
		PlayerDeaths:         13,
		WipeCount:            3,
		TopIncomingDamageAbilities: []database.OverviewIncomingDamageAbility{{
			SpellID: &spellID, Name: "Shadow Bolt", Damage: 1200, Hits: 4,
		}},
		EncounterSpanDurationMs: 4_000,
		TotalCombatDurationMs:   3_000,
		TotalBossDurationMs:     2_000,
		MetricsVersion:          1,
	})

	require.NotNil(t, metrics.RequirementsComplete)
	require.True(t, *metrics.RequirementsComplete)
	require.Equal(t, int32(13), metrics.PlayerDeaths)
	require.Equal(t, int32(3), metrics.WipeCount)
	require.Equal(t, int64(4_000), metrics.EncounterSpanDurationMs)
	require.Len(t, metrics.TopIncomingDamageAbilities, 1)
	require.Equal(t, spellID, *metrics.TopIncomingDamageAbilities[0].SpellID)
}

func TestSpeedrunCohortRunIncludesOverviewMetrics(t *testing.T) {
	t.Parallel()

	abilities, err := json.Marshal([]chroniclesdk.OverviewIncomingDamageAbility{{Name: "Melee", Damage: 900, Hits: 3}})
	require.NoError(t, err)
	run := SpeedrunCohortRun(database.InstanceSpeedrunCohortRow{
		InstanceID:                 uuid.New(),
		StartTime:                  pgtype.Timestamptz{Time: time.Now(), Valid: true},
		Proof:                      []byte(`[]`),
		RequirementsComplete:       pgtype.Bool{Bool: false, Valid: true},
		PlayerDeaths:               pgtype.Int4{Int32: 7, Valid: true},
		WipeCount:                  pgtype.Int4{Int32: 2, Valid: true},
		TopIncomingDamageAbilities: abilities,
		EncounterSpanDurationMs:    pgtype.Int8{Int64: 10_000, Valid: true},
		TotalCombatDurationMs:      pgtype.Int8{Int64: 8_000, Valid: true},
		TotalBossDurationMs:        pgtype.Int8{Int64: 5_000, Valid: true},
		MetricsVersion:             pgtype.Int4{Int32: 1, Valid: true},
	})

	require.NotNil(t, run.Overview)
	require.NotNil(t, run.Overview.RequirementsComplete)
	require.False(t, *run.Overview.RequirementsComplete)
	require.Equal(t, int32(7), run.Overview.PlayerDeaths)
	require.Equal(t, int32(2), run.Overview.WipeCount)
}

func TestSpeedrunCohortOverviewMetrics(t *testing.T) {
	t.Parallel()

	spellID := int32(12345)
	firstAbilities, err := json.Marshal([]chroniclesdk.OverviewIncomingDamageAbility{
		{SpellID: &spellID, Name: "Shadow Bolt", Damage: 1_000, Hits: 4},
		{Name: "Lava", EnvironmentType: "lava", Damage: 300, Hits: 2},
	})
	require.NoError(t, err)
	secondAbilities, err := json.Marshal([]chroniclesdk.OverviewIncomingDamageAbility{
		{SpellID: &spellID, Name: "Shadow Bolt", Damage: 500, Hits: 2},
		{Name: "Melee", Damage: 900, Hits: 3},
	})
	require.NoError(t, err)
	partialAbilities, err := json.Marshal([]chroniclesdk.OverviewIncomingDamageAbility{
		{Name: "Ignored", Damage: 10_000, Hits: 1},
	})
	require.NoError(t, err)

	rows := []database.InstanceSpeedrunCohortRow{
		{TopIncomingDamageAbilities: firstAbilities},
		{TopIncomingDamageAbilities: secondAbilities},
		{TopIncomingDamageAbilities: partialAbilities},
		{},
	}
	runs := []chroniclesdk.SpeedrunCohortRun{
		{RequirementsComplete: true, Overview: &chroniclesdk.SpeedrunCohortRunOverviewMetrics{}},
		{RequirementsComplete: true, Overview: &chroniclesdk.SpeedrunCohortRunOverviewMetrics{}},
		{RequirementsComplete: false, Overview: &chroniclesdk.SpeedrunCohortRunOverviewMetrics{}},
		{RequirementsComplete: true},
	}

	overview := SpeedrunCohortOverviewMetrics(rows, runs)
	require.Equal(t, 2, overview.Runs)
	require.Equal(t, []chroniclesdk.SpeedrunCohortIncomingDamageAbility{
		{SpellID: &spellID, Name: "Shadow Bolt", Damage: 1_500, Hits: 6, Runs: 2},
		{Name: "Melee", Damage: 900, Hits: 3, Runs: 1},
		{Name: "Lava", Damage: 300, Hits: 2, Runs: 1, EnvironmentType: "lava"},
	}, overview.TopIncomingDamageAbilities)
}

func TestSpeedrunCohortOverviewMetricsLimitsAbilities(t *testing.T) {
	t.Parallel()

	abilities := make([]chroniclesdk.OverviewIncomingDamageAbility, 0, 12)
	for i := range 12 {
		abilities = append(abilities, chroniclesdk.OverviewIncomingDamageAbility{
			Name:   string(rune('A' + i)),
			Damage: int64(12 - i),
			Hits:   1,
		})
	}
	payload, err := json.Marshal(abilities)
	require.NoError(t, err)

	overview := SpeedrunCohortOverviewMetrics(
		[]database.InstanceSpeedrunCohortRow{{TopIncomingDamageAbilities: payload}},
		[]chroniclesdk.SpeedrunCohortRun{{
			RequirementsComplete: true,
			Overview:             &chroniclesdk.SpeedrunCohortRunOverviewMetrics{},
		}},
	)
	require.Len(t, overview.TopIncomingDamageAbilities, 10)
	require.Equal(t, "A", overview.TopIncomingDamageAbilities[0].Name)
	require.Equal(t, "J", overview.TopIncomingDamageAbilities[9].Name)
}

func TestSpeedrunCohortRunIncompleteLegacyProof(t *testing.T) {
	t.Parallel()

	proof, err := json.Marshal([]chroniclesdk.SpeedrunProof{{Satisfied: true}, {Satisfied: true}})
	require.NoError(t, err)

	run := SpeedrunCohortRun(database.InstanceSpeedrunCohortRow{
		InstanceID: uuid.New(),
		StartTime:  pgtype.Timestamptz{Time: time.Now(), Valid: true},
		DurationMs: -1,
		Proof:      proof,
	})

	require.True(t, run.RequirementsComplete)
	require.Nil(t, run.DurationMs)
	require.Nil(t, run.CompletionTime)
	require.Equal(t, 2, run.RequirementsSatisfied)
}
