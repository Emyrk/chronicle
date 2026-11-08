package serviceratings

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

// The ratings education page reads a character's evidence through rankings,
// because observations have no player-first index.
func TestListLeaderboardV2PlayerHistory(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	require.NoError(t, s.direct(s.compute()))
	s.exec(`INSERT INTO leaderboard_player_boss_benchmarks(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,best_metric,projection_version,algorithm_version,computed_at)
		SELECT tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,250,1,1,now() FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant)
	s.exec(`INSERT INTO parse_score_results(tenant_id,instance_id,run_id,encounter_name,player_guid,metric,metric_value,precise_score,display_score,rank,sample_size)
		VALUES($1,$2,$3,'Boss','Player','dps',100,87.5,87,3,20)`, s.tenant, s.instance, s.run)

	rows, err := s.db.ListLeaderboardV2PlayerHistory(s.tenantctx(), database.ListLeaderboardV2PlayerHistoryParams{TenantID: s.tenant, RealmID: s.realm, PlayerGuid: "Player"})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	row := rows[0]
	// DPS (100) beats HPS (25), so the kill is a DPS observation only.
	require.Equal(t, "dps", row.Metric)
	require.Equal(t, 100.0, row.MetricValue)
	require.Equal(t, 250.0, row.BestMetric)
	require.True(t, row.HasParse)
	require.Equal(t, int16(87), row.Parse)
	require.True(t, row.KilledAt.Time.Equal(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))

	other, err := s.db.ListLeaderboardV2PlayerHistory(s.tenantctx(), database.ListLeaderboardV2PlayerHistoryParams{TenantID: s.tenant, RealmID: s.realm, PlayerGuid: "Someone else"})
	require.NoError(t, err)
	require.Empty(t, other)
}
