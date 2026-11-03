package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// Ratings over chosen bosses: Peak averages every chosen boss (a missed one is
// 0), Renown sums, and Peak's throughput weighs each kill by its length.
func TestHubSetRatingRows(t *testing.T) {
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
	_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: tenant, Name: "Set test " + tenant.String(), Slug: pgtype.Text{String: "set-" + tenant.String()[:8], Valid: true}, AvailableFormats: []string{}})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Set server " + realm.String()})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}))
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Set realm " + realm.String()})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO rating_score_generations (id,tenant_id,policy_version,as_of,status) VALUES ($1,$2,1,$3,'active')", gen, tenant, time.Now())
	require.NoError(t, err)

	insert := func(guid, boss, metric, perf, difficulty string, size int, score, raw, duration float64) {
		_, err := conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores
			(generation_id,tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,rating_metric,window_kind,window_start,window_end,score,best_raw,best_duration_secs)
			VALUES ($1,$2,$3,$4,'Molten Core',$5,$6,$7,'MAGE','Fire','',$8,$9,'period',now()-interval '1 day',now(),$10,$11,$12)`,
			gen, tenant, realm, guid, boss, difficulty, size, perf, metric, score, raw, duration)
		require.NoError(t, err)
	}
	// "steady" clears both chosen bosses at 90; "spike" has a 100 on one and misses the other.
	insert("steady", "Lucifron", "peak", "dps", "", 0, 90, 1000, 60)
	insert("steady", "Ragnaros", "peak", "dps", "", 0, 90, 2000, 240)
	insert("spike", "Ragnaros", "peak", "dps", "", 0, 100, 2500, 200)
	insert("spike", "Magmadar", "peak", "dps", "", 0, 100, 2500, 100) // not chosen
	insert("steady", "Lucifron", "renown", "none", "", 0, 3, 0, 0)
	insert("steady", "Ragnaros", "renown", "none", "", 0, 5, 0, 0)

	rows, err := q.HubSetRatingRows(ctx, database.HubSetRatingRowsParams{TenantID: tenant, GenerationID: gen, InstanceName: "Molten Core",
		EncounterNames: []string{"Lucifron", "Ragnaros"}, PerformanceMetric: "dps"})
	require.NoError(t, err)
	var peaks []database.HubSetRatingRowsRow
	var renown float64
	for _, row := range rows {
		if row.Subject == "player" && row.RatingMetric == "peak" {
			peaks = append(peaks, row)
		}
		if row.Subject == "player" && row.RatingMetric == "renown" && row.SubjectID == "steady" {
			renown = row.Score
		}
	}
	require.Len(t, peaks, 2)
	require.Equal(t, "steady", peaks[0].SubjectID)
	require.InDelta(t, 90, peaks[0].Score, 1e-9)
	// (1000*60 + 2000*240) / 300s
	require.InDelta(t, 1800, peaks[0].PeakRaw, 1e-9)
	require.Equal(t, "spike", peaks[1].SubjectID)
	require.InDelta(t, 50, peaks[1].Score, 1e-9, "a missed chosen boss counts as 0")
	require.InDelta(t, 8, renown, 1e-9)
}
