package database_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
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
