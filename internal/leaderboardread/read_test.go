package leaderboardread_test

import (
	"os"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSummaryReadsWithMixedVersionMetadata(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	fixture, err := os.ReadFile("testdata/read_fixture.sql")
	require.NoError(t, err)
	// Fixture SQL, not a raw application query. Transaction-local bypass never
	// escapes this isolated test connection.
	_, err = conn.Exec(ctx, "BEGIN")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(ctx, "ROLLBACK") }()
	_, err = conn.Exec(ctx, string(fixture))
	require.NoError(t, err)
	db := database.NewQueries(conn)
	p := database.ListLeaderboardV2Params{TenantID: uuid.MustParse("00000000-0000-4000-8000-000000000001"), InstanceName: "Test raid", SubjectKind: "player", BoardKind: "boss", ScoreMetric: "mastery", PlayerClass: "MAGE", PlayerSpec: "Frost", Metric: "dps", Bosses: []string{"Boss A", "Boss B"}, Awards: []float64{10, 0}, Denominator: 2, PageSize: 50}
	cohorts, err := db.ListLeaderboardV2Cohorts(ctx, database.ListLeaderboardV2CohortsParams{TenantID: p.TenantID, InstanceName: p.InstanceName, Bosses: p.Bosses})
	require.NoError(t, err)
	require.Len(t, cohorts, 1)
	require.Equal(t, "Frost", cohorts[0].PlayerSpec)
	rows, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 3)
	require.Equal(t, "Bob", rows[0].SubjectID)
	require.InDelta(t, 71, rows[0].Score, 1e-8)
	require.InDelta(t, 90, rows[0].Peak, 1e-8)
	require.InDelta(t, 40, rows[1].Score, 1e-8)
	require.InDelta(t, 50, rows[1].Peak, 1e-8)
	require.NotEqual(t, rows[1].RealmID, rows[2].RealmID)
	// Ties advance by realm then subject, never offset or display-rounded scores.
	p.PageSize = 1
	first, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	p.HasCursor = true
	p.AfterScore = first[0].Score
	p.AfterRealm = first[0].RealmID
	p.AfterSubject = first[0].SubjectID
	second, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Equal(t, rows[1].RealmID, second[0].RealmID)
	p.AfterScore = second[0].Score
	p.AfterRealm = second[0].RealmID
	p.AfterSubject = second[0].SubjectID
	third, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Equal(t, rows[2].RealmID, third[0].RealmID)
	p.HasCursor = false
	p.PageSize = 50
	p.Search = "alice"
	p.RealmFilter = rows[1].RealmID
	filtered, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, filtered, 1)
	require.InDelta(t, 40, filtered[0].Score, 1e-8)
	p.Search = ""
	p.RealmFilter = uuid.Nil
	p.PlayerSpec = "Other"
	empty, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Empty(t, empty)
	p.PlayerSpec = "Frost"
	p.BoardKind = "renown"
	p.ScoreMetric = "renown"
	p.Denominator = 1
	renown, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, renown, 1)
	require.Equal(t, 30.0, renown[0].Score)
	p.Awards = []float64{20, 0}
	renown, err = db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 60.0, renown[0].Score)
	// Optional Boss B is outside the performance set but still contributes its
	// current award to instance Renown. The other variant remains isolated.
	p.Awards = []float64{20, 5}
	renown, err = db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 95.0, renown[0].Score)
	p.DifficultyName, p.MaxPlayers = "Heroic", 25
	renown, err = db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, renown, 1)
	require.Equal(t, 2000.0, renown[0].Score)
	p.DifficultyName, p.MaxPlayers = "", 0
	p.Awards = []float64{20, 0}
	p.SubjectKind = "guild"
	p.BoardKind = "boss"
	p.ScoreMetric = "mastery"
	p.Denominator = 2
	guild, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, guild, 1)
	require.InDelta(t, 19.5, guild[0].Score, 1e-8)
	p.BoardKind = "clear"
	p.Denominator = 1
	clear, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, clear, 1)
	require.InDelta(t, 39, clear[0].Score, 1e-8)
	p.BoardKind = "renown"
	p.ScoreMetric = "renown"
	guildRenown, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 60.0, guildRenown[0].Score)
	changed, err := os.ReadFile("testdata/change_benchmark.sql")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, string(changed))
	require.NoError(t, err)
	p.SubjectKind = "player"
	p.BoardKind = "boss"
	p.ScoreMetric = "mastery"
	p.Denominator = 2
	updated, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.InDelta(t, 35.5, updated[0].Mastery, 1e-8)
	require.InDelta(t, 45, updated[0].Peak, 1e-8)

}
