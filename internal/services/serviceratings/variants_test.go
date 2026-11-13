package serviceratings

import (
	"context"
	"github.com/jackc/pgx/v5/pgtype"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Exercise the real source projection, direct publication and fenced D2 path.
// Unknown/legacy variant rows must remain Combined, never become Normal.
func TestEncounterVariantPublicationAndInvalidation(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.times()
	sources := []*sourceFixture{s}
	variants := []any{nil, "normal", "hard"}
	values := []float64{1000, 100, 200}
	for i := 1; i < len(variants); i++ {
		next := &sourceFixture{fixture: s.fixture, instance: uuid.New(), encounter: uuid.New(), group: s.group, server: s.server}
		next.run = next.instance
		s.exec(`INSERT INTO log_instances(id,realm_id,log_group_id,name,difficulty_name,max_players,guild_id,difficulty_normalized) VALUES($1,$2,$3,'Fixture raid','Normal',40,$4,true)`, next.instance, s.realm, s.group, s.guild)
		s.exec(`INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) VALUES($1,$2,'Boss','{}',true,'2026-01-01Z','2026-01-01Z'::timestamptz+interval '10 seconds','clean')`, next.encounter, next.instance)
		s.exec(`INSERT INTO ranking_runs(run_id,representative_instance_id,realm_id,instance_name,difficulty_name,max_players,boss_coverage,member_count,source_updated_at) VALUES($1,$1,$2,'Fixture raid','Normal',40,1,1,now())`, next.run, s.realm)
		s.exec(`INSERT INTO encounter_dps_rankings(encounter_id,instance_id,encounter_name,instance_name,player_guid,player_name,player_class,player_spec,difficulty_name,max_players,realm_id,realm_name,damage_done,duration_secs,dps,hps,killed_at) VALUES($1,$2,'Boss','Fixture raid','Player','Player','MAGE','Frost','Normal',40,$3,'Projection realm',1000,10,100,25,now())`, next.encounter, next.instance, s.realm)
		next.times()
		sources = append(sources, next)
	}
	for i, source := range sources {
		s.exec(`UPDATE log_instance_encounters SET encounter_variant=$2 WHERE id=$1`, source.encounter, variants[i])
		s.exec(`UPDATE encounter_dps_rankings SET encounter_variant=$2,dps=$3 WHERE encounter_id=$1`, source.encounter, variants[i], values[i])
		rows := source.compute()
		if i == 0 {
			require.Len(t, rows, 6)
		} else {
			require.Len(t, rows, 8)
		}
		require.NoError(t, source.direct(rows))
	}
	drain := func() {
		for f := Family(0); f < familyCount; f++ {
			_, err := (&Worker{Store: s.db}).Drain(s.ctx, s.tenant, f)
			require.NoError(t, err)
		}
	}
	drain()
	var count int64
	var peak float64
	require.NoError(t, s.row(`SELECT observation_count,raw_peak FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&count, &peak))
	require.EqualValues(t, 3, count)
	require.Equal(t, 1000.0, peak)
	for i := 1; i < 3; i++ {
		require.NoError(t, s.row(`SELECT observation_count,raw_peak FROM leaderboard_variant_player_boss_subjects WHERE tenant_id=$1 AND encounter_variant=$2`, s.tenant, variants[i]).Scan(&count, &peak))
		require.EqualValues(t, 1, count)
		require.Equal(t, values[i], peak)
		require.NoError(t, s.row(`SELECT best_metric FROM leaderboard_variant_player_boss_benchmarks WHERE tenant_id=$1 AND encounter_variant=$2`, s.tenant, variants[i]).Scan(&peak))
		require.Equal(t, values[i], peak)
		require.NoError(t, s.row(`SELECT observation_count FROM leaderboard_variant_guild_boss_subjects WHERE tenant_id=$1 AND encounter_variant=$2`, s.tenant, variants[i]).Scan(&count))
		require.EqualValues(t, 1, count)
	}
	// Full-clear and per-boss speedrun publications remain the original Combined
	// observations and timing. Exact performance cohorts must not duplicate them.
	var duration int64
	require.NoError(t, s.row(`SELECT observation_count,fastest_duration_ms FROM leaderboard_guild_clear_subjects WHERE tenant_id=$1`, s.tenant).Scan(&count, &duration))
	require.EqualValues(t, 3, count)
	require.EqualValues(t, 10000, duration)
	require.NoError(t, s.row(`SELECT observation_count,fastest_duration_ms FROM leaderboard_guild_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&count, &duration))
	require.EqualValues(t, 3, count)
	require.EqualValues(t, 10000, duration)
	// Career facts are deliberately not duplicated by the extra exact cohorts.
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_career_renown_facts WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.EqualValues(t, 3, count)
	require.NoError(t, s.row(`SELECT kill_count FROM leaderboard_player_renown_counts WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.EqualValues(t, 3, count)
	// API reads use the independently published benchmark and subject statistics.
	for _, variant := range []string{"", "normal", "hard"} {
		result, err := s.db.ListLeaderboardV2(s.tenantctx(), database.ListLeaderboardV2Params{
			TenantID: s.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40,
			EncounterVariant: variant, SubjectKind: "player", BoardKind: "boss", ScoreMetric: "peak", Metric: "dps",
			Bosses: []string{"Boss"}, Awards: []float64{0}, Denominator: 1, PageSize: 50,
		})
		require.NoError(t, err)
		require.Len(t, result, 1)
		require.Equal(t, 100.0, result[0].Peak)
		want := int64(1)
		if variant == "" {
			want = 3
		}
		require.Equal(t, want, result[0].SampleCount)
		wantMastery := 30.0
		if variant == "" {
			wantMastery = 42
		}
		require.InDelta(t, wantMastery, result[0].Mastery, 0.00001)
		guildResult, err := s.db.ListLeaderboardV2(s.tenantctx(), database.ListLeaderboardV2Params{
			TenantID: s.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40,
			EncounterVariant: variant, SubjectKind: "guild", BoardKind: "boss", ScoreMetric: "peak",
			Bosses: []string{"Boss"}, Awards: []float64{0}, Denominator: 1, PageSize: 50,
		})
		require.NoError(t, err)
		require.Len(t, guildResult, 1)
		require.Equal(t, 100.0, guildResult[0].Peak)
		require.Equal(t, want, guildResult[0].SampleCount)
		details, err := s.db.ListLeaderboardV2PageBosses(s.tenantctx(), database.ListLeaderboardV2PageBossesParams{
			TenantID: s.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40,
			EncounterVariant: variant, SubjectKind: "player", Metric: "dps", Bosses: []string{"Boss"},
			Realms: []uuid.UUID{s.realm}, Subjects: []string{"Player"}, Classes: []string{"MAGE"}, Specs: []string{"Frost"}, SubSpecs: []string{""},
		})
		require.NoError(t, err)
		require.Len(t, details, 1)
		require.Equal(t, map[string]float64{"": 1000, "normal": 100, "hard": 200}[variant], details[0].RawPeak)
	}
	// Mixed selections use exact statistics for Boss and Combined for Other,
	// with a fixed two-boss denominator. There is no per-subject fallback.
	s.exec(`INSERT INTO leaderboard_player_boss_subjects(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version)
	 SELECT tenant_id,instance_name,difficulty_name,max_players,'Other',player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak/2,raw_form,raw_floor,projection_version,algorithm_version FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, s.tenant)
	s.exec(`INSERT INTO leaderboard_player_boss_benchmarks(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,best_metric,projection_version,algorithm_version)
	 SELECT tenant_id,instance_name,difficulty_name,max_players,'Other',player_class,player_spec,player_sub_spec,metric,best_metric,projection_version,algorithm_version FROM leaderboard_player_boss_benchmarks WHERE tenant_id=$1`, s.tenant)
	mixed, err := s.db.ListLeaderboardV2(s.tenantctx(), database.ListLeaderboardV2Params{
		TenantID: s.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40,
		EncounterVariants: []byte(`{"Boss":"hard"}`), SubjectKind: "player", BoardKind: "boss", ScoreMetric: "peak", Metric: "dps",
		Bosses: []string{"Boss", "Other"}, Awards: []float64{10, 20}, Denominator: 2, PageSize: 50,
	})
	require.NoError(t, err)
	require.Len(t, mixed, 1)
	require.Equal(t, 75.0, mixed[0].Peak)
	require.EqualValues(t, 4, mixed[0].SampleCount)
	// Renown is the original base-boss aggregate, not a new hard-mode scale.
	for _, subject := range []string{"player", "guild"} {
		for _, variants := range []string{`{}`, `{"Boss":"normal"}`, `{"Boss":"hard"}`} {
			result, err := s.db.ListLeaderboardV2(s.tenantctx(), database.ListLeaderboardV2Params{
				TenantID: s.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40,
				EncounterVariants: []byte(variants), SubjectKind: subject, BoardKind: "renown", ScoreMetric: "renown",
				Bosses: []string{"Boss"}, Awards: []float64{10}, Denominator: 1, PageSize: 50,
			})
			require.NoError(t, err)
			require.Len(t, result, 1)
			require.Equal(t, 30.0, result[0].Renown)
			require.EqualValues(t, 3, result[0].SampleCount)
		}
	}
	// Relabeling a run removes old exact evidence and invalidates both old/new keys.
	normal := sources[1]
	s.exec(`UPDATE log_instance_encounters SET encounter_variant='hard' WHERE id=$1`, normal.encounter)
	s.exec(`UPDATE encounter_dps_rankings SET encounter_variant='hard' WHERE encounter_id=$1`, normal.encounter)
	require.NoError(t, normal.direct(normal.compute()))
	drain()
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_variant_player_boss_subjects WHERE tenant_id=$1 AND encounter_variant='normal'`, s.tenant).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, s.row(`SELECT observation_count FROM leaderboard_variant_player_boss_subjects WHERE tenant_id=$1 AND encounter_variant='hard'`, s.tenant).Scan(&count))
	require.EqualValues(t, 2, count)
	missing, err := s.db.ListLeaderboardV2(s.tenantctx(), database.ListLeaderboardV2Params{
		TenantID: s.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40,
		EncounterVariants: []byte(`{"Boss":"normal"}`), SubjectKind: "player", BoardKind: "boss", ScoreMetric: "peak", Metric: "dps",
		Bosses: []string{"Boss", "Other"}, Denominator: 2, PageSize: 50,
	})
	require.NoError(t, err)
	require.Len(t, missing, 1)
	require.Equal(t, 25.0, missing[0].Peak, "missing exact Boss stays zero, not Combined")
	// Source removal uses the same atomic old-key invalidation as Combined.
	require.NoError(t, normal.direct(nil))
	drain()
	require.NoError(t, s.row(`SELECT observation_count FROM leaderboard_variant_player_boss_subjects WHERE tenant_id=$1 AND encounter_variant='hard'`, s.tenant).Scan(&count))
	require.EqualValues(t, 1, count)
}

func (f *fixture) claimVariantPlayer() database.LeaderboardVariantDirtyPlayerBossSubject {
	f.t.Helper()
	rows, err := f.db.ClaimLeaderboardVariantPlayerBossSubject(f.tenantctx(), database.ClaimLeaderboardVariantPlayerBossSubjectParams{TenantID: f.tenant, LimitCount: 100})
	require.NoError(f.t, err)
	require.Len(f.t, rows, 1)
	return rows[0]
}
func variantPlayerPublish(c database.LeaderboardVariantDirtyPlayerBossSubject, value float64, has bool) database.PublishLeaderboardVariantPlayerBossSubjectParams {
	return database.PublishLeaderboardVariantPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64, HasEvidence: has, ObservationCount: 1, RawPeak: value, RawForm: 0, RawFloor: 0, ProjectionVersion: 1, AlgorithmVersion: 1}
}
func (f *fixture) publishVariant(p database.PublishLeaderboardVariantPlayerBossSubjectParams) error {
	return f.db.InTx(f.tenantctx(), func(tx database.Store) error {
		return consumePublished(context.Background(), tx.PublishLeaderboardVariantPlayerBossSubject(f.tenantctx(), []database.PublishLeaderboardVariantPlayerBossSubjectParams{p}))
	}, nil)
}

func TestVariantOwnershipFenceAndNewerDirt(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	f.evidence("Boss")
	f.enqueue(FamilyVariantPlayerBossSubject, "Boss", time.Now().Add(-time.Minute))
	clock, err := f.db.LeaderboardD2Clock(f.tenantctx())
	require.NoError(t, err)
	old := f.claimVariantPlayer()
	afterClaim, err := f.db.LeaderboardD2Clock(f.tenantctx())
	require.NoError(t, err)
	require.False(t, old.LockedUntil.Time.Before(clock.Time.Add(ClaimLease)))
	require.False(t, old.LockedUntil.Time.After(afterClaim.Time.Add(ClaimLease)))
	// A second consumer cannot own an unexpired claim.
	rows, err := f.db.ClaimLeaderboardVariantPlayerBossSubject(f.tenantctx(), database.ClaimLeaderboardVariantPlayerBossSubjectParams{TenantID: f.tenant, LimitCount: 100})
	require.NoError(t, err)
	require.Empty(t, rows)
	f.enqueue(FamilyVariantPlayerBossSubject, "Boss", time.Now())
	require.NoError(t, f.publishVariant(variantPlayerPublish(old, 100, true)))
	var token uuid.NullUUID
	var revision int64
	var until pgtype.Timestamptz
	require.NoError(t, f.row(`SELECT claim_token,revision,locked_until FROM leaderboard_variant_dirty_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&token, &revision, &until))
	require.False(t, token.Valid)
	require.False(t, until.Valid)
	require.Equal(t, int64(2), revision)
	// Useful claimed snapshot published despite newer dirt, with a fresh owner next.
	next := f.claimVariantPlayer()
	require.NotEqual(t, old.ClaimToken, next.ClaimToken)
	require.NoError(t, f.publishVariant(variantPlayerPublish(next, 200, true)))
	require.NoError(t, f.publishVariant(variantPlayerPublish(old, 999, true)))
	require.NoError(t, f.publishVariant(variantPlayerPublish(old, 0, false)))
	var peak float64
	require.NoError(t, f.row(`SELECT raw_peak FROM leaderboard_variant_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 200.0, peak)
	var count int
	require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_variant_dirty_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Zero(t, count)
}

func TestVariantExpiredOwnerAndTakeover(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	f.evidence("Boss")
	f.enqueue(FamilyVariantPlayerBossSubject, "Boss", time.Now().Add(-time.Minute))
	old := f.claimVariantPlayer()
	f.exec(`UPDATE leaderboard_variant_dirty_player_boss_subjects SET locked_until=clock_timestamp()-interval '1 second' WHERE tenant_id=$1`, f.tenant)
	require.NoError(t, f.publishVariant(variantPlayerPublish(old, 999, true)))
	var count int
	require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_variant_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Zero(t, count)
	next := f.claimVariantPlayer()
	require.NotEqual(t, old.ClaimToken, next.ClaimToken)
	require.NoError(t, f.publishVariant(variantPlayerPublish(next, 200, true)))
	require.NoError(t, f.publishVariant(variantPlayerPublish(old, 999, true)))
	require.NoError(t, f.publishVariant(variantPlayerPublish(old, 0, false)))
	var peak float64
	require.NoError(t, f.row(`SELECT raw_peak FROM leaderboard_variant_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 200.0, peak)
}

func TestEncounterVariantProjectionRequiresConsistentSource(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.exec(`UPDATE log_instance_encounters SET encounter_variant='hard' WHERE id=$1`, s.encounter)
	for _, rankingVariant := range []any{nil, "normal", "hard"} {
		s.exec(`UPDATE encounter_dps_rankings SET encounter_variant=$2 WHERE encounter_id=$1`, s.encounter, rankingVariant)
		rows := s.compute()
		combined, exact, career := 0, 0, 0
		for _, r := range rows {
			switch r.Kind {
			case 1:
				combined++
			case 6:
				career++
			case 7:
				exact++
				require.Equal(t, "hard", r.EncounterVariant)
			}
		}
		require.Equal(t, 1, combined, "variant disagreement must not change Combined eligibility")
		require.Equal(t, 1, career, "variant disagreement must not change career eligibility")
		if rankingVariant == "hard" {
			require.Equal(t, 1, exact)
		} else {
			require.Zero(t, exact)
		}
	}
}
