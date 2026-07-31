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
