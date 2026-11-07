package api

import (
	"net/url"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
)

func guildOGKill(instance, encounter string, kills int32, first time.Time) database.GuildEncounterKillsRow {
	return database.GuildEncounterKillsRow{
		InstanceName:   instance,
		EncounterName:  encounter,
		DifficultyName: "Normal",
		MaxPlayers:     40,
		Kills:          kills,
		FirstKilledAt:  pgtype.Timestamptz{Time: first, Valid: true},
	}
}

func guildOGFixtureRaids() map[string]guildOGRaid {
	return map[string]guildOGRaid{
		"Molten Core":         {Order: 100, Total: 2},
		"Onyxia's Lair":       {Order: 200, Total: 1},
		"Blackwing Lair":      {Order: 300, Total: 2},
		"Temple of Ahn'Qiraj": {Order: 600, Total: 9},
		"Naxxramas":           {Order: 700, Total: 15, Bosses: map[string]struct{}{"Anub'Rekhan": {}, "Patchwerk": {}}},
	}
}

func TestGuildOGParams(t *testing.T) {
	t.Parallel()

	mar := time.Date(2025, 3, 14, 20, 0, 0, 0, time.UTC)
	later := mar.AddDate(0, 4, 0)
	data := guildOGData{
		Guild:   database.GetGuildByIDRow{Name: "Nightfall", RealmName: "Nordanaar"},
		Theme:   chroniclesdk.GuildPageTheme{PrimaryColor: "#5F8FA6", LogoURL: "/c/images/guilds/nightfall.png", Tags: []chroniclesdk.GuildTag{"Raiding", "Casual"}},
		Members: 62,
		Encounters: []database.GuildEncounterKillsRow{
			guildOGKill("Molten Core", "Lucifron", 12, later),
			guildOGKill("Molten Core", "Ragnaros", 10, mar),
			guildOGKill("Onyxia's Lair", "Onyxia", 9, later),
			guildOGKill("Blackwing Lair", "Razorgore the Untamed", 8, later),
			guildOGKill("Blackwing Lair", "Nefarian", 6, later),
			guildOGKill("Temple of Ahn'Qiraj", "The Prophet Skeram", 4, later),
			guildOGKill("Naxxramas", "Patchwerk", 2, later),
			// Not a progression boss: ignored.
			guildOGKill("Naxxramas", "Trash Pack", 2, later),
			// Not a raid with a boss count: ignored.
			guildOGKill("Ragefire Chasm", "Taragaman", 3, later),
		},
		BestRuns: []database.GuildBestRunsRow{
			{InstanceName: "Molten Core", DurationMs: 2_092_400},
			{InstanceName: "Blackwing Lair", DurationMs: 3_000_000},
			{InstanceName: "Ragefire Chasm", DurationMs: 600_000},
		},
		TopParses: []database.GuildTopParsesRow{
			{PlayerName: "Thalendris", PlayerClass: "MAGE", DisplayScore: 99},
			{PlayerName: "Grimtusk", PlayerClass: "WARRIOR", DisplayScore: 80},
			{PlayerName: "Lyra", PlayerClass: "PRIEST", DisplayScore: 56},
		},
	}

	got := guildOGParams("forever.chronicleclassic.com", data, guildOGFixtureRaids())
	require.Equal(t, url.Values{
		"name":     {"Nightfall"},
		"realm":    {"Nordanaar"},
		"members":  {"62"},
		"icon":     {"https://forever.chronicleclassic.com/c/images/guilds/nightfall.png"},
		"accent":   {"5F8FA6"},
		"tag":      {"Raiding"},
		"since":    {"2025-03"},
		"prog":     {"Ony:1:1,BWL:2:2,AQ40:1:9,Naxx:1:15"},
		"best":     {"3000"},
		"bestraid": {"BWL"},
		"avg":      {"78"},
	}, got)

	t.Run("NoProgression", func(t *testing.T) {
		t.Parallel()
		bare := guildOGData{
			Guild: database.GetGuildByIDRow{Name: "Nightfall", RealmName: "Nordanaar"},
			Encounters: []database.GuildEncounterKillsRow{
				guildOGKill("Ragefire Chasm", "Taragaman", 3, mar),
				guildOGKill("Ragefire Chasm", "Bazzalan", 2, mar),
				guildOGKill("Wailing Caverns", "Mutanus", 4, mar),
			},
			TopParses: []database.GuildTopParsesRow{
				{PlayerName: "Thal,en:dris", PlayerClass: "MAGE", DisplayScore: 99},
				{PlayerName: "Grimtusk", PlayerClass: "WARRIOR", DisplayScore: 80},
				{PlayerName: "Lyra", PlayerClass: "PRIEST", DisplayScore: 56},
				{PlayerName: "Fourth", PlayerClass: "ROGUE", DisplayScore: 41},
			},
		}
		got := guildOGParams("chronicleclassic.com", bare, guildOGFixtureRaids())
		require.Equal(t, url.Values{
			"name":  {"Nightfall"},
			"realm": {"Nordanaar"},
			"since": {"2025-03"},
			"raids": {"7"},
			"top":   {"Thalendris:mage:99,Grimtusk:warrior:80,Lyra:priest:56"},
			"avg":   {"69"},
		}, got)
	})
}

func TestGuildOGLogoURL(t *testing.T) {
	t.Parallel()
	require.Equal(t, "https://cdn.example.com/a.png", guildOGLogoURL("h.com", " https://cdn.example.com/a.png "))
	require.Equal(t, "https://h.com/c/images/a.png", guildOGLogoURL("h.com", "/c/images/a.png"))
	require.Empty(t, guildOGLogoURL("h.com", "//evil.com/a.png"))
	require.Empty(t, guildOGLogoURL("h.com", "data:image/png;base64,AAAA"))
	require.Empty(t, guildOGLogoURL("h.com", "javascript:alert(1)"))
	require.Empty(t, guildOGLogoURL("h.com", ""))
}

func TestGuildOGRaidsFromRegistry(t *testing.T) {
	t.Parallel()
	reg := registry.RegistryForFlavor(nil, database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle})
	details := reg.AllInstanceDetails()
	raids := guildOGRaids(details)
	mc, ok := raids["Molten Core"]
	require.True(t, ok)
	for _, d := range details {
		if d.Name == "Molten Core" {
			require.Equal(t, *d.BossCount, mc.Total)
		}
	}
	require.Positive(t, mc.Total)
	require.Equal(t, 100, mc.Order)
	_, ok = raids["Ragefire Chasm"]
	require.False(t, ok, "dungeons have no progression row")
}

func TestGuildOGImageURLSigned(t *testing.T) {
	t.Parallel()
	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	params := url.Values{"name": {"Nightfall"}, "prog": {"MC:10:10"}}
	raw := signedOGImageURL(base, "k", "guild", "forever.chronicleclassic.com", "WoW Forever", params)
	u, err := url.Parse(raw)
	require.NoError(t, err)
	q := u.Query()
	require.Equal(t, "guild", q.Get("template"))
	require.Equal(t, "MC:10:10", q.Get("prog"))
	require.Equal(t, ogSignature("k", q), q.Get("sig"))
}
