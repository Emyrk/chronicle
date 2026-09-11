package database_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fastLeaderboardPlayer struct {
	guid, name, class, spec, subSpec, role string
	damage, healing, absorbed              int64
}

func insertFastLeaderboardRun(t *testing.T, store database.Store, realmID uuid.UUID, instanceName, difficulty string, maxPlayers int16, encounters []string, players []fastLeaderboardPlayer, multiplier int64, killedAt time.Time) uuid.UUID {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitMedium)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "fast-" + userID.String()[:8]})
	require.NoError(t, err)
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(killedAt), UpdatedAt: database.Timestamptz(killedAt),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID, Name: instanceName,
		StartTime: database.Timestamptz(killedAt.Add(-time.Hour)), Capabilities: []string{},
		DifficultyName: difficulty, MaxPlayers: int32(maxPlayers),
	})
	require.NoError(t, err)

	for encounterIndex, encounterName := range encounters {
		encounterID := uuid.New()
		encounterKilledAt := killedAt.Add(time.Duration(encounterIndex) * time.Minute)
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encounterID, InstanceID: instanceID, Name: encounterName,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(encounterKilledAt.Add(-10 * time.Second)),
			EndTime:   database.Timestamptz(encounterKilledAt),
		})
		require.NoError(t, err)
		for _, player := range players {
			damage := player.damage * multiplier
			healing := player.healing * multiplier
			absorbed := player.absorbed * multiplier
			require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
				EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true}, InstanceID: instanceID,
				EncounterName: encounterName, InstanceName: instanceName,
				PlayerGuid: player.guid, PlayerName: player.name, PlayerClass: player.class,
				PlayerSpec: player.spec, PlayerSubSpec: player.subSpec, PlayerRole: player.role, PlayerLevel: 60,
				DifficultyName: difficulty, MaxPlayers: maxPlayers, RealmID: realmID, RealmName: "realm-" + realmID.String()[:8],
				GuildName: "Fast Guild", DamageDone: damage, HealingDone: healing, AbsorbedDone: absorbed,
				DurationSecs: 10, Dps: float64(damage) / 10, Hps: float64(healing+absorbed) / 10,
				LogHashedSlug: instanceID.String(), KilledAt: database.Timestamptz(encounterKilledAt),
			}))
		}
	}
	return instanceID
}

func installTenantPoolHooks(t *testing.T) {
	t.Helper()
	previousPrepare := database.PrepareConnFunc
	previousReset := database.ResetConnFunc
	database.PrepareConnFunc = servicetenant.PrepareConn
	database.ResetConnFunc = servicetenant.ResetConn
	t.Cleanup(func() {
		database.PrepareConnFunc = previousPrepare
		database.ResetConnFunc = previousReset
	})
}

func TestRankingsLeaderboardFastEquivalentAndEligibility(t *testing.T) {
	installTenantPoolHooks(t)
	pool, store, realmOne := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	adminCtx := servicetenant.AdminBypass(ctx)

	serverTwo := uuid.New()
	realmTwo := uuid.New()
	_, err := pool.Exec(adminCtx, "INSERT INTO wow_servers (id, name) VALUES ($1, 'fast-server-two')", serverTwo)
	require.NoError(t, err)
	_, err = pool.Exec(adminCtx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmTwo, serverTwo, "realm-"+realmTwo.String()[:8])
	require.NoError(t, err)

	players := []fastLeaderboardPlayer{
		{guid: "P-MAGE", name: "Mage", class: "MAGE", spec: "Frost", subSpec: "Winter", role: "dps", damage: 1000, healing: 10},
		{guid: "P-PRIEST", name: "Priest", class: "PRIEST", spec: "Holy", subSpec: "Disc", role: "heal", damage: 100, healing: 800, absorbed: 200},
		{guid: "P-UNKNOWN", name: "Unknown", class: "Unknown", spec: "Unknown", role: "dps", damage: 500},
	}
	baseTime := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	runOne := insertFastLeaderboardRun(t, store, realmOne, "Molten Core", "Raid", 40, []string{"Lucifron", "Ragnaros"}, players, 1, baseTime)
	insertFastLeaderboardRun(t, store, realmOne, "Molten Core", "Raid", 40, []string{"Lucifron", "Ragnaros"}, players, 2, baseTime.Add(time.Hour))
	insertFastLeaderboardRun(t, store, realmTwo, "Molten Core", "Raid", 40, []string{"Lucifron", "Server Boss"}, players, 3, baseTime.Add(2*time.Hour))

	worker := &servicerankings.WorkerRebuildRankingRunSummaries{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[rankingargs.ArgsRebuildRankingRunSummaries]{}))

	base := database.RankingsLeaderboardSlowParams{
		Metric: "dps", InstanceNames: []string{"Molten Core"},
		EncounterNames: []string{"Lucifron", "Ragnaros", "Server Boss"},
		QueryLimit:     50,
	}
	fastParams := func(p database.RankingsLeaderboardSlowParams) database.RankingsLeaderboardFastParams {
		return database.RankingsLeaderboardFastParams{
			Metric: p.Metric, QueryOffset: p.QueryOffset, QueryLimit: p.QueryLimit,
			SummaryVersion: servicerankings.RankingPlayerRunSummaryVersion(),
			InstanceNames:  p.InstanceNames, RealmNames: p.RealmNames, DifficultyNames: p.DifficultyNames,
			FilterMaxPlayers: p.FilterMaxPlayers, Class: p.Class, Spec: p.Spec,
			SubSpec: p.SubSpec, Role: p.Role, HideUnknowns: p.HideUnknowns,
		}
	}
	assertEquivalent := func(name string, p database.RankingsLeaderboardSlowParams) {
		t.Helper()
		t.Run(name, func(t *testing.T) {
			slow, err := store.RankingsLeaderboardSlow(adminCtx, p)
			require.NoError(t, err)
			fast, err := store.RankingsLeaderboardFast(adminCtx, fastParams(p))
			require.NoError(t, err)
			require.Len(t, fast, len(slow))
			for i := range slow {
				assert.Equal(t, slow[i].PlayerGuid, fast[i].PlayerGuid)
				assert.Equal(t, slow[i].LogHashedSlug, fast[i].LogHashedSlug)
				assert.Equal(t, slow[i].DamageDone, fast[i].DamageDone)
				assert.Equal(t, slow[i].HealingDone, fast[i].HealingDone)
				assert.Equal(t, slow[i].AbsorbedDone, fast[i].AbsorbedDone)
				assert.Equal(t, slow[i].DurationSecs, fast[i].DurationSecs)
				assert.Equal(t, slow[i].Dps, fast[i].Dps)
				assert.Equal(t, slow[i].Hps, fast[i].Hps)
				assert.Equal(t, slow[i].TotalCount, fast[i].TotalCount)
			}
		})
	}

	rootRows, err := store.RankingsLeaderboardFast(ctx, fastParams(base))
	require.NoError(t, err)
	require.Len(t, rootRows, 3, "root context must retain RLS visibility without filtering tenant_id to NULL")

	assertEquivalent("dps", base)
	hps := base
	hps.Metric = "hps"
	assertEquivalent("hps", hps)
	for name, mutate := range map[string]func(*database.RankingsLeaderboardSlowParams){
		"class":         func(p *database.RankingsLeaderboardSlowParams) { p.Class = "MAGE" },
		"spec":          func(p *database.RankingsLeaderboardSlowParams) { p.Spec = "Holy" },
		"sub_spec":      func(p *database.RankingsLeaderboardSlowParams) { p.SubSpec = "Winter" },
		"role":          func(p *database.RankingsLeaderboardSlowParams) { p.Role = "heal" },
		"hide_unknowns": func(p *database.RankingsLeaderboardSlowParams) { p.HideUnknowns = true },
		"difficulty":    func(p *database.RankingsLeaderboardSlowParams) { p.DifficultyNames = []string{"Raid"} },
		"max_players":   func(p *database.RankingsLeaderboardSlowParams) { p.FilterMaxPlayers = 40 },
		"realm": func(p *database.RankingsLeaderboardSlowParams) {
			p.RealmNames = []string{"realm-" + realmOne.String()[:8]}
		},
		"pagination": func(p *database.RankingsLeaderboardSlowParams) { p.QueryLimit = 1; p.QueryOffset = 1 },
	} {
		p := base
		mutate(&p)
		assertEquivalent(name, p)
	}

	eligibilityParams := database.RankingsLeaderboardFastEligibilityParams{
		SummaryVersion: servicerankings.RankingPlayerRunSummaryVersion(),
		InstanceNames:  base.InstanceNames, EncounterNames: base.EncounterNames,
	}
	eligibility, err := store.RankingsLeaderboardFastEligibility(adminCtx, eligibilityParams)
	require.NoError(t, err)
	assert.True(t, eligibility.EncountersMatch)
	assert.Zero(t, eligibility.MissingRunCount)
	assert.Zero(t, eligibility.StaleRunCount)
	assert.Zero(t, eligibility.DirtyRunCount)
	assert.Zero(t, eligibility.NonstandardRunCount)

	subset := eligibilityParams
	subset.EncounterNames = []string{"Lucifron"}
	subsetStatus, err := store.RankingsLeaderboardFastEligibility(adminCtx, subset)
	require.NoError(t, err)
	assert.False(t, subsetStatus.EncountersMatch)

	_, err = pool.Exec(adminCtx, "DELETE FROM ranking_runs WHERE run_id = $1", runOne)
	require.NoError(t, err)
	missing, err := store.RankingsLeaderboardFastEligibility(adminCtx, eligibilityParams)
	require.NoError(t, err)
	assert.Equal(t, int64(1), missing.MissingRunCount)
}

func TestRankingsLeaderboardFastEligibilityDetectsStaleDirtyAndTenantPruning(t *testing.T) {
	installTenantPoolHooks(t)
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	adminCtx := servicetenant.AdminBypass(ctx)
	tenantID := uuid.New()
	setRealmTenant(t, pool, realmID, tenantID)
	runID := insertFastLeaderboardRun(t, store, realmID, "Molten Core", "Raid", 40, []string{"Lucifron"}, []fastLeaderboardPlayer{{
		guid: "P-TENANT", name: "Tenant", class: "MAGE", spec: "Frost", subSpec: "Winter", role: "dps", damage: 1000,
	}}, 1, time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC))
	worker := &servicerankings.WorkerRebuildRankingRunSummaries{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[rankingargs.ArgsRebuildRankingRunSummaries]{}))

	var sourceTenantID, summaryTenantID uuid.NullUUID
	require.NoError(t, pool.QueryRow(adminCtx, `
		SELECT ws.tenant_id
		FROM encounter_dps_rankings edr
		JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
		JOIN wow_servers ws ON ws.id = wsr.server_id
		WHERE edr.instance_id = $1 LIMIT 1
	`, runID).Scan(&sourceTenantID))
	require.NoError(t, pool.QueryRow(adminCtx, "SELECT tenant_id FROM ranking_runs WHERE run_id = $1", runID).Scan(&summaryTenantID))
	require.Equal(t, uuid.NullUUID{UUID: tenantID, Valid: true}, sourceTenantID)
	require.Equal(t, sourceTenantID, summaryTenantID)

	var explicitlyFilteredSourceCount int64
	require.NoError(t, pool.QueryRow(adminCtx, `
		SELECT COUNT(DISTINCT COALESCE(li.duplicate_group_id, li.id))
		FROM encounter_dps_rankings edr
		JOIN log_instances li ON li.id = edr.instance_id
		JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
		JOIN wow_servers ws ON ws.id = wsr.server_id
		WHERE ws.tenant_id = $1 AND edr.instance_name = 'Molten Core'
	`, tenantID).Scan(&explicitlyFilteredSourceCount))
	require.Equal(t, int64(1), explicitlyFilteredSourceCount)

	params := database.RankingsLeaderboardFastEligibilityParams{
		SummaryVersion: servicerankings.RankingPlayerRunSummaryVersion(), FilterTenant: true,
		TenantID: tenantID, InstanceNames: []string{"Molten Core"}, EncounterNames: []string{"Lucifron"},
	}
	status, err := store.RankingsLeaderboardFastEligibility(adminCtx, params)
	require.NoError(t, err)
	assert.Equal(t, int64(1), status.SourceRunCount)
	assert.True(t, status.EncountersMatch)

	otherTenant := params
	otherTenant.TenantID = uuid.New()
	other, err := store.RankingsLeaderboardFastEligibility(adminCtx, otherTenant)
	require.NoError(t, err)
	assert.Zero(t, other.SourceRunCount)
	assert.True(t, other.EncountersMatch)

	tenantRows, err := store.RankingsLeaderboardFast(adminCtx, database.RankingsLeaderboardFastParams{
		Metric: "dps", QueryLimit: 10, FilterTenant: true, TenantID: tenantID,
		SummaryVersion: servicerankings.RankingPlayerRunSummaryVersion(), InstanceNames: []string{"Molten Core"},
	})
	require.NoError(t, err)
	require.Len(t, tenantRows, 1)
	assert.Equal(t, "P-TENANT", tenantRows[0].PlayerGuid)
	otherRows, err := store.RankingsLeaderboardFast(adminCtx, database.RankingsLeaderboardFastParams{
		Metric: "dps", QueryLimit: 10, FilterTenant: true, TenantID: otherTenant.TenantID,
		SummaryVersion: servicerankings.RankingPlayerRunSummaryVersion(), InstanceNames: []string{"Molten Core"},
	})
	require.NoError(t, err)
	assert.Empty(t, otherRows)

	_, err = pool.Exec(adminCtx, "UPDATE ranking_runs SET summary_version = 0 WHERE run_id = $1", runID)
	require.NoError(t, err)
	stale, err := store.RankingsLeaderboardFastEligibility(adminCtx, params)
	require.NoError(t, err)
	assert.Equal(t, int64(1), stale.StaleRunCount)

	_, err = pool.Exec(adminCtx, "UPDATE ranking_runs SET summary_version = $2 WHERE run_id = $1", runID, servicerankings.RankingPlayerRunSummaryVersion())
	require.NoError(t, err)
	_, err = pool.Exec(adminCtx, `INSERT INTO ranking_run_summary_dirty (run_id, generation, last_transaction_id)
		VALUES ($1, 1, pg_current_xact_id()) ON CONFLICT (run_id) DO UPDATE SET generation = ranking_run_summary_dirty.generation + 1`, runID)
	require.NoError(t, err)
	dirty, err := store.RankingsLeaderboardFastEligibility(adminCtx, params)
	require.NoError(t, err)
	assert.Equal(t, int64(1), dirty.DirtyRunCount)
}
