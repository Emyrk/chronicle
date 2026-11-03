package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// A boss Peak's fight length is the best kill's, per window, not the longest or latest.
func TestRatingStagePlayerPeakDuration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_bypass") }()
	q := database.NewQueries(conn)

	tenant, realm, gen := uuid.New(), uuid.New(), uuid.New()
	now := time.Now().UTC()
	_, err = conn.Exec(ctx, "INSERT INTO rating_score_generations (id,tenant_id,policy_version,as_of) VALUES ($1,$2,1,$3)", gen, tenant, now)
	require.NoError(t, err)
	// Career best: 1500 dps over 90s, long ago. Period best: 1200 dps over 150s.
	for _, kill := range []struct {
		raw, duration float64
		ago           time.Duration
	}{{1500, 90, 400 * 24 * time.Hour}, {1200, 150, 24 * time.Hour}, {1100, 300, 2 * time.Hour}} {
		_, err = conn.Exec(ctx, `INSERT INTO rating_stage_player_observations
			(generation_id, tenant_id, realm_id, run_id, player_guid, instance_name, encounter_name, difficulty_name, max_players,
			 player_class, player_spec, player_sub_spec, killed_at, performance_metric, raw_value, duration_secs)
			VALUES ($1,$2,$3,$4,'p','Molten Core','Ragnaros','',0,'MAGE','Fire','',$5,'dps',$6,$7)`,
			gen, tenant, realm, uuid.New(), now.Add(-kill.ago), kill.raw, kill.duration)
		require.NoError(t, err)
	}
	row, err := q.RatingStagePlayerPeak(ctx, database.RatingStagePlayerPeakParams{GenerationID: gen, RealmID: realm, PlayerGuid: "p",
		InstanceName: "Molten Core", EncounterName: "Ragnaros", PlayerClass: "MAGE", PlayerSpec: "Fire", PerformanceMetric: "dps",
		PeriodStart: database.Timestamptz(now.AddDate(0, 0, -180)), WindowEnd: database.Timestamptz(now)})
	require.NoError(t, err)
	require.Equal(t, 1500.0, row.CareerRaw)
	require.Equal(t, 90.0, row.CareerDurationSecs)
	require.Equal(t, 1200.0, row.PeriodRaw)
	require.Equal(t, 150.0, row.PeriodDurationSecs)
}
