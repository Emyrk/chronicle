package api

import (
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func TestRaidCardParams(t *testing.T) {
	t.Parallel()

	wipes, avg := 0, 81
	card := raidCard{
		Guild:    "Nightfall",
		Raid:     "Molten Core",
		Realm:    "Nordanaar",
		Date:     time.Date(2026, 11, 6, 21, 30, 0, 0, time.UTC),
		Players:  40,
		Kills:    10,
		Bosses:   10,
		Duration: 6727 * time.Second,
		Wipes:    &wipes,
		AvgParse: &avg,
		Top: []raidCardDPS{
			{Name: "Thalendris", Class: "mage", DPS: 1284},
			{Name: "Grimtusk", Class: "warrior", DPS: 1201},
		},
		Comp: []raidCardClass{{Class: "warrior", Count: 5}, {Class: "priest", Count: 8}},
	}

	require.Equal(t, url.Values{
		"guild":   {"Nightfall"},
		"raid":    {"Molten Core"},
		"realm":   {"Nordanaar"},
		"date":    {"2026-11-06"},
		"players": {"40"},
		"kills":   {"10"},
		"bosses":  {"10"},
		"dur":     {"6727"},
		"wipes":   {"0"},
		"avg":     {"81"},
		"top":     {"Thalendris:mage:1284,Grimtusk:warrior:1201"},
		"comp":    {"warrior:5,priest:8"},
		"art":     {"molten-core"},
	}, raidCardParams(card))

	// Through the signer: template, host, product and v are added, and the
	// card params pass unchanged.
	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	params := raidCardParams(card)
	params.Set("host", "forever.chronicleclassic.com")
	signed, err := url.Parse(signedOGImageURL(base, "k", "raid", params.Get("host"), "WoW Forever", params))
	require.NoError(t, err)
	q := signed.Query()
	require.Equal(t, "raid", q.Get("template"))
	require.Equal(t, "forever.chronicleclassic.com", q.Get("host"))
	require.Equal(t, "WoW Forever", q.Get("product"))
	require.Equal(t, "Thalendris:mage:1284,Grimtusk:warrior:1201", q.Get("top"))
	require.NotEmpty(t, q.Get("sig"))
}

func TestRaidCardParamsFallbacks(t *testing.T) {
	t.Parallel()

	// A PUG dungeon: no guild, no ranked bosses, no parse, no known art.
	params := raidCardParams(raidCard{Raid: "Karazhan Crypts", Realm: "Nordanaar", Players: 5, Kills: 4, Bosses: 6})
	for _, key := range []string{"guild", "top", "avg", "wipes", "comp", "date", "dur"} {
		require.False(t, params.Has(key), key)
	}
	require.Equal(t, "karazhan-crypts", params.Get("art"))
	require.Equal(t, "4", params.Get("kills"))
	require.Equal(t, "6", params.Get("bosses"))
}

func TestRaidTopDPS(t *testing.T) {
	t.Parallel()

	boss := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	boss2 := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	row := func(encounter uuid.NullUUID, guid, name, class string, damage int64, secs float64) database.EncounterDpsRanking {
		return database.EncounterDpsRanking{EncounterID: encounter, PlayerGuid: guid, PlayerName: name, PlayerClass: class, DamageDone: damage, DurationSecs: secs}
	}
	records := []database.EncounterDpsRanking{
		// Damage ÷ time across bosses: (100k + 20k) / (100 + 100) = 600.
		row(boss, "a", "Averylongcharactername", "MAGE", 100_000, 100),
		row(boss2, "a", "Averylongcharactername", "MAGE", 20_000, 100),
		// Trash rows (no encounter) don't count.
		row(uuid.NullUUID{}, "a", "Averylongcharactername", "MAGE", 9_000_000, 10),
		row(boss, "b", "Grimtusk", "WARRIOR", 70_000, 100),
		row(boss, "c", "Vexxa", "WARLOCK", 65_000, 100),
		row(boss, "d", "Shadowstep", "ROGUE", 64_000, 100),
		row(boss, "e", "Kaelyn", "HUNTER", 63_000, 100),
		row(boss, "f", "Sixth", "DEATH_KNIGHT", 62_000, 100),
		row(boss, "g", "Healer", "PRIEST", 0, 100),
	}

	require.Equal(t, []raidCardDPS{
		{Name: "Grimtusk", Class: "warrior", DPS: 700},
		{Name: "Vexxa", Class: "warlock", DPS: 650},
		{Name: "Shadowstep", Class: "rogue", DPS: 640},
		{Name: "Kaelyn", Class: "hunter", DPS: 630},
		{Name: "Sixth", Class: "deathknight", DPS: 620},
	}, raidTopDPS(records, raidCardTopN))

	top := raidTopDPS(records, 10)
	require.Len(t, top, 6, "zero-DPS players are dropped")
	require.Equal(t, raidCardDPS{Name: "Averylongcharact", Class: "mage", DPS: 600}, top[5])

	require.Empty(t, raidTopDPS(records[2:3], raidCardTopN), "trash only = no ranked bosses")
}

func TestRaidComposition(t *testing.T) {
	t.Parallel()

	players := []database.LogInstancePlayer{
		{Class: database.WowPlayableClassPRIEST},
		{Class: database.WowPlayableClassWARRIOR},
		{Class: database.WowPlayableClassPRIEST},
		{Class: database.WowPlayableClassDEATHKNIGHT},
		{Class: database.WowPlayableClassMAGE},
		{Class: ""},
	}
	require.Equal(t, []raidCardClass{
		{Class: "warrior", Count: 1},
		{Class: "deathknight", Count: 1},
		{Class: "mage", Count: 1},
		{Class: "priest", Count: 2},
	}, raidComposition(players))
}

func TestRaidAvgParse(t *testing.T) {
	t.Parallel()

	result := func(guid, role, status string, score float64) database.ParseScoreResult {
		return database.ParseScoreResult{PlayerGuid: guid, PlayerRole: role, Status: status, PreciseScore: score}
	}
	dps := []database.ParseScoreResult{
		result("a", "dps", "ok", 90),
		result("a", "dps", "low_confidence", 70), // a: 80
		result("b", "tank", "ok", 50),            // b: 50
		result("b", "tank", "sample_too_small", 0),
		result("h", "heal", "ok", 1), // healers read from HPS
	}
	hps := []database.ParseScoreResult{
		result("h", "heal", "ok", 95), // h: 95
		result("a", "dps", "ok", 5),
	}
	avg := raidAvgParse(dps, hps)
	require.NotNil(t, avg)
	require.Equal(t, 75, *avg) // (80 + 50 + 95) / 3

	require.Nil(t, raidAvgParse(nil, nil))
	require.Nil(t, raidAvgParse([]database.ParseScoreResult{result("a", "dps", "sample_too_small", 40)}, nil))
}

func TestOGArtSlug(t *testing.T) {
	t.Parallel()

	// Same slugs as services/og's artSlug / RAID_ART keys.
	for name, slug := range map[string]string{
		"Molten Core":             "molten-core",
		"Onyxia's Lair":           "onyxias-lair",
		"Zul'Gurub":               "zulgurub",
		"Ruins of Ahn'Qiraj":      "ruins-of-ahnqiraj",
		"Lower Tower of Karazhan": "lower-tower-of-karazhan",
	} {
		require.Equal(t, slug, ogArtSlug(name), name)
	}
}
