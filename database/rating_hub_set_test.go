package database_test

import (
	"context"
	"encoding/json"
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
		EncounterNames: []string{"Lucifron", "Ragnaros"}, PerformanceMetric: "dps", WindowKind: "period", RenownWindow: "period", Depth: 5})
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

	// The paged board ranks the same way and carries all three scores per row.
	page := func(metric, query string, offset, limit int32) []database.HubSetBoardPageRow {
		rows, err := q.HubSetBoardPage(ctx, database.HubSetBoardPageParams{Subject: "player", TenantID: tenant, GenerationID: gen, InstanceName: "Molten Core",
			EncounterNames: []string{"Lucifron", "Ragnaros"}, RatingMetric: metric, WindowKind: "period", RenownWindow: "period",
			PerformanceMetric: "dps", SearchQuery: query, OffsetCount: offset, LimitCount: limit})
		require.NoError(t, err)
		return rows
	}
	board := page("peak", "", 0, 10)
	require.Len(t, board, 2)
	require.Equal(t, int64(1), board[0].Rank)
	require.Equal(t, int64(2), board[0].Total)
	require.Equal(t, "steady", board[0].SubjectID)
	require.InDelta(t, 90, board[0].Peak, 1e-9)
	require.InDelta(t, 8, board[0].Renown, 1e-9)
	require.InDelta(t, 1800, board[0].PeakRaw, 1e-9)
	require.InDelta(t, 50, board[1].Score, 1e-9)
	var components []struct {
		EncounterName string  `json:"encounter_name"`
		Score         float64 `json:"score"`
	}
	require.NoError(t, json.Unmarshal(board[1].PeakComponents, &components))
	require.Len(t, components, 2)
	require.Equal(t, "Lucifron", components[0].EncounterName)
	require.Zero(t, components[0].Score, "a missed boss appears as zero")
	require.Equal(t, "Ragnaros", components[1].EncounterName)
	require.Equal(t, 100.0, components[1].Score)
	require.InDelta(t, board[1].Score, (components[0].Score+components[1].Score)/2, 1e-9)
	second := page("peak", "", 1, 1)
	require.Len(t, second, 1)
	require.Equal(t, "spike", second[0].SubjectID)
	require.Equal(t, int64(2), second[0].Rank)
	// Renown ranks "steady" alone, and still reports its Peak.
	renownBoard := page("renown", "", 0, 10)
	require.Len(t, renownBoard, 1)
	require.InDelta(t, 90, renownBoard[0].Peak, 1e-9)
	require.Empty(t, page("peak", "nobody", 0, 10))

	// Renown is stored without a class; rows take the character's class for display.
	const known = "0x0000000000000042"
	_, err = conn.Exec(ctx, `INSERT INTO game_players (id, realm_id, name, class, gender, race) VALUES ($1,$2,'Known','WARLOCK','Male','Orc')`, known, realm)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores
		(generation_id,tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
		 performance_metric,rating_metric,window_kind,window_start,window_end,score)
		VALUES ($1,$2,$3,$4,'Molten Core','Lucifron','',0,'','','','none','renown','period',now()-interval '1 day',now(),1)`, gen, tenant, realm, known)
	require.NoError(t, err)
	var knownClass string
	for _, row := range page("renown", "", 0, 10) {
		if row.SubjectID == known {
			knownClass = row.PlayerClass
		}
	}
	require.Equal(t, "WARLOCK", knownClass)

	// Ranked Mastery carries its parts over the chosen bosses: averaged with a missed
	// boss as 0, eligible kills summed.
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores
		(generation_id,tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
		 performance_metric,rating_metric,window_kind,window_start,window_end,score,best_locked_parse,form,floor_score,eligible_kills)
		VALUES ($1,$2,$3,'steady','Molten Core','Lucifron','',0,'MAGE','Fire','','dps','ranked_mastery','period',now()-interval '1 day',now(),80,90,80,60,6)`,
		gen, tenant, realm)
	require.NoError(t, err)
	mastery := page("ranked_mastery", "", 0, 10)
	require.Len(t, mastery, 1)
	require.InDelta(t, 40, mastery[0].Score, 1e-9)
	require.InDelta(t, 45, mastery[0].MasteryPeak, 1e-9)
	require.InDelta(t, 40, mastery[0].MasteryForm, 1e-9)
	require.InDelta(t, 30, mastery[0].MasteryFloor, 1e-9)
	require.Equal(t, int64(6), mastery[0].EligibleKills)

	// Guild boards: same averaging, ranked by guild.
	guild := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,'Set Guild')", guild, realm)
	require.NoError(t, err)
	for _, boss := range []struct {
		name  string
		score float64
	}{{"Lucifron", 80}, {"Ragnaros", 60}} {
		_, err = conn.Exec(ctx, `INSERT INTO guild_tenant_rating_boss_scores
			(generation_id,tenant_id,realm_id,guild_id,instance_name,encounter_name,difficulty_name,max_players,rating_metric,window_kind,window_start,window_end,score)
			VALUES ($1,$2,$3,$4,'Molten Core',$5,'',0,'peak','period',now()-interval '1 day',now(),$6)`, gen, tenant, realm, guild, boss.name, boss.score)
		require.NoError(t, err)
	}
	guilds, err := q.HubSetBoardPage(ctx, database.HubSetBoardPageParams{Subject: "guild", TenantID: tenant, GenerationID: gen, InstanceName: "Molten Core",
		EncounterNames: []string{"Lucifron", "Ragnaros", "Garr"}, RatingMetric: "peak", WindowKind: "period", RenownWindow: "period",
		PerformanceMetric: "dps", LimitCount: 10})
	require.NoError(t, err)
	require.Len(t, guilds, 1)
	require.Equal(t, "Set Guild", guilds[0].SubjectName)
	require.InDelta(t, 140.0/3, guilds[0].Score, 1e-9, "a missed chosen boss (Garr) counts as 0")
}
