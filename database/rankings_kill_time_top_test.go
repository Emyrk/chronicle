package database_test

import (
	"encoding/json"
	"github.com/jackc/pgx/v5/pgtype"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

// Each chosen boss gets its guilds' fastest kills in one query: a guild ranks once
// per boss, guildless kills and other bosses stay out.
func TestRankingsKillTimeTopPerEncounter(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Kill time server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Kill time realm"})
	require.NoError(t, err)
	guilds := map[string]uuid.UUID{}
	for _, name := range []string{"Alpha", "Bravo"} {
		guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm.ID, Name: name, CreatedAt: database.Timestamptz(time.Now())})
		require.NoError(t, err)
		guilds[name] = guild.ID
	}
	killedAt := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	for i, kill := range []struct {
		boss     string
		guild    string
		duration float64
	}{
		{"Lucifron", "Alpha", 70}, {"Lucifron", "Alpha", 50}, {"Lucifron", "Bravo", 60}, {"Lucifron", "", 40},
		{"Ragnaros", "Alpha", 200}, {"Ragnaros", "Bravo", 180},
		{"Garr", "Alpha", 30},
	} {
		instanceID := uuid.New()
		insertRankingRow(t, pool, store, realm.ID, rankingOpts{
			instanceID: instanceID, instanceName: "Molten Core", encounterName: kill.boss,
			playerGUID: "p", playerClass: "MAGE", playerSpec: "Fire", difficultyName: "Normal", maxPlayers: 40,
			damageDone: 1000, durationSecs: kill.duration, dps: 100, killedAt: killedAt.Add(time.Duration(i) * time.Hour), isBoss: true,
		})
		if kill.guild != "" {
			_, err := pool.Exec(ctx, `UPDATE log_instances SET guild_id = $1 WHERE id = $2`, guilds[kill.guild], instanceID)
			require.NoError(t, err)
		}
	}
	rows, err := store.RankingsKillTimeTopPerEncounter(ctx, database.RankingsKillTimeTopPerEncounterParams{
		InstanceName: "Molten Core", EncounterNames: []string{"Lucifron", "Ragnaros"}, PerEncounter: 3,
	})
	require.NoError(t, err)
	got := make([]string, 0, len(rows))
	for _, row := range rows {
		got = append(got, row.EncounterName+" "+row.GuildName)
	}
	require.Equal(t, []string{"Lucifron Alpha", "Lucifron Bravo", "Ragnaros Bravo", "Ragnaros Alpha"}, got)
	require.InDelta(t, 50, rows[0].DurationSecs, 1e-6)
	require.InDelta(t, 60, rows[1].DurationSecs, 1e-6)
	require.InDelta(t, 180, rows[2].DurationSecs, 1e-6)
	require.InDelta(t, 200, rows[3].DurationSecs, 1e-6)
}

func TestRankingsKillTimesExcludeInvalidatedData(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Invalidation server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Invalidation realm"})
	require.NoError(t, err)
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm.ID, Name: "Valid Guild", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)

	validInstance := uuid.New()
	invalidEncounterInstance := uuid.New()
	invalidInstance := uuid.New()
	for i, kill := range []struct {
		instanceID uuid.UUID
		duration   float64
	}{
		{validInstance, 60},
		{invalidEncounterInstance, 40},
		{invalidInstance, 50},
	} {
		insertRankingRow(t, pool, store, realm.ID, rankingOpts{
			instanceID: kill.instanceID, instanceName: "Molten Core", encounterName: "Lucifron",
			playerGUID: "p", playerClass: "MAGE", playerSpec: "Fire", difficultyName: "Normal", maxPlayers: 40,
			damageDone: 1000, durationSecs: kill.duration, dps: 100,
			killedAt: time.Date(2026, 10, 5, 12+i, 0, 0, 0, time.UTC), isBoss: true,
		})
		_, err = pool.Exec(ctx, `UPDATE log_instances SET guild_id = $1 WHERE id = $2`, guild.ID, kill.instanceID)
		require.NoError(t, err)
	}

	_, err = pool.Exec(ctx, `UPDATE log_instance_encounters SET invalidated_at = now() WHERE instance_id = $1`, invalidEncounterInstance)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE log_instances SET invalidated_at = now() WHERE id = $1`, invalidInstance)
	require.NoError(t, err)

	leaders, err := store.RankingsKillTimeLeaderboard(ctx, database.RankingsKillTimeLeaderboardParams{
		InstanceName: "Molten Core", EncounterName: "Lucifron", QueryLimit: 10,
	})
	require.NoError(t, err)
	require.Len(t, leaders, 1)
	require.Equal(t, validInstance, leaders[0].InstanceID)
	require.InDelta(t, 60, leaders[0].DurationSecs, 1e-6)

	top, err := store.RankingsKillTimeTopPerEncounter(ctx, database.RankingsKillTimeTopPerEncounterParams{
		InstanceName: "Molten Core", EncounterNames: []string{"Lucifron"}, PerEncounter: 10,
	})
	require.NoError(t, err)
	require.Len(t, top, 1)
	require.Equal(t, validInstance, top[0].InstanceID)

	stats, err := store.RankingsKillTimeStats(ctx, database.RankingsKillTimeStatsParams{InstanceName: "Molten Core"})
	require.NoError(t, err)
	require.Len(t, stats, 1)
	require.EqualValues(t, 1, stats[0].Count)
	require.InDelta(t, 60, stats[0].MinSecs, 1e-6)
	require.InDelta(t, 60, stats[0].MedianSecs, 1e-6)
}

// Ranking offsets change Razorgore's scored duration, never its actual kill time
// or any other boss's timing policy. Exercise every kill-time query together.
func TestRazorgoreRankedKillTimes(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name       string
		boss       string
		start, end pgtype.Int8
		wantMS     int64
	}{
		{"phase two", "Razorgore the Untamed", pgtype.Int8{Int64: 240000, Valid: true}, pgtype.Int8{Int64: 300125, Valid: true}, 60125},
		{"legacy", "Razorgore the Untamed", pgtype.Int8{}, pgtype.Int8{}, 360000},
		{"missing end", "Razorgore the Untamed", pgtype.Int8{Int64: 240000, Valid: true}, pgtype.Int8{}, 360000},
		{"missing start", "Razorgore the Untamed", pgtype.Int8{}, pgtype.Int8{Int64: 300125, Valid: true}, 360000},
		{"empty window", "Razorgore the Untamed", pgtype.Int8{Int64: 240000, Valid: true}, pgtype.Int8{Int64: 240000, Valid: true}, 360000},
		{"negative start", "Razorgore the Untamed", pgtype.Int8{Int64: -1, Valid: true}, pgtype.Int8{Int64: 300125, Valid: true}, 360000},
		{"other boss", "Nefarian", pgtype.Int8{Int64: 240000, Valid: true}, pgtype.Int8{Int64: 300125, Valid: true}, 360000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			pool, store, realmID := setupParsesTest(t)
			ctx := testutil.Context(t, testutil.WaitMedium)
			killedAt := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
			startedAt := killedAt.Add(-6 * time.Minute)
			instanceID := uuid.New()
			insertRankingRow(t, pool, store, realmID, rankingOpts{
				instanceID: instanceID, instanceName: "Blackwing Lair", encounterName: tc.boss,
				playerGUID: "p", playerClass: "MAGE", playerSpec: "Fire",
				durationSecs: 360, killedAt: killedAt, isBoss: true,
			})
			guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Timing Guild", CreatedAt: database.Timestamptz(startedAt)})
			require.NoError(t, err)
			_, err = pool.Exec(ctx, `UPDATE log_instances SET guild_id = $1, start_time = $2, end_time = $3 WHERE id = $4`, guild.ID, startedAt, killedAt, instanceID)
			require.NoError(t, err)
			_, err = pool.Exec(ctx, `UPDATE log_instance_encounters SET ranking_start_offset_ms = $1, ranking_end_offset_ms = $2 WHERE instance_id = $3`, tc.start, tc.end, instanceID)
			require.NoError(t, err)

			kills, err := store.GetInstanceEncounterKillTimes(ctx, instanceID)
			require.NoError(t, err)
			require.Len(t, kills, 1)
			require.Equal(t, tc.wantMS, kills[0].DurationMs)
			clean, err := store.GetInstanceCleanEncounterKillTimes(ctx, instanceID)
			require.NoError(t, err)
			require.Len(t, clean, 1)
			require.Equal(t, tc.wantMS, clean[0].DurationMs)

			require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
				InstanceID: instanceID, InstanceName: "Blackwing Lair", RealmID: realmID,
				StartTime: database.Timestamptz(startedAt), CompletionTime: database.Timestamptz(killedAt),
				DurationMs: 360000, Proof: []byte(`{"proof":[]}`),
			}))
			cohort, err := store.InstanceSpeedrunCohort(ctx, database.InstanceSpeedrunCohortParams{InstanceID: instanceID, LookbackDays: 60, Scope: "server", MetricsVersion: 1})
			require.NoError(t, err)
			require.Len(t, cohort, 1)
			var cohortKills []struct {
				DurationMS int64 `json:"duration_ms"`
			}
			require.NoError(t, json.Unmarshal([]byte(cohort[0].EncounterKillTimesJson), &cohortKills))
			require.Len(t, cohortKills, 1)
			require.Equal(t, tc.wantMS, cohortKills[0].DurationMS)

			var logGroupID uuid.UUID
			require.NoError(t, pool.QueryRow(ctx, `SELECT log_group_id FROM log_instances WHERE id = $1`, instanceID).Scan(&logGroupID))
			_, err = store.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
				LogGroupID: logGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
			})
			require.NoError(t, err)
			memberships, err := store.ListTimeParseBossKillMemberships(ctx, database.ListTimeParseBossKillMembershipsParams{
				TenantID: uuid.Nil, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
			})
			require.NoError(t, err)
			require.Len(t, memberships, 1)
			require.Equal(t, tc.wantMS, memberships[0].DurationMs)
			require.True(t, memberships[0].KilledAt.Time.Equal(killedAt))
			guildKills, err := store.GuildSpeedrunBossKills(ctx, database.GuildSpeedrunBossKillsParams{InstanceIds: []uuid.UUID{instanceID}})
			require.NoError(t, err)
			require.Len(t, guildKills, 1)
			require.Equal(t, tc.wantMS, guildKills[0].DurationMs)
			require.True(t, guildKills[0].KilledAt.Time.Equal(killedAt))

			leaders, err := store.RankingsKillTimeLeaderboard(ctx, database.RankingsKillTimeLeaderboardParams{InstanceName: "Blackwing Lair", QueryLimit: 10})
			require.NoError(t, err)
			require.Len(t, leaders, 1)
			require.InDelta(t, float64(tc.wantMS)/1000, leaders[0].DurationSecs, 1e-6)
			require.True(t, leaders[0].KilledAt.Time.Equal(killedAt))
			top, err := store.RankingsKillTimeTopPerEncounter(ctx, database.RankingsKillTimeTopPerEncounterParams{InstanceName: "Blackwing Lair", EncounterNames: []string{tc.boss}, PerEncounter: 10})
			require.NoError(t, err)
			require.Len(t, top, 1)
			require.InDelta(t, float64(tc.wantMS)/1000, top[0].DurationSecs, 1e-6)
			require.True(t, top[0].KilledAt.Time.Equal(killedAt))
			stats, err := store.RankingsKillTimeStats(ctx, database.RankingsKillTimeStatsParams{InstanceName: "Blackwing Lair"})
			require.NoError(t, err)
			require.Len(t, stats, 1)
			require.InDelta(t, float64(tc.wantMS)/1000, stats[0].MinSecs, 1e-6)
			require.InDelta(t, float64(tc.wantMS)/1000, stats[0].MedianSecs, 1e-6)
			if tc.name == "phase two" {
				// A shorter full encounter with a slower phase two must not win
				// membership selection over the original 60.125-second phase two.
				_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
					ID: uuid.New(), InstanceID: instanceID, Name: tc.boss, Boss: true,
					KillType: database.KillTypeClean, Remaining: guid.GUIDs{},
					StartTime: database.Timestamptz(killedAt.Add(time.Minute)), EndTime: database.Timestamptz(killedAt.Add(3 * time.Minute)),
					RankingStartOffsetMs: pgtype.Int8{Int64: 30000, Valid: true}, RankingEndOffsetMs: pgtype.Int8{Int64: 120000, Valid: true},
				})
				require.NoError(t, err)
				_, err = store.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
					LogGroupID: logGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
				})
				require.NoError(t, err)
				memberships, err = store.ListTimeParseBossKillMemberships(ctx, database.ListTimeParseBossKillMembershipsParams{
					TenantID: uuid.Nil, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
				})
				require.NoError(t, err)
				require.Len(t, memberships, 1)
				require.Equal(t, tc.wantMS, memberships[0].DurationMs)
				require.True(t, memberships[0].KilledAt.Time.Equal(killedAt))
			}

		})
	}
}
