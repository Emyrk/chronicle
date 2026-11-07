package api

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func characterCardFixture() database.GetGamePlayerByGUIDRow {
	ilvl := func(v int32) *int32 { return &v }
	var gear database.PlayerOutfit
	gear[0] = database.PlayerGear{ItemID: 1, ItemLevel: ilvl(70)}
	gear[1] = database.PlayerGear{ItemID: 2, ItemLevel: ilvl(73)}
	gear[3] = database.PlayerGear{ItemID: 3, ItemLevel: ilvl(1)}  // shirt: skipped
	gear[4] = database.PlayerGear{ItemID: 4}                      // unknown ilvl: skipped
	gear[18] = database.PlayerGear{ItemID: 5, ItemLevel: ilvl(1)} // tabard: skipped
	return database.GetGamePlayerByGUIDRow{
		Name:      "Moonbrew",
		Class:     database.WowPlayableClassDRUID,
		Level:     58,
		Gear:      &gear,
		Talents:   &database.PlayerTalents{Trees: [3]database.PlayerTalentTab{{PointsSpent: 11}, {PointsSpent: 32}, {PointsSpent: 8}}},
		RealmName: "Nordanaar",
		GuildName: pgtype.Text{String: "Nightfall", Valid: true},
		UpdatedAt: pgtype.Timestamptz{Time: time.Date(2026, 11, 1, 20, 0, 0, 0, time.UTC), Valid: true},
	}
}

func parseRow(instance, encounter string, score float64) database.GetCharacterParseHistoryRow {
	return database.GetCharacterParseHistoryRow{InstanceName: instance, EncounterName: encounter, PreciseScore: score}
}

func TestCharacterCardParams(t *testing.T) {
	t.Parallel()

	stats := characterCardStats{
		Parses: []database.GetCharacterParseHistoryRow{
			parseRow("Molten Core", "Ragnaros", 99.2),
			parseRow("Molten Core", "Ragnaros", 98.8),
			parseRow("Blackwing Lair", "Nefarian", 97),
			parseRow("Ahn'Qiraj", "C'Thun", 88),
			parseRow("Molten Core", "Lucifron", 40),
		},
		Encounters: []database.GetCharacterEncounterStatsRow{
			{InstanceName: "Molten Core", Kills: 200},
			{InstanceName: "Blackwing Lair", Kills: 12},
		},
	}
	got := characterCardParams(characterCardFixture(), "Night Elf", "Druid", stats)

	require.Equal(t, url.Values{
		"name":  {"Moonbrew"},
		"class": {"druid"},
		"spec":  {"Feral"},
		"race":  {"Night Elf"},
		"level": {"58"},
		"guild": {"Nightfall"},
		"realm": {"Nordanaar"},
		"ilvl":  {"72"},
		// (99 + 97 + 88 + 40) / 4
		"parse": {"81.0"},
		// Capped at three, best first; Lucifron is dropped.
		"best":  {"Ragnaros:99,Nefarian:97,C'Thun:88"},
		"kills": {"212"},
	}, got)
}

func TestCharacterCardParamsFallbacks(t *testing.T) {
	t.Parallel()

	t.Run("no parses", func(t *testing.T) {
		t.Parallel()
		got := characterCardParams(characterCardFixture(), "Night Elf", "Druid", characterCardStats{
			Parses: []database.GetCharacterParseHistoryRow{},
			Encounters: []database.GetCharacterEncounterStatsRow{
				{InstanceName: "Molten Core", Kills: 3},
				{InstanceName: "Molten Core", Kills: 1},
				{InstanceName: "Onyxia's Lair", Kills: 1},
			},
		})
		require.Equal(t, "72", got.Get("ilvl"))
		require.Equal(t, "2", got.Get("raids"))
		require.Equal(t, "Nov 2026", got.Get("seen"))
		for _, key := range []string{"parse", "best", "kills"} {
			require.False(t, got.Has(key), key)
		}
	})

	t.Run("no gear, talents or failed lookups", func(t *testing.T) {
		t.Parallel()
		p := characterCardFixture()
		p.Gear = nil
		p.Talents = nil
		p.Level = 0
		p.GuildName = pgtype.Text{}
		got := characterCardParams(p, "Night Elf", "Druid", characterCardStats{})
		for _, key := range []string{"ilvl", "spec", "level", "guild", "raids", "parse", "best", "kills"} {
			require.False(t, got.Has(key), key)
		}
		require.Equal(t, "druid", got.Get("class"))
		require.Equal(t, "Nov 2026", got.Get("seen"))
	})

	t.Run("parses without kill lookup", func(t *testing.T) {
		t.Parallel()
		got := characterCardParams(characterCardFixture(), "Night Elf", "Druid", characterCardStats{
			Parses: []database.GetCharacterParseHistoryRow{parseRow("Molten Core", "Garr", 75.5)},
		})
		require.Equal(t, "75.5", got.Get("parse"))
		require.Equal(t, "Garr:76", got.Get("best"))
		require.False(t, got.Has("kills"))
	})
}

func TestCharacterBestBossesShortensLongNames(t *testing.T) {
	t.Parallel()
	long := "High Priestess Mar'li and Twin Emperors Vek'lor"
	best := characterBestBosses([]chroniclesdk.CharacterParse{
		{InstanceName: "Zul'Gurub", EncounterName: long, PreciseScore: 97},
		{InstanceName: "Blackwing Lair", EncounterName: "Nefarian", PreciseScore: 95},
	})
	items := strings.Split(best, ",")
	require.Equal(t, []string{"High Priestess Mar'li and Twi…:97", "Nefarian:95"}, items)
	// Every item fits the card's 40-character list item, score included.
	for _, item := range items {
		require.LessOrEqual(t, utf8.RuneCountInString(item), 40)
	}
	require.Equal(t, "Nefarian", shortenBossName("Nefarian"))
}

func TestCharacterCardMetric(t *testing.T) {
	t.Parallel()

	p := characterCardFixture()
	p.Talents.Trees = [3]database.PlayerTalentTab{{PointsSpent: 0}, {PointsSpent: 10}, {PointsSpent: 41}}
	require.Equal(t, "Restoration", characterSpec(p))
	require.Equal(t, "hps", characterCardMetric(characterSpec(p)))
	require.Equal(t, "dps", characterCardMetric("Feral"))
	require.Equal(t, "dps", characterCardMetric(""))
}

func TestCharacterCardSignedURL(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	api := &API{Opts: &Options{OGServiceURL: base, OGSigningKey: "secret"}}
	r := httptest.NewRequest("GET", "https://forever.chronicleclassic.com/armory/Nordanaar/Moonbrew", nil)

	params := characterCardParams(characterCardFixture(), "Night Elf", "Druid", characterCardStats{})
	raw := api.ogImageURL(r, "character", params)
	u, err := url.Parse(raw)
	require.NoError(t, err)
	q := u.Query()
	require.Equal(t, "character", q.Get("template"))
	require.Equal(t, "forever.chronicleclassic.com", q.Get("host"))
	for key := range params {
		require.Equal(t, params.Get(key), q.Get(key), key)
	}
	require.Equal(t, ogSignature("secret", q), q.Get("sig"))

	// Unconfigured: no URL, so the page keeps today's image.
	require.Empty(t, (&API{Opts: &Options{}}).ogImageURL(r, "character", params))
}
