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
		InstanceID:     uuid.New(),
		HashedSlug:     pgtype.Text{String: "raid-slug", Valid: true},
		StartTime:      pgtype.Timestamptz{Time: startedAt, Valid: true},
		CompletionTime: pgtype.Timestamptz{Time: completedAt, Valid: true},
		DurationMs:     duration,
		Qualified:      true,
		Proof:          proof,
		GuildID:        uuid.NullUUID{UUID: guildID, Valid: true},
		GuildName:      "Example Guild",
	})

	require.Equal(t, "raid-slug", run.Slug)
	require.Equal(t, 1, run.RequirementsSatisfied)
	require.Equal(t, 2, run.RequirementsTotal)
	require.False(t, run.Completed)
	require.True(t, run.Qualified)
	require.Equal(t, duration, *run.DurationMs)
	require.Equal(t, completedAt, *run.CompletionTime)
	require.Equal(t, guildID, *run.GuildID)
}

func TestInstanceOverviewMetrics(t *testing.T) {
	t.Parallel()

	spellID := int32(12345)
	metrics := InstanceOverviewMetrics(database.InstanceOverviewMetric{
		Complete:     pgtype.Bool{Bool: true, Valid: true},
		PlayerDeaths: 13,
		WipeCount:    3,
		DeadliestAbilities: []database.OverviewDeadliestAbility{{
			SpellID: &spellID, Name: "Shadow Bolt", Damage: 1200, Hits: 4,
		}},
		TotalDurationMs:       4_000,
		TotalCombatDurationMs: 3_000,
		TotalBossDurationMs:   2_000,
		MetricsVersion:        1,
	})

	require.NotNil(t, metrics.Complete)
	require.True(t, *metrics.Complete)
	require.Equal(t, int32(13), metrics.PlayerDeaths)
	require.Equal(t, int32(3), metrics.WipeCount)
	require.Equal(t, int64(4_000), metrics.TotalDurationMs)
	require.Len(t, metrics.DeadliestAbilities, 1)
	require.Equal(t, spellID, *metrics.DeadliestAbilities[0].SpellID)
}

func TestSpeedrunCohortRunIncludesOverviewMetrics(t *testing.T) {
	t.Parallel()

	abilities, err := json.Marshal([]chroniclesdk.OverviewDeadliestAbility{{Name: "Melee", Damage: 900, Hits: 3}})
	require.NoError(t, err)
	run := SpeedrunCohortRun(database.InstanceSpeedrunCohortRow{
		InstanceID:            uuid.New(),
		StartTime:             pgtype.Timestamptz{Time: time.Now(), Valid: true},
		Proof:                 []byte(`[]`),
		Complete:              pgtype.Bool{Bool: false, Valid: true},
		PlayerDeaths:          pgtype.Int4{Int32: 7, Valid: true},
		WipeCount:             pgtype.Int4{Int32: 2, Valid: true},
		DeadliestAbilities:    abilities,
		TotalDurationMs:       pgtype.Int8{Int64: 10_000, Valid: true},
		TotalCombatDurationMs: pgtype.Int8{Int64: 8_000, Valid: true},
		TotalBossDurationMs:   pgtype.Int8{Int64: 5_000, Valid: true},
		MetricsVersion:        pgtype.Int4{Int32: 1, Valid: true},
	})

	require.NotNil(t, run.Overview)
	require.NotNil(t, run.Overview.Complete)
	require.False(t, *run.Overview.Complete)
	require.Equal(t, int32(7), run.Overview.PlayerDeaths)
	require.Equal(t, int32(2), run.Overview.WipeCount)
	require.Len(t, run.Overview.DeadliestAbilities, 1)
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

	require.True(t, run.Completed)
	require.Nil(t, run.DurationMs)
	require.Nil(t, run.CompletionTime)
	require.Equal(t, 2, run.RequirementsSatisfied)
}
