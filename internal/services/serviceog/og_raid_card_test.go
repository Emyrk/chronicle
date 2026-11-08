package serviceog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

func TestRaidCardParams(t *testing.T) {
	t.Parallel()

	wipes, killAvg, players := 0, 81, 40
	card := raidCard{
		Host:           "forever.chronicleclassic.com",
		Guild:          "Nightfall",
		Raid:           "Molten Core",
		Date:           time.Date(2026, 11, 6, 21, 30, 0, 0, time.UTC),
		Players:        &players,
		Kills:          10,
		Bosses:         10,
		Duration:       6727 * time.Second,
		Wipes:          &wipes,
		KillTimeParses: []int{72, 81, 95, 76},
		KillTimeAvg:    &killAvg,
		Top: []raidCardDPS{
			{Name: "Thalendris", Class: "mage", DPS: 1284},
			{Name: "Grimtusk", Class: "warrior", DPS: 1201},
		},
		Heal: []raidCardDPS{{Name: "Aeloria", Class: "priest", DPS: 812}},
		Comp: []raidCardClass{{Class: "warrior", Count: 5}, {Class: "priest", Count: 8}},
	}

	require.Equal(t, url.Values{
		"host":       {"forever.chronicleclassic.com"},
		"guild":      {"Nightfall"},
		"raid":       {"Molten Core"},
		"date":       {"2026-11-06"},
		"players":    {"40"},
		"kills":      {"10"},
		"bosses":     {"10"},
		"dur":        {"6727"},
		"wipes":      {"0"},
		"killparses": {"72,81,95,76"},
		"killavg":    {"81"},
		"top":        {"Thalendris:mage:1284,Grimtusk:warrior:1201"},
		"heal":       {"Aeloria:priest:812"},
		"comp":       {"warrior:5,priest:8"},
		"art":        {"molten-core"},
	}, raidCardParams(card))

	// Through the signer: template, host, product and v are added, and the
	// card params pass unchanged.
	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	params := raidCardParams(card)
	signed, err := url.Parse(signedOGImageURL(base, "k", "raid", params.Get("host"), "WoW Forever", params))
	require.NoError(t, err)
	q := signed.Query()
	require.Equal(t, "raid", q.Get("template"))
	require.Equal(t, "forever.chronicleclassic.com", q.Get("host"))
	require.Equal(t, "WoW Forever", q.Get("product"))
	require.Equal(t, "Thalendris:mage:1284,Grimtusk:warrior:1201", q.Get("top"))
	require.Equal(t, "Aeloria:priest:812", q.Get("heal"))
	require.NotEmpty(t, q.Get("sig"))
}

func TestRaidKillTimeParseSummary(t *testing.T) {
	t.Parallel()

	first, second, unmatched, small := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	start := time.Date(2026, 11, 6, 20, 0, 0, 0, time.UTC)
	encounters := []database.LogInstanceEncounter{
		{ID: first, StartTime: database.Timestamptz(start)},
		{ID: second, StartTime: database.Timestamptz(start.Add(time.Minute))},
	}
	rows := []database.TimeParseBossScore{
		{EncounterID: second, ServerPreciseScore: 90.4, ServerDisplayScore: 90, ServerStatus: string(timeparsepolicy.StatusOK)},
		{EncounterID: unmatched, ServerPreciseScore: 70.4, ServerDisplayScore: 70, ServerStatus: string(timeparsepolicy.StatusLowConfidence)},
		{EncounterID: small, ServerPreciseScore: 99, ServerDisplayScore: 99, ServerStatus: string(timeparsepolicy.StatusSampleTooSmall)},
		{EncounterID: first, ServerPreciseScore: 60.4, ServerDisplayScore: 60, ServerStatus: string(timeparsepolicy.StatusOK)},
	}

	scores, avg := raidKillTimeParseSummary(rows, encounters)
	require.Equal(t, []int{60, 90, 70}, scores)
	require.NotNil(t, avg)
	require.Equal(t, 74, *avg)
}

func TestRaidCardParamsFallbacks(t *testing.T) {
	t.Parallel()

	// A PUG dungeon: no guild, no ranked bosses, no parse, no known art.
	// The players query failed: no players param rather than "0 players".
	params := raidCardParams(raidCard{Raid: "Karazhan Crypts", Kills: 4, Bosses: 6})
	for _, key := range []string{"host", "guild", "players", "top", "heal", "killparses", "killavg", "wipes", "comp", "date", "dur"} {
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
	}, raidTopDPS(records, 5))
	require.Equal(t, []raidCardDPS{{Name: "Grimtusk", Class: "warrior", DPS: 700}}, raidTopDPS(records, raidCardTopN))

	top := raidTopDPS(records, 10)
	require.Len(t, top, 6, "zero-DPS players are dropped")
	require.Equal(t, raidCardDPS{Name: "Averylongcharact", Class: "mage", DPS: 600}, top[5])

	require.Empty(t, raidTopDPS(records[2:3], raidCardTopN), "trash only = no ranked bosses")
}

func TestRaidTopHPS(t *testing.T) {
	t.Parallel()

	boss := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	row := func(guid, name, class string, healing, absorbed int64) database.EncounterDpsRanking {
		return database.EncounterDpsRanking{EncounterID: boss, PlayerGuid: guid, PlayerName: name, PlayerClass: class, HealingDone: healing, AbsorbedDone: absorbed, DurationSecs: 100}
	}
	records := []database.EncounterDpsRanking{
		row("a", "Aeloria", "PRIEST", 60_000, 30_000), // absorbs count: 900
		row("b", "Moonbrew", "DRUID", 85_000, 0),
		row("c", "Grimtusk", "WARRIOR", 0, 0),
		{PlayerGuid: "a", PlayerName: "Aeloria", PlayerClass: "PRIEST", HealingDone: 9_000_000, DurationSecs: 10}, // trash
	}

	require.Equal(t, []raidCardDPS{
		{Name: "Aeloria", Class: "priest", DPS: 900},
		{Name: "Moonbrew", Class: "druid", DPS: 850},
	}, raidTopHPS(records, 5))
	require.Len(t, raidTopHPS(records, raidCardTopN), 1)
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

func TestRaidBossProgress(t *testing.T) {
	t.Parallel()

	progression, count := registry.RegistryForFlavor(nil, database.WoWFlavor{database.FlavorVanilla}).ProgressionBosses("Zul'Gurub")
	require.Len(t, progression, 8)
	require.NotNil(t, count)
	require.Equal(t, 8, *count)

	kill := func(names ...string) []database.LogInstanceEncounter {
		out := make([]database.LogInstanceEncounter, 0, len(names))
		for _, name := range names {
			out = append(out, database.LogInstanceEncounter{Name: name, Boss: true, KillType: database.KillTypeClean})
		}
		return out
	}
	// Gahz'ranka and an Edge of Madness boss are optional.
	optional := kill("Gahz'ranka", "Hazza'rah")

	t.Run("FullClearPlusOptional", func(t *testing.T) {
		t.Parallel()
		kills, total := raidBossProgress(append(kill(progression...), optional...), progression, count)
		require.Equal(t, 8, kills)
		require.Equal(t, 8, total)
		params := raidCardParams(raidCard{Raid: "Zul'Gurub", Kills: kills, Bosses: total})
		require.Equal(t, "8", params.Get("kills"))
		require.Equal(t, "8", params.Get("bosses"))
	})

	t.Run("PartialPlusOptionalIsNotAClear", func(t *testing.T) {
		t.Parallel()
		encounters := append(kill(progression[:6]...), optional...)
		// A wipe on a progression boss doesn't count either.
		encounters = append(encounters, database.LogInstanceEncounter{Name: progression[6], Boss: true, KillType: database.KillTypeWipe})
		kills, total := raidBossProgress(encounters, progression, count)
		require.Equal(t, 6, kills)
		require.Equal(t, 8, total)
	})

	t.Run("NoProgressionList", func(t *testing.T) {
		t.Parallel()
		encounters := append(kill("A", "B", "A"), database.LogInstanceEncounter{Name: "C", Boss: true, KillType: database.KillTypeWipe})
		kills, total := raidBossProgress(encounters, nil, nil)
		require.Equal(t, 2, kills)
		require.Equal(t, 3, total)
	})
}

// loadRaidCard on a real store: the parallel queries finish (or time out)
// before it returns, and a failed or empty part keeps base's value.
func TestLoadRaidCard(t *testing.T) {
	t.Parallel()

	db, _ := dbtestutil.NewDB(t)
	api := New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), db)})
	inst := database.LogInstancesGuild{ID: uuid.New(), Name: "Zul'Gurub"}
	players := 20
	base := raidCard{Raid: "Zul'Gurub", Players: &players}
	encounters := []database.LogInstanceEncounter{{Name: "Hakkar", Boss: true, KillType: database.KillTypeClean}}

	t.Run("UnknownInstance", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		r := httptest.NewRequest(http.MethodGet, "/instances/x", nil).WithContext(ctx)
		card := api.loadRaidCard(r, inst, encounters, base)
		require.Equal(t, &players, card.Players)
		require.Equal(t, 1, card.Kills) // no registry: distinct kills
		require.Equal(t, 1, card.Bosses)
		require.Nil(t, card.Wipes)
		require.Empty(t, card.Top)
		require.Empty(t, card.Heal)
		require.Empty(t, card.KillTimeParses)
		require.Nil(t, card.KillTimeAvg)
	})

	t.Run("CanceledRequest", func(t *testing.T) {
		t.Parallel()
		ctx, cancel := context.WithCancel(testutil.Context(t, testutil.WaitShort))
		cancel()
		r := httptest.NewRequest(http.MethodGet, "/instances/x", nil).WithContext(ctx)
		start := time.Now()
		card := api.loadRaidCard(r, inst, encounters, base)
		require.Less(t, time.Since(start), raidCardTimeout)
		require.Equal(t, base.Raid, card.Raid)
		require.Nil(t, card.Wipes)
	})
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
