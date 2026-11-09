package leaderboardread_test

import (
	"os"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardread"
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
	require.Equal(t, "Unknown realm", rows[0].RealmName)
	require.InDelta(t, 71, rows[0].Score, 1e-8)
	require.InDelta(t, 90, rows[0].Peak, 1e-8)
	require.InDelta(t, 40, rows[1].Score, 1e-8)
	require.InDelta(t, 40, rows[1].Form, 1e-8)
	require.InDelta(t, 25, rows[1].Floor, 1e-8)
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
	p.AfterClass = first[0].PlayerClass
	p.AfterSpec = first[0].PlayerSpec
	p.AfterSubSpec = first[0].PlayerSubSpec
	second, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Equal(t, rows[1].RealmID, second[0].RealmID)
	p.AfterScore = second[0].Score
	p.AfterRealm = second[0].RealmID
	p.AfterSubject = second[0].SubjectID
	p.AfterClass = second[0].PlayerClass
	p.AfterSpec = second[0].PlayerSpec
	p.AfterSubSpec = second[0].PlayerSubSpec
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
	// current award when explicitly selected for Renown. The other variant remains isolated.
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

func TestAllCohortsNormalizeIndependently(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "BEGIN")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(ctx, "ROLLBACK") }()
	fixture, err := os.ReadFile("testdata/cross_cohort_fixture.sql")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, string(fixture))
	require.NoError(t, err)
	db := database.NewQueries(conn)
	p := database.ListLeaderboardV2Params{TenantID: uuid.MustParse("00000000-0000-4000-8000-000000000001"), InstanceName: "Cross raid", SubjectKind: "player", BoardKind: "boss", ScoreMetric: "peak", Metric: "dps", Bosses: []string{"A"}, Denominator: 1, PageSize: 50}
	for _, metric := range []string{"peak", "mastery"} {
		p.ScoreMetric = metric
		rows, err := db.ListLeaderboardV2(ctx, p)
		require.NoError(t, err)
		require.Len(t, rows, 3)
		require.Equal(t, "HUNTER", rows[0].PlayerClass)
		require.Equal(t, "Survival", rows[0].PlayerSpec)
		require.InDelta(t, 99, rows[0].Score, 1e-8)
		require.Equal(t, "Arcane", rows[1].PlayerSpec)
		require.Equal(t, "Frost", rows[2].PlayerSpec)
		require.InDelta(t, 98, rows[2].Score, 1e-8)
	}
	p.PageSize = 1
	var identities []string
	for range 3 {
		rows, err := db.ListLeaderboardV2(ctx, p)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		row := rows[0]
		identities = append(identities, row.SubjectID+"/"+row.PlayerClass+"/"+row.PlayerSpec)
		p.HasCursor = true
		p.AfterScore = row.Score
		p.AfterRealm = row.RealmID
		p.AfterSubject = row.SubjectID
		p.AfterClass = row.PlayerClass
		p.AfterSpec = row.PlayerSpec
		p.AfterSubSpec = row.PlayerSubSpec
	}
	require.Equal(t, []string{"hunter/HUNTER/Survival", "mage/MAGE/Arcane", "mage/MAGE/Frost"}, identities)
	end, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Empty(t, end)
	p.HasCursor = false
	p.PageSize = 50
	p.PlayerClass = "MAGE"
	mages, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, mages, 2)
	p.PlayerSpec = "Frost"
	frost, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, frost, 1)
	p.Bosses = []string{"A", "B"}
	p.Denominator = 2
	p.PlayerClass = ""
	p.PlayerSpec = ""
	group, err := db.ListLeaderboardV2(ctx, p)
	require.NoError(t, err)
	require.Len(t, group, 3)
	require.InDelta(t, 99, group[0].Score, 1e-8)
	require.InDelta(t, 49, group[1].Score, 1e-8)
	require.InDelta(t, 49, group[2].Score, 1e-8)
}

func TestSelectedRenownSums(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "BEGIN")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(ctx, "ROLLBACK") }()
	fixture, err := os.ReadFile("testdata/renown_selection_fixture.sql")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, string(fixture))
	require.NoError(t, err)
	config := []database.ResolveLeaderboardConfigurationRow{
		{Kind: "instance", InstanceName: "Selected raid"},
		{Kind: "set", InstanceName: "Selected raid", SetKey: "default"},
		{Kind: "set", InstanceName: "Selected raid", SetKey: "empty"},
	}
	for i, boss := range []string{"Ragnaros", "Lucifron", "Other"} {
		config = append(config, database.ResolveLeaderboardConfigurationRow{Kind: "boss", InstanceName: "Selected raid", EncounterName: boss, HasPoints: true, Points: []float64{5, 1, 9}[i]}, database.ResolveLeaderboardConfigurationRow{Kind: "member", InstanceName: "Selected raid", SetKey: "default", EncounterName: boss})
	}
	for _, subject := range []string{"player", "guild"} {
		for _, tc := range []struct {
			boss, set string
			bosses    []string
			want      float64
		}{
			{boss: "Ragnaros", want: 220}, {boss: "Lucifron", want: 44}, {bosses: []string{"Ragnaros", "Lucifron", "Ragnaros"}, want: 264}, {set: "default", want: 660}, {want: 660}, {set: "empty", want: 0},
		} {
			req := leaderboardread.Request{Instance: "Selected raid", Subject: subject, Kind: "renown", Score: "renown", Boss: tc.boss, Set: tc.set, Bosses: tc.bosses}
			selection, err := leaderboardread.Select(config, req)
			require.NoError(t, err)
			require.EqualValues(t, 1, selection.Denominator)
			rows, err := database.NewQueries(conn).ListLeaderboardV2(ctx, database.ListLeaderboardV2Params{TenantID: uuid.MustParse("00000000-0000-4000-8000-000000000001"), InstanceName: req.Instance, SubjectKind: subject, BoardKind: "renown", ScoreMetric: "renown", Bosses: selection.Bosses, Awards: selection.Awards, Denominator: selection.Denominator, PageSize: 50})
			require.NoError(t, err)
			if tc.want == 0 {
				require.Empty(t, rows)
			} else {
				require.Len(t, rows, 1)
				require.Equal(t, tc.want, rows[0].Score)
			}
		}
	}
}

func TestPageBossDetails(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "BEGIN")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(ctx, "ROLLBACK") }()
	for _, file := range []string{"read_fixture.sql", "peak_provenance_fixture.sql"} {
		fixture, err := os.ReadFile("testdata/" + file)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, string(fixture))
		require.NoError(t, err)
	}
	db := database.NewQueries(conn)
	realm := uuid.MustParse("00000000-0000-4000-8000-000000000002")
	p := database.ListLeaderboardV2PageBossesParams{TenantID: uuid.MustParse("00000000-0000-4000-8000-000000000001"), InstanceName: "Test raid", SubjectKind: "player", Metric: "dps", Bosses: []string{"Boss A", "Boss B"}, Realms: []uuid.UUID{realm}, Subjects: []string{"Alice"}, Classes: []string{"MAGE"}, Specs: []string{"Frost"}, SubSpecs: []string{""}}
	rows, err := db.ListLeaderboardV2PageBosses(ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, "Alice", rows[0].SubjectID) // Bob and the other realm never enter the requested page.
	require.Equal(t, 100.0, rows[0].Peak)
	require.Equal(t, 100.0, rows[0].RawPeak)
	require.EqualValues(t, 130000, rows[0].DurationMs)
	require.False(t, rows[0].PeakAt.Valid, "a peak encounter missing from log_instance_encounters has no date")
	require.Zero(t, rows[1].Peak)
	require.Zero(t, rows[1].ObservationCount)
	require.Zero(t, rows[1].DurationMs)
	p.Realms[0] = uuid.MustParse("00000000-0000-4000-8000-000000000003")
	rows, err = db.ListLeaderboardV2PageBosses(ctx, p)
	require.NoError(t, err)
	require.Zero(t, rows[0].DurationMs)
	p.Realms[0] = realm
	p.Specs[0] = "Other"
	rows, err = db.ListLeaderboardV2PageBosses(ctx, p)
	require.NoError(t, err)
	require.Zero(t, rows[0].ObservationCount)
	p.Specs[0] = "Frost"
	p.DifficultyName = "Heroic"
	p.MaxPlayers = 25
	rows, err = db.ListLeaderboardV2PageBosses(ctx, p)
	require.NoError(t, err)
	require.Zero(t, rows[0].DurationMs)
	p.DifficultyName = ""
	p.MaxPlayers = 0
	p.TenantID = uuid.New()
	rows, err = db.ListLeaderboardV2PageBosses(ctx, p)
	require.NoError(t, err)
	require.Zero(t, rows[0].ObservationCount)
	p.TenantID = uuid.MustParse("00000000-0000-4000-8000-000000000001")
	p.SubjectKind = "guild"
	p.Subjects[0] = "00000000-0000-4000-8000-000000000004"
	p.Classes[0] = ""
	p.Specs[0] = ""
	rows, err = db.ListLeaderboardV2PageBosses(ctx, p)
	require.NoError(t, err)
	require.EqualValues(t, 200, rows[0].DurationMs)
	require.Equal(t, 50.0, rows[0].Peak)
	require.False(t, rows[0].PeakAt.Valid, "guild bosses carry no peak date")
}

func TestIndependentWholeSelectionCompanions(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "BEGIN")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(ctx, "ROLLBACK") }()
	fixture, err := os.ReadFile("testdata/companion_fixture.sql")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, string(fixture))
	require.NoError(t, err)
	db := database.NewQueries(conn)
	p := database.ListLeaderboardV2PlayerCompanionsParams{TenantID: uuid.MustParse("00000000-0000-4000-8000-000000000001"), InstanceName: "Companions", Metric: "dps", Bosses: []string{"A", "B"}, Denominator: 2, Realms: []uuid.UUID{uuid.MustParse("00000000-0000-4000-8000-000000000002")}, Subjects: []string{"Mage"}}
	rows, err := db.ListLeaderboardV2PlayerCompanions(ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	for _, row := range rows {
		if row.Metric == "peak" {
			require.Equal(t, "Frost", row.PlayerSpec)
			require.Equal(t, 100.0, row.Score)
		} else {
			require.Equal(t, "Fire", row.PlayerSpec)
			require.Equal(t, 80.0, row.Score)
		}
	}
	// A perfect Arcane boss cannot be blended with another spec's B to win.
	p.PlayerSpec = "Arcane"
	rows, err = db.ListLeaderboardV2PlayerCompanions(ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	for _, row := range rows {
		require.Equal(t, 50.0, row.Score)
	}
	p.PlayerSpec = ""
	p.Metric = "hps"
	rows, err = db.ListLeaderboardV2PlayerCompanions(ctx, p)
	require.NoError(t, err)
	require.Empty(t, rows)
	p.Metric = "dps"
	p.Subjects = []string{"Not on page"}
	rows, err = db.ListLeaderboardV2PlayerCompanions(ctx, p)
	require.NoError(t, err)
	require.Empty(t, rows)
	p.Subjects = []string{"Zero"}
	rows, err = db.ListLeaderboardV2PlayerCompanions(ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	for _, row := range rows {
		require.Zero(t, row.Score)
	}
	p.Subjects = []string{"Mage"}
	p.DifficultyName = "Heroic"
	p.MaxPlayers = 25
	rows, err = db.ListLeaderboardV2PlayerCompanions(ctx, p)
	require.NoError(t, err)
	require.Empty(t, rows)
	p.DifficultyName = ""
	p.MaxPlayers = 0
	renown, err := db.ListLeaderboardV2PageRenown(ctx, database.ListLeaderboardV2PageRenownParams{TenantID: p.TenantID, InstanceName: p.InstanceName, SubjectKind: "player", Realms: []uuid.UUID{p.Realms[0], p.Realms[0]}, Subjects: []string{"Mage", "Mage"}, Bosses: p.Bosses, Awards: []float64{5, 1}})
	require.NoError(t, err)
	require.Len(t, renown, 1)
	require.Equal(t, 222.0, renown[0].Renown)
}

// Renown counts are per player, not per class, so their rows have no player_class.
// The read still returns the character's class and guild for display without changing identity.
func TestRenownSubjectClass(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "BEGIN")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(ctx, "ROLLBACK") }()
	_, err = conn.Exec(ctx, `
SET LOCAL app.tenant_bypass='true';
INSERT INTO wow_servers (id, name) VALUES ('00000000-0000-4000-8000-0000000000a1', 'Class server');
INSERT INTO wow_server_realms (id, server_id, name) VALUES ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', 'Class realm');
INSERT INTO guilds (id, realm_id, name) VALUES ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000a2', 'Shadow Pact');
INSERT INTO game_players (id, realm_id, name, class, gender, race, guild_id) VALUES ('0x00000000000000A3', '00000000-0000-4000-8000-0000000000a2', 'Warlocky', 'WARLOCK', 'Female', 'Human', '00000000-0000-4000-8000-0000000000a5');
INSERT INTO leaderboard_player_renown_counts (tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,player_guid,kill_count,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Class raid','',0,'Ragnaros','00000000-0000-4000-8000-0000000000a2','0x00000000000000A3',2,1,1),
       ('00000000-0000-4000-8000-000000000001','Class raid','',0,'Ragnaros','00000000-0000-4000-8000-0000000000a2','0x00000000000000A4',1,1,1);`)
	require.NoError(t, err)
	rows, err := database.NewQueries(conn).ListLeaderboardV2(ctx, database.ListLeaderboardV2Params{
		TenantID: uuid.MustParse("00000000-0000-4000-8000-000000000001"), InstanceName: "Class raid", SubjectKind: "player", BoardKind: "renown", ScoreMetric: "renown",
		Bosses: []string{"Ragnaros"}, Awards: []float64{5}, Denominator: 1, PageSize: 50,
	})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, "Warlocky", rows[0].SubjectName)
	require.Empty(t, rows[0].PlayerClass, "identity stays classless")
	require.Equal(t, "WARLOCK", rows[0].SubjectClass)
	require.Equal(t, "Shadow Pact", rows[0].GuildName)
	require.Empty(t, rows[0].LogoUrl, "players carry no logo")
	require.Empty(t, rows[1].SubjectClass, "an unknown character has no class")
	require.Empty(t, rows[1].GuildName, "an unknown character has no guild")

	// Guild boards return the guild page's logo; a guild without a page has none.
	_, err = conn.Exec(ctx, `
INSERT INTO guilds (id, realm_id, name) VALUES ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a2', 'No Page');
INSERT INTO guild_pages (guild_id, theme) VALUES ('00000000-0000-4000-8000-0000000000a5', '{"logo_url": "/static/guilds/shadow-pact.png"}');
INSERT INTO leaderboard_guild_renown_counts (tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,guild_id,kill_count,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Class raid','',0,'Ragnaros','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000a5',2,1,1),
       ('00000000-0000-4000-8000-000000000001','Class raid','',0,'Ragnaros','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000a6',1,1,1);`)
	require.NoError(t, err)
	guilds, err := database.NewQueries(conn).ListLeaderboardV2(ctx, database.ListLeaderboardV2Params{
		TenantID: uuid.MustParse("00000000-0000-4000-8000-000000000001"), InstanceName: "Class raid", SubjectKind: "guild", BoardKind: "renown", ScoreMetric: "renown",
		Bosses: []string{"Ragnaros"}, Awards: []float64{5}, Denominator: 1, PageSize: 50,
	})
	require.NoError(t, err)
	require.Len(t, guilds, 2)
	require.Equal(t, "Shadow Pact", guilds[0].SubjectName)
	require.Equal(t, "/static/guilds/shadow-pact.png", guilds[0].LogoUrl)
	require.Empty(t, guilds[1].LogoUrl)
	require.Empty(t, guilds[0].GuildName, "guild rows carry no player guild")
}
