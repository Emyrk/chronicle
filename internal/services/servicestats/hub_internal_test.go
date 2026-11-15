package servicestats

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
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
	require.Equal(t, "As of 2026-12-10, players uploaded 2,318 raids and 410 dungeon runs from WoW Forever to Chronicle in the last 30 days, "+
		"in 1,900 logs, with 7,807 players seen in those logs. The most-logged raid is Naxxramas, with 1,418 runs in that time.", foreverLead)

	octoLead := hubLead("OctoWoW (Turtle WoW fork)", leadDate, octo)
	require.Equal(t, "As of 2026-12-10, players uploaded 1 raid and 12 dungeon runs from OctoWoW (Turtle WoW fork) to Chronicle in the last 30 days, "+
		"in 9 logs, with 1 player seen in those logs. The most-logged raid is Lower Tower of Karazhan, with 1 run in that time.", octoLead)
	require.NotEqual(t, foreverLead, octoLead, "different data, different lead")

	// Dungeons only: the top dungeon is named instead.
	dungeons := hubPayload{RecentDays: 30, WindowDays: 180, Recent: hubCounts{Dungeons: 5, Logs: 2, Players: 9},
		Instances: []hubInstance{{Name: "The Deadmines", Category: "dungeon", RunsRecent: 5, Runs: 9}}}
	require.Contains(t, hubLead("Forever", leadDate, dungeons), "The most-logged dungeon is The Deadmines, with 5 runs in that time.")

	// Nothing recent: the lead says so and falls back to the 180-day window.
	quiet := hubPayload{RecentDays: 30, WindowDays: 180, Window: hubCounts{Raids: 55, Dungeons: 3, Players: 240}}
	require.Equal(t, "As of 2026-12-10, no raids or dungeons from Kronos were uploaded to Chronicle in the last 30 days. "+
		"Over the last 180 days players uploaded 55 raids and 3 dungeon runs, with 240 players seen in those logs.", hubLead("Kronos", leadDate, quiet))
}

func TestSlug(t *testing.T) {
	t.Parallel()
	for name, want := range map[string]string{
		"Molten Core":                "molten-core",
		"Onyxia's Lair":              "onyxias-lair",
		"Temple of Ahn'Qiraj":        "temple-of-ahnqiraj",
		"Zul'Gurub":                  "zulgurub",
		"Icecrown Citadel":           "icecrown-citadel",
		"  Upper Tower of Karazhan ": "upper-tower-of-karazhan",
		"Hellfire Citadel: Ramparts": "hellfire-citadel-ramparts",
		"???":                        "",
	} {
		got := Slug(name)
		require.Equal(t, want, got, name)
		if got != "" {
			require.Regexp(t, slugPattern, got)
		}
	}
}
