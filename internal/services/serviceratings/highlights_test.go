package serviceratings

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func highlightConfig() []database.ResolveLeaderboardConfigurationRow {
	return []database.ResolveLeaderboardConfigurationRow{
		{Kind: "instance", InstanceName: "Fixture raid"},
		{Kind: "variant", InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40},
		{Kind: "boss", InstanceName: "Fixture raid", EncounterName: "Boss", HasPoints: true, Points: 10},
		{Kind: "set", InstanceName: "Fixture raid", SetKey: "default"},
		{Kind: "member", InstanceName: "Fixture raid", SetKey: "default", EncounterName: "Boss"},
	}
}

type highlightStore struct {
	database.Store
	config []database.ResolveLeaderboardConfigurationRow
	fail   bool
}

func (s highlightStore) ResolveLeaderboardConfiguration(context.Context, []string) ([]database.ResolveLeaderboardConfigurationRow, error) {
	return s.config, nil
}
func (s highlightStore) RankingsLeaderboardNoJIT(ctx context.Context, p database.RankingsLeaderboardParams) ([]database.RankingsLeaderboardRow, error) {
	if s.fail {
		return nil, errors.New("injected rankings refresh failure")
	}
	return s.Store.RankingsLeaderboardNoJIT(ctx, p)
}
func (s highlightStore) GetDataset(context.Context, uuid.UUID) (database.Dataset, error) {
	return database.Dataset{}, nil
}

func TestHighlightsUseExistingReadsAndKeepFailedSnapshot(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.times()
	require.NoError(t, s.direct(s.compute()))
	for f := Family(0); f < familyCount; f++ {
		_, err := (&Worker{Store: s.db}).Drain(s.ctx, s.tenant, f)
		require.NoError(t, err)
	}
	store := highlightStore{Store: s.db, config: highlightConfig()}
	cohort := HighlightCohort{"Fixture raid", "Normal", 40}
	require.NoError(t, RefreshHighlights(s.tenantctx(), store, s.tenant, uuid.Nil, cohort))
	snapshots, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Len(t, snapshots, 1)
	var preview chroniclesdk.HubLandingPreview
	require.NoError(t, json.Unmarshal(snapshots[0].Payload, &preview))
	require.Len(t, preview.Player.Peak, 1)
	require.Equal(t, float64(100), preview.Player.Peak[0].Score)
	require.Equal(t, float64(100), *preview.Player.Peak[0].PeakRaw)
	require.Len(t, preview.Player.Renown, 1)
	require.Equal(t, float64(10), preview.Player.Renown[0].Score)
	require.NoError(t, RefreshHighlights(s.tenantctx(), store, s.tenant, s.realm, cohort))
	scoped, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant, RealmScope: s.realm})
	require.NoError(t, err)
	require.Len(t, scoped, 1)
	store.fail = true
	require.ErrorContains(t, RefreshHighlights(s.tenantctx(), store, s.tenant, uuid.Nil, cohort), "injected")
	after, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Equal(t, snapshots[0].Payload, after[0].Payload)
	require.Equal(t, snapshots[0].RefreshedAt, after[0].RefreshedAt)
	foreign, err := s.db.ListLeaderboardHighlights(servicetenant.WithTenantID(s.ctx, uuid.New()), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Empty(t, foreign)
	require.ErrorContains(t, RefreshHighlights(s.tenantctx(), store, s.tenant, uuid.New(), cohort), "realm does not belong")
}

func TestHighlightPublicationUniqueAndOlderRefreshCannotReplace(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	p := database.PublishLeaderboardHighlightsParams{TenantID: s.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, ConfigurationFingerprint: "new", Payload: []byte(`{"test":1}`), RefreshStartedAt: database.Timestamptz(time.Now())}
	require.NoError(t, s.db.PublishLeaderboardHighlights(s.tenantctx(), p))
	p.ConfigurationFingerprint = "old"
	p.Payload = []byte(`{"test":0}`)
	p.RefreshStartedAt = database.Timestamptz(time.Now().Add(-time.Hour))
	require.NoError(t, s.db.PublishLeaderboardHighlights(s.tenantctx(), p))
	rows, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "new", rows[0].ConfigurationFingerprint)
}

func TestHighlightConfigurationFingerprintAndEmpty(t *testing.T) {
	t.Parallel()
	c := HighlightCohort{"Fixture raid", "Normal", 40}
	config := highlightConfig()
	before := HighlightFingerprint(config, c)
	config[2].Points = 20
	require.NotEqual(t, before, HighlightFingerprint(config, c))
	require.True(t, HighlightEmpty(emptyHighlight(c)))
}

func TestRealmHighlightsKeepTenantWideBenchmark(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	require.NoError(t, s.direct(s.compute()))
	other := uuid.New()
	s.exec(`INSERT INTO wow_server_realms(id,server_id,name) VALUES($1,$2,'Other realm')`, other, s.server)
	s.exec(`INSERT INTO leaderboard_player_observations SELECT(jsonb_populate_record(NULL::leaderboard_player_observations,to_jsonb(o)||jsonb_build_object('realm_id',$2::uuid,'run_id',gen_random_uuid(),'metric_value',200))).* FROM leaderboard_player_observations o WHERE tenant_id=$1`, s.tenant, other)
	for f := Family(0); f < familyCount; f++ {
		_, err := (&Worker{Store: s.db}).Drain(s.ctx, s.tenant, f)
		require.NoError(t, err)
	}
	preview, err := BuildHighlights(s.tenantctx(), s.db, s.tenant, s.realm, HighlightCohort{"Fixture raid", "Normal", 40}, highlightConfig())
	require.NoError(t, err)
	require.Len(t, preview.Player.Peak, 1)
	require.Equal(t, s.realm, preview.Player.Peak[0].RealmID)
	require.Equal(t, float64(50), preview.Player.Peak[0].Score)
}

func TestEmptyHighlightIsPrepared(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.exec(`DELETE FROM encounter_dps_rankings WHERE instance_id=$1`, s.instance)
	store := highlightStore{Store: s.db, config: highlightConfig()}
	c := HighlightCohort{"Fixture raid", "Normal", 40}
	before, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Empty(t, before)
	require.NoError(t, RefreshHighlights(s.tenantctx(), store, s.tenant, uuid.Nil, c))
	after, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Len(t, after, 1)
	var preview chroniclesdk.HubLandingPreview
	require.NoError(t, json.Unmarshal(after[0].Payload, &preview))
	require.True(t, HighlightEmpty(preview))
}

func TestHighlightDispatcherIncludesAllAndIndividualRealms(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	second := uuid.New()
	s.exec(`INSERT INTO wow_server_realms(id,server_id,name) VALUES($1,$2,'Second realm')`, second, s.server)
	queue := &recordingQueue{}
	d := &HighlightDispatcher{Store: highlightStore{Store: s.db, config: highlightConfig()}, Queue: queue}
	require.NoError(t, d.Work(s.ctx, &river.Job[ArgsHighlightDispatch]{Args: ArgsHighlightDispatch{TenantID: s.tenant}}))
	require.Len(t, queue.jobs, 3)
	realms := map[uuid.UUID]bool{}
	for _, job := range queue.jobs {
		args, ok := job.(ArgsHighlightRefresh)
		require.True(t, ok)
		require.Equal(t, s.tenant, args.TenantID)
		require.Equal(t, "Normal", args.Difficulty)
		require.EqualValues(t, 40, args.Size)
		realms[args.RealmID] = true
	}
	require.True(t, realms[uuid.Nil])
	require.True(t, realms[s.realm])
	require.True(t, realms[second])
}

func TestHighlightPerformanceExactVanillaCohortAndRealmID(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.exec(`UPDATE log_instances SET difficulty_name='',max_players=0 WHERE id=$1`, s.instance)
	s.exec(`UPDATE encounter_dps_rankings SET difficulty_name='',max_players=0 WHERE instance_id=$1`, s.instance)
	otherRealm := uuid.New()
	s.exec(`INSERT INTO wow_server_realms(id,server_id,name) VALUES($1,$2,'Other projection realm')`, otherRealm, s.server)
	s.exec(`INSERT INTO encounter_dps_rankings SELECT(jsonb_populate_record(NULL::encounter_dps_rankings,to_jsonb(d)||jsonb_build_object('id',gen_random_uuid(),'player_guid','OtherDifficulty','difficulty_name','Heroic','max_players',40,'dps',900))).* FROM encounter_dps_rankings d WHERE instance_id=$1`, s.instance)
	s.exec(`INSERT INTO encounter_dps_rankings SELECT(jsonb_populate_record(NULL::encounter_dps_rankings,to_jsonb(d)||jsonb_build_object('id',gen_random_uuid(),'player_guid','OtherRealm','realm_id',$2::uuid,'dps',800))).* FROM encounter_dps_rankings d WHERE instance_id=$1 AND player_guid='Player'`, s.instance, otherRealm)
	config := highlightConfig()
	config = append(config[:1], config[2:]...)
	preview, err := BuildHighlights(s.tenantctx(), s.db, s.tenant, s.realm, HighlightCohort{Instance: "Fixture raid"}, config)
	require.NoError(t, err)
	require.Len(t, preview.Performances, 1)
	require.Equal(t, "Player", preview.Performances[0].PlayerGUID)
	require.EqualValues(t, 0, preview.Performances[0].MaxPlayers)
	require.Equal(t, "", preview.Performances[0].DifficultyName)
	require.Len(t, preview.Statistics, 1)
	require.Equal(t, float64(100), preview.Statistics[0].MedianDPS)
}

type changingHighlightConfig struct {
	highlightStore
	reads int
}

func (s *changingHighlightConfig) ResolveLeaderboardConfiguration(context.Context, []string) ([]database.ResolveLeaderboardConfigurationRow, error) {
	s.reads++
	config := append([]database.ResolveLeaderboardConfigurationRow{}, s.config...)
	if s.reads > 1 {
		config[2].Points++
	}
	return config, nil
}
func TestHighlightPolicyChangeDuringRefreshCannotPublish(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	store := highlightStore{Store: s.db, config: highlightConfig()}
	cohort := HighlightCohort{"Fixture raid", "Normal", 40}
	require.NoError(t, RefreshHighlights(s.tenantctx(), store, s.tenant, uuid.Nil, cohort))
	before, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Len(t, before, 1)
	changing := &changingHighlightConfig{highlightStore: store}
	require.ErrorContains(t, RefreshHighlights(s.tenantctx(), changing, s.tenant, uuid.Nil, cohort), "configuration changed")
	after, err := s.db.ListLeaderboardHighlights(s.tenantctx(), database.ListLeaderboardHighlightsParams{TenantID: s.tenant})
	require.NoError(t, err)
	require.Equal(t, before, after)
}
