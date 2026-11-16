package servicestats

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

var leadDate = time.Date(2026, 12, 10, 4, 0, 0, 0, time.UTC)

func TestHubLead(t *testing.T) {
	t.Parallel()
	forever := hubPayload{
		RecentDays: 30, WindowDays: 180,
		Recent: hubCounts{Raids: 2318, Dungeons: 410, Logs: 1900, Players: 7807},
		Window: hubCounts{Raids: 2318, Dungeons: 3000, Logs: 4100, Players: 9100},
		Instances: []hubInstance{
			{Name: "Molten Core", Category: "raid", RunsRecent: 900, Runs: 900},
			{Name: "Naxxramas", Category: "raid", RunsRecent: 1418, Runs: 1418},
			{Name: "Ragefire Chasm", Category: "dungeon", RunsRecent: 3000, Runs: 3000},
		},
	}
	octo := hubPayload{
		RecentDays: 30, WindowDays: 180,
		Recent: hubCounts{Raids: 1, Dungeons: 12, Logs: 9, Players: 1},
		Window: hubCounts{Raids: 60, Dungeons: 80, Logs: 120, Players: 410},
		Instances: []hubInstance{
			{Name: "Lower Tower of Karazhan", Category: "raid", RunsRecent: 1, Runs: 60},
		},
	}

	foreverLead := hubLead("WoW Forever", leadDate, forever)
	require.Equal(t, "As of 2026-12-10, uploaded logs show 2,318 raids and 410 dungeon runs on WoW Forever in the last 30 days, "+
		"from 1,900 logs, with 7,807 players seen in them. The most-run raid in those logs is Naxxramas, with 1,418 runs in that time.", foreverLead)

	octoLead := hubLead("OctoWoW (Turtle WoW fork)", leadDate, octo)
	require.Equal(t, "As of 2026-12-10, uploaded logs show 1 raid and 12 dungeon runs on OctoWoW (Turtle WoW fork) in the last 30 days, "+
		"from 9 logs, with 1 player seen in them. The most-run raid in those logs is Lower Tower of Karazhan, with 1 run in that time.", octoLead)
	require.NotEqual(t, foreverLead, octoLead, "different data, different lead")

	// Dungeons only: the top dungeon is named instead.
	dungeons := hubPayload{RecentDays: 30, WindowDays: 180, Recent: hubCounts{Dungeons: 5, Logs: 2, Players: 9},
		Instances: []hubInstance{{Name: "The Deadmines", Category: "dungeon", RunsRecent: 5, Runs: 9}}}
	require.Contains(t, hubLead("Forever", leadDate, dungeons), "The most-run dungeon in those logs is The Deadmines, with 5 runs in that time.")

	// Nothing recent: the lead says so and falls back to the 180-day window.
	quiet := hubPayload{RecentDays: 30, WindowDays: 180, Window: hubCounts{Raids: 55, Dungeons: 3, Logs: 41, Players: 240}}
	require.Equal(t, "As of 2026-12-10, uploaded logs show no raids or dungeon runs on Kronos in the last 30 days. "+
		"Over the last 180 days they show 55 raids and 3 dungeon runs, from 41 logs, with 240 players seen in them.", hubLead("Kronos", leadDate, quiet))
}

// hubStore answers the hub producer's queries and records the windows.
type hubStore struct {
	database.Store
	since, sinceRecent time.Time
}

func (h *hubStore) StatsHubInstances(_ context.Context, arg database.StatsHubInstancesParams) ([]database.StatsHubInstancesRow, error) {
	h.since, h.sinceRecent = arg.Since.Time, arg.SinceRecent.Time
	return []database.StatsHubInstancesRow{
		{Name: "Naxxramas", Category: "raid", RunsRecent: 30, Runs: 100},
		{Name: "Molten Core", Category: "raid", RunsRecent: 5, Runs: 50},
		{Name: "The Deadmines", Category: "dungeon", RunsRecent: 2, Runs: 9},
	}, nil
}

func (h *hubStore) StatsHubLogs(context.Context, database.StatsHubLogsParams) (database.StatsHubLogsRow, error) {
	return database.StatsHubLogsRow{LogsRecent: 20, Logs: 90}, nil
}

func (h *hubStore) StatsHubPlayers(context.Context, database.StatsHubPlayersParams) (database.StatsHubPlayersRow, error) {
	return database.StatsHubPlayersRow{PlayersRecent: 300, Players: 900}, nil
}

func (h *hubStore) StatsHubSpeedruns(context.Context) ([]database.StatsHubSpeedrunsRow, error) {
	return []database.StatsHubSpeedrunsRow{{InstanceName: "Naxxramas", Speedruns: 4}}, nil
}

// Totals come from the per-instance rows, windows start at a UTC day
// boundary (so hourly refreshes within a day yield the same payload), and no
// instance page is linked while none is stored.
func TestHubCompute(t *testing.T) {
	t.Parallel()
	store := &hubStore{}
	at := time.Date(2026, 12, 10, 17, 42, 5, 0, time.UTC)
	p := hubProducer{store: store, now: func() time.Time { return at }}
	out, err := p.Compute(context.Background(), Tenant{})
	require.NoError(t, err)
	require.Len(t, out, 1)
	require.Equal(t, time.Date(2026, 6, 13, 0, 0, 0, 0, time.UTC), store.since)
	require.Equal(t, time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC), store.sinceRecent)
	payload := out[0].Payload.(hubPayload)
	require.Equal(t, hubCounts{Raids: 35, Dungeons: 2, Logs: 20, Players: 300}, payload.Recent)
	require.Equal(t, hubCounts{Raids: 150, Dungeons: 9, Logs: 90, Players: 900}, payload.Window)
	require.Equal(t, 159, out[0].SampleN)
	require.EqualValues(t, 4, payload.Instances[0].Speedruns)
	for _, in := range payload.Instances {
		require.Empty(t, in.Path, in.Name)
		require.Empty(t, in.SpeedrunsPath, in.Name)
	}

	later := hubProducer{store: &hubStore{}, now: func() time.Time { return at.Add(5 * time.Hour) }}
	again, err := later.Compute(context.Background(), Tenant{})
	require.NoError(t, err)
	require.Equal(t, out[0].Payload, again[0].Payload, "same day, same data: same payload")
}
