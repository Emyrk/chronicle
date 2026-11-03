package ratingmath

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestTenantScopeProjectionRaidPages(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q, store := database.NewQueries(pool), database.New(pool)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "scope server"})
	require.NoError(t, err)
	var realms [2]uuid.UUID
	var guilds [2]uuid.UUID
	for i := range realms {
		realms[i], guilds[i] = uuid.New(), uuid.New()
		_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realms[i], ServerID: server.ID, Name: realms[i].String()})
		require.NoError(t, err)
		_, err = pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,$3)", guilds[i], realms[i], realms[i].String())
		require.NoError(t, err)
	}
	asOf := time.Now().UTC()
	gen, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET phase='player_scopes' WHERE generation_id=$1", gen)
	require.NoError(t, err)
	for i, realm := range realms {
		for _, boss := range []struct {
			name          string
			score         float64
			raw, duration float64
		}{{"Gri'lek", 70, 700, 100}, {"Hazza'rah", 90, 900, 50}, {"Hakkar", 50, 500, 150}} {
			_, err = q.InsertPlayerTenantBossScore(ctx, database.InsertPlayerTenantBossScoreParams{
				GenerationID: gen, TenantID: uuid.Nil, RealmID: realm, PlayerGuid: "player", InstanceName: "Zul'Gurub",
				EncounterName: boss.name, DifficultyName: "Normal", MaxPlayers: 20, PlayerClass: "MAGE",
				PlayerSpec: "Fire", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "all_time", Score: boss.score + float64(i*10),
				BestRaw: pgtype.Float8{Float64: boss.raw, Valid: true}, BestDurationSecs: boss.duration,
			})
			require.NoError(t, err)
			_, err = q.InsertGuildTenantBossScore(ctx, database.InsertGuildTenantBossScoreParams{
				GenerationID: gen, TenantID: uuid.Nil, RealmID: realm, GuildID: guilds[i], InstanceName: "Zul'Gurub",
				EncounterName: boss.name, DifficultyName: "Normal", MaxPlayers: 20,
				RatingMetric: "peak", WindowKind: "all_time", Score: boss.score + float64(i*10),
			})
			require.NoError(t, err)
		}
		// Renown is a curated sum, not an average of Edge variants.
		_, err = q.InsertPlayerTenantBossScore(ctx, database.InsertPlayerTenantBossScoreParams{
			GenerationID: gen, TenantID: uuid.Nil, RealmID: realm, PlayerGuid: "player", InstanceName: "Zul'Gurub",
			EncounterName: "Gri'lek", PerformanceMetric: "none", RatingMetric: "renown", WindowKind: "career", Score: 15,
		})
		require.NoError(t, err)
	}
	for i := 0; i < 12; i++ {
		cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: gen})
		require.NoError(t, err)
		if cp.Phase == "scopes_complete" {
			break
		}
		require.NoError(t, TenantScopeProjectionPage(ctx, store, uuid.Nil, gen))
	}
	cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: gen})
	require.NoError(t, err)
	require.Equal(t, "scopes_complete", cp.Phase)
	for i, realm := range realms {
		var score float64
		err = pool.QueryRow(ctx, `SELECT score FROM player_tenant_rating_scope_scores WHERE generation_id=$1 AND realm_id=$2 AND rating_metric='peak'`, gen, realm).Scan(&score)
		require.NoError(t, err)
		require.Equal(t, 70.0+float64(i*10), score)
		// Raid Peak DPS weighs the counted kills by length: Edge of Madness keeps
		// Hazza'rah (900 dps, 50s) with Hakkar (500 dps, 150s): 120000 / 200s.
		var raw, duration float64
		err = pool.QueryRow(ctx, `SELECT best_raw, best_duration_secs FROM player_tenant_rating_scope_scores WHERE generation_id=$1 AND realm_id=$2 AND rating_metric='peak'`, gen, realm).Scan(&raw, &duration)
		require.NoError(t, err)
		require.InDelta(t, 600.0, raw, 1e-9)
		require.InDelta(t, 200.0, duration, 1e-9)
		err = pool.QueryRow(ctx, `SELECT score FROM guild_tenant_rating_scope_scores WHERE generation_id=$1 AND realm_id=$2`, gen, realm).Scan(&score)
		require.NoError(t, err)
		require.Equal(t, 70.0+float64(i*10), score)
		err = pool.QueryRow(ctx, `SELECT score FROM player_tenant_rating_scope_scores WHERE generation_id=$1 AND realm_id=$2 AND rating_metric='renown'`, gen, realm).Scan(&score)
		require.NoError(t, err)
		require.Equal(t, 15.0, score)
	}
	var global int
	err = pool.QueryRow(ctx, "SELECT count(*) FROM player_tenant_rating_scope_scores WHERE generation_id=$1 AND instance_name=''", gen).Scan(&global)
	require.NoError(t, err)
	require.Zero(t, global)
	var status string
	require.NoError(t, pool.QueryRow(ctx, "SELECT status FROM rating_score_generations WHERE id=$1", gen).Scan(&status))
	require.Equal(t, "building", status)
}
