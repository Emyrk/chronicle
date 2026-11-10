package serviceratings

import (
	"testing"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func makeCareerDue(s *sourceFixture) {
	s.t.Helper()
	s.exec(`UPDATE leaderboard_dirty_careers SET process_after=clock_timestamp()-interval '1 second' WHERE tenant_id=$1`, s.tenant)
}

func TestCareerEnqueueBoundedDebounce(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()

	require.NoError(t, s.db.EnqueueLeaderboardCareer(ctx, s.tenant))
	var debounced bool
	require.NoError(t, s.row(`SELECT process_after-dirtied_at BETWEEN interval '29 seconds' AND interval '31 seconds' FROM leaderboard_dirty_careers WHERE tenant_id=$1`, s.tenant).Scan(&debounced))
	require.True(t, debounced)

	// A sustained burst can move the trailing edge, but never beyond five
	// minutes from the beginning of the dirty period.
	s.exec(`UPDATE leaderboard_dirty_careers SET dirtied_at=clock_timestamp()-interval '4 minutes 50 seconds' WHERE tenant_id=$1`, s.tenant)
	require.NoError(t, s.db.EnqueueLeaderboardCareer(ctx, s.tenant))
	var bounded bool
	require.NoError(t, s.row(`SELECT process_after=dirtied_at+interval '5 minutes' FROM leaderboard_dirty_careers WHERE tenant_id=$1`, s.tenant).Scan(&bounded))
	require.True(t, bounded)
}

func TestCareerQueueFencingAndSweep(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	require.NoError(t, s.db.EnsureLeaderboardCareerSweep(ctx, s.tenant))
	var required bool
	require.NoError(t, s.row(`SELECT required FROM leaderboard_dirty_careers WHERE tenant_id=$1`, s.tenant).Scan(&required))
	require.False(t, required)
	require.NoError(t, s.db.EnqueueLeaderboardCareer(ctx, s.tenant))
	makeCareerDue(s)
	first, err := s.db.ClaimLeaderboardCareer(ctx, s.tenant)
	require.NoError(t, err)
	_, err = s.db.ClaimLeaderboardCareer(ctx, s.tenant)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	s.exec(`UPDATE leaderboard_dirty_careers SET locked_until=clock_timestamp()-interval '1 second' WHERE tenant_id=$1`, s.tenant)
	second, err := s.db.ClaimLeaderboardCareer(ctx, s.tenant)
	require.NoError(t, err)
	require.NotEqual(t, first.ClaimToken, second.ClaimToken)
	_, err = s.db.LockLeaderboardCareerPublication(ctx, database.LockLeaderboardCareerPublicationParams{TenantID: s.tenant, ClaimToken: first.ClaimToken.UUID, ClaimedRevision: first.ClaimedRevision.Int64})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	require.NoError(t, s.db.CompleteLeaderboardCareer(ctx, database.CompleteLeaderboardCareerParams{TenantID: s.tenant, ClaimToken: first.ClaimToken.UUID, ClaimedRevision: first.ClaimedRevision.Int64}))
	pending, err := s.db.HasPendingLeaderboardCareer(ctx, s.tenant)
	require.NoError(t, err)
	require.True(t, pending)
	require.NoError(t, s.db.CompleteLeaderboardCareer(ctx, database.CompleteLeaderboardCareerParams{TenantID: s.tenant, ClaimToken: second.ClaimToken.UUID, ClaimedRevision: second.ClaimedRevision.Int64}))
	pending, err = s.db.HasPendingLeaderboardCareer(ctx, s.tenant)
	require.NoError(t, err)
	require.False(t, pending)
}

func TestCareerBoundedPassPreservesNewRevision(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	s.exec(`INSERT INTO leaderboard_career_identities(tenant_id,subject_kind,realm_id,subject_id,player_class,player_spec) SELECT $1,'player',$2,lpad(i::text,4,'0'),'MAGE','Frost' FROM generate_series(1,201) i`, s.tenant, s.realm)
	require.NoError(t, s.db.EnqueueLeaderboardCareer(ctx, s.tenant))
	makeCareerDue(s)
	worker := CareerWorker{Store: s.db}
	processed, err := worker.Drain(ctx, s.tenant)
	require.NoError(t, err)
	require.True(t, processed)
	var cursor string
	require.NoError(t, s.row(`SELECT cursor_subject FROM leaderboard_dirty_careers WHERE tenant_id=$1`, s.tenant).Scan(&cursor))
	require.Equal(t, "0100", cursor)
	require.NoError(t, s.db.EnqueueLeaderboardCareer(ctx, s.tenant))
	makeCareerDue(s)
	_, err = worker.Drain(ctx, s.tenant)
	require.NoError(t, err)
	require.NoError(t, s.row(`SELECT cursor_subject FROM leaderboard_dirty_careers WHERE tenant_id=$1`, s.tenant).Scan(&cursor))
	require.Equal(t, "0200", cursor)
	_, err = worker.Drain(ctx, s.tenant)
	require.NoError(t, err)
	require.NoError(t, s.row(`SELECT cursor_subject FROM leaderboard_dirty_careers WHERE tenant_id=$1`, s.tenant).Scan(&cursor))
	require.Empty(t, cursor)
	makeCareerDue(s)
	for range 3 {
		_, err = worker.Drain(ctx, s.tenant)
		require.NoError(t, err)
	}
	pending, err := s.db.HasPendingLeaderboardCareer(ctx, s.tenant)
	require.NoError(t, err)
	require.False(t, pending)
	// Reads reject a tenant identity mismatch rather than borrowing another scope.
	_, err = ReadPlayerCareer(ctx, s.db, uuid.New(), s.realm, "Player")
	require.Error(t, err)
}

func TestCareerPublicationReadAndRetraction(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	s.exec(`UPDATE tenants SET additional_flavor=ARRAY['vanilla'] WHERE id=$1`, s.tenant)
	s.exec(`INSERT INTO leaderboard_instances(instance_name) VALUES('Fixture raid')`)
	s.exec(`INSERT INTO leaderboard_instance_variants VALUES('Fixture raid','Normal',40)`)
	s.exec(`INSERT INTO leaderboard_bosses VALUES('Fixture raid','Boss')`)
	s.exec(`INSERT INTO leaderboard_sets VALUES('Fixture raid','default','Full raid')`)
	s.exec(`INSERT INTO leaderboard_set_members VALUES('Fixture raid','default','Boss')`)
	s.exec(`INSERT INTO leaderboard_instance_overrides VALUES('vanilla','Fixture raid',true)`)
	s.exec(`INSERT INTO leaderboard_variant_overrides VALUES('vanilla','Fixture raid','Normal',40,true)`)
	s.exec(`INSERT INTO leaderboard_boss_overrides VALUES('vanilla','Fixture raid','Boss',true)`)
	s.exec(`INSERT INTO leaderboard_set_overrides VALUES('vanilla','Fixture raid','default',true)`)
	s.exec(`INSERT INTO leaderboard_member_overrides VALUES('vanilla','Fixture raid','default','Boss',true,1)`)
	s.exec(`INSERT INTO leaderboard_boss_renown VALUES('vanilla','Fixture raid','Boss',3)`)
	s.exec(`INSERT INTO leaderboard_career_variants VALUES('Fixture raid','Normal',40,ARRAY['vanilla'],true,true,2)`)
	s.times()
	require.NoError(t, s.direct(s.compute()))
	for family := Family(0); family < familyCount; family++ {
		_, err := (&Worker{Store: s.db}).Drain(ctx, s.tenant, family)
		require.NoError(t, err)
	}
	initial, err := ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Len(t, initial.Cohorts, 1)
	require.Equal(t, "preparing", initial.Cohorts[0].PerformanceStatus)
	require.True(t, initial.Cohorts[0].RefreshPending)
	require.Nil(t, initial.Cohorts[0].ChosenMetric)
	worker := CareerWorker{Store: s.db}
	makeCareerDue(s)
	_, err = worker.Drain(ctx, s.tenant)
	require.NoError(t, err)
	rows, err := ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Len(t, rows.Cohorts, 1)
	require.Equal(t, "ready", rows.Cohorts[0].PerformanceStatus)
	require.Equal(t, 30.0, *rows.Cohorts[0].Mastery) // One kill supplies Peak, not full Form/Floor histories.
	require.Equal(t, 3.0, rows.Cohorts[0].Renown)
	require.Equal(t, "dps", *rows.Cohorts[0].ChosenMetric)
	require.NotNil(t, rows.Cohorts[0].ComputedAt)
	require.False(t, rows.Cohorts[0].RefreshPending)
	board, err := ReadCareerBoard(ctx, s.db, s.tenant, CareerBoardFilter{})
	require.NoError(t, err)
	require.Equal(t, "ready", board.Status)
	require.Len(t, board.Entries, 1)
	require.Equal(t, "Player", board.Entries[0].SubjectID)
	require.Equal(t, 30.0, *board.Entries[0].Mastery)
	require.Equal(t, 3.0, board.Entries[0].Renown)
	leaders, err := ReadCareerLeaders(ctx, s.db, s.tenant, false, 5)
	require.NoError(t, err)
	require.Len(t, leaders.Boards["mastery"], 1)
	require.NotEmpty(t, leaders.Boards["mastery"][0].Name)
	scoped, err := ReadCareerBoard(ctx, s.db, s.tenant, CareerBoardFilter{Realm: uuid.New()})
	require.NoError(t, err)
	require.Empty(t, scoped.Entries, "a realm filter excludes other realms")
	names, err := s.db.ListLeaderboardCareerPlayerNames(ctx, database.ListLeaderboardCareerPlayerNamesParams{RealmIds: []uuid.UUID{s.realm}, SubjectIds: []string{"Player"}})
	require.NoError(t, err)
	require.Len(t, names, 1)
	require.NotEmpty(t, names[0].PlayerName)
	guild, err := ReadGuildCareer(ctx, s.db, s.tenant, s.guild)
	require.NoError(t, err)
	require.Equal(t, "kill_time", *guild.ChosenMetric)
	require.Equal(t, 30.0, *guild.Mastery)
	guilds, err := ReadCareerBoard(ctx, s.db, s.tenant, CareerBoardFilter{Guilds: true})
	require.NoError(t, err)
	require.Len(t, guilds.Entries, 1)
	require.Equal(t, s.guild.String(), guilds.Entries[0].SubjectID)
	require.Equal(t, 30.0, *guilds.Entries[0].Mastery)
	guildNames, err := s.db.ListLeaderboardCareerGuildNames(ctx, []uuid.UUID{s.guild})
	require.NoError(t, err)
	require.Len(t, guildNames, 1)
	found, err := s.db.SearchLeaderboardCareerGuilds(ctx, database.SearchLeaderboardCareerGuildsParams{Search: strings.ToUpper(guildNames[0].Name[:2])})
	require.NoError(t, err)
	require.Contains(t, found, database.SearchLeaderboardCareerGuildsRow{RealmID: s.realm, SubjectID: s.guild.String()}, "search is case-insensitive")
	// A benchmark-only publication must refresh unchanged subjects' normalized inputs.
	s.exec(`UPDATE leaderboard_player_observations SET metric_value=200 WHERE tenant_id=$1`, s.tenant)
	s.enqueue(FamilyPlayerBossBenchmark, "Boss", time.Now().Add(-time.Minute))
	_, err = (&Worker{Store: s.db}).Drain(ctx, s.tenant, FamilyPlayerBossBenchmark)
	require.NoError(t, err)
	pending, err := s.db.HasPendingLeaderboardCareer(ctx, s.tenant)
	require.NoError(t, err)
	require.True(t, pending)
	makeCareerDue(s)
	_, err = worker.Drain(ctx, s.tenant)
	require.NoError(t, err)
	rows, err = ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, 15.0, *rows.Cohorts[0].Mastery)
	// Awards apply immediately without recounting, with policy staleness exposed.
	s.exec(`UPDATE leaderboard_boss_renown SET points=7 WHERE layer_key='vanilla' AND instance_name='Fixture raid'`)
	rows, err = ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, 7.0, rows.Cohorts[0].Renown)
	require.True(t, rows.Cohorts[0].RefreshPending)
	s.exec(`UPDATE leaderboard_career_variants SET weight=NULL WHERE instance_name='Fixture raid'`)
	rows, err = ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, "weights_pending", rows.Cohorts[0].PerformanceStatus)
	require.Nil(t, rows.Cohorts[0].Mastery)
	require.Equal(t, 7.0, rows.Cohorts[0].Renown)
	s.exec(`UPDATE tenants SET parse_config='{"cohort_mode":"class"}' WHERE id=$1`, s.tenant)
	_, err = ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.ErrorIs(t, err, ErrCareerUnsupportedMode)
	_, err = ReadCareerBoard(ctx, s.db, s.tenant, CareerBoardFilter{})
	require.ErrorIs(t, err, ErrCareerUnsupportedMode)
	s.exec(`UPDATE tenants SET parse_config='{}' WHERE id=$1`, s.tenant)
	s.exec(`UPDATE wow_log_groups SET unlisted=true WHERE id=$1`, s.group)
	require.NoError(t, s.direct(s.compute()))
	for family := Family(0); family < familyCount; family++ {
		_, err := (&Worker{Store: s.db}).Drain(ctx, s.tenant, family)
		require.NoError(t, err)
	}
	makeCareerDue(s)
	_, err = worker.Drain(ctx, s.tenant)
	require.NoError(t, err)
	rows, err = ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Empty(t, rows.Cohorts)
}

func TestCareerReadForeignIdentity(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	empty, err := ReadPlayerCareer(s.tenantctx(), s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Empty(t, empty.Cohorts)
	require.NotEmpty(t, empty.PoolFingerprint)
	require.NotNil(t, empty.Issues)
	require.Equal(t, "no_active_raids", empty.Status)
	_, err = ReadPlayerCareer(s.tenantctx(), s.db, s.tenant, uuid.New(), "Player")
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = ReadGuildCareer(s.tenantctx(), s.db, s.tenant, uuid.New())
	require.ErrorIs(t, err, pgx.ErrNoRows)
	otherTenant := uuid.New()
	s.exec(`INSERT INTO tenants(id,name) VALUES($1,'Other career tenant')`, otherTenant)
	s.exec(`UPDATE wow_servers SET tenant_id=$1 WHERE id=$2`, otherTenant, s.server)
	_, err = ReadPlayerCareer(s.tenantctx(), s.db, s.tenant, s.realm, "Player")
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = ReadGuildCareer(s.tenantctx(), s.db, s.tenant, s.guild)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}
