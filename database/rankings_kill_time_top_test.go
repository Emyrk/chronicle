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

// Each chosen boss gets its own fastest kills in one query; other bosses stay out.
func TestRankingsKillTimeTopPerEncounter(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Kill time server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Kill time realm"})
	require.NoError(t, err)
	killedAt := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	for i, kill := range []struct {
		boss     string
		duration float64
	}{{"Lucifron", 70}, {"Lucifron", 50}, {"Lucifron", 60}, {"Ragnaros", 200}, {"Ragnaros", 180}, {"Garr", 30}} {
		insertRankingRow(t, pool, store, realm.ID, rankingOpts{
			instanceID: uuid.New(), instanceName: "Molten Core", encounterName: kill.boss,
			playerGUID: "p", playerClass: "MAGE", playerSpec: "Fire", difficultyName: "Normal", maxPlayers: 40,
			damageDone: 1000, durationSecs: kill.duration, dps: 100, killedAt: killedAt.Add(time.Duration(i) * time.Hour), isBoss: true,
		})
	}
	rows, err := store.RankingsKillTimeTopPerEncounter(ctx, database.RankingsKillTimeTopPerEncounterParams{
		InstanceName: "Molten Core", EncounterNames: []string{"Lucifron", "Ragnaros"}, PerEncounter: 2,
	})
	require.NoError(t, err)
	got := make([]string, 0, len(rows))
	for _, row := range rows {
		got = append(got, row.EncounterName)
		require.NotEqual(t, "Garr", row.EncounterName)
	}
	require.Equal(t, []string{"Lucifron", "Lucifron", "Ragnaros", "Ragnaros"}, got)
	require.InDelta(t, 50, rows[0].DurationSecs, 1e-6)
	require.InDelta(t, 60, rows[1].DurationSecs, 1e-6)
	require.InDelta(t, 180, rows[2].DurationSecs, 1e-6)
}
