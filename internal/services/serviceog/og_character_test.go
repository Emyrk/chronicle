package serviceog

import (
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

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
		Gender:    database.WowPlayableGenderFemale,
		Level:     58,
		Gear:      &gear,
		Talents:   &database.PlayerTalents{Trees: [3]database.PlayerTalentTab{{PointsSpent: 11}, {PointsSpent: 32}, {PointsSpent: 8}}},
		RealmName: "Nordanaar",
		GuildName: pgtype.Text{String: "Nightfall", Valid: true},
		UpdatedAt: pgtype.Timestamptz{Time: time.Date(2026, 11, 1, 20, 0, 0, 0, time.UTC), Valid: true},
	}
}

func TestCharacterCardParams(t *testing.T) {
	t.Parallel()

	logs := 14
	stats := characterCardStats{Logs: &logs}
	got := characterCardParams(characterCardFixture(), "Night Elf", "Druid", stats)

	require.Equal(t, url.Values{
		"name":   {"Moonbrew"},
		"class":  {"druid"},
		"spec":   {"Feral"},
		"race":   {"Night Elf"},
		"gender": {"female"},
		"level":  {"58"},
		"guild":  {"Nightfall"},
		"ilvl":   {"72"},
		"logs":   {"14"},
		"seen":   {"Nov 2026"},
	}, got)
}

func TestCharacterCardParamsFallbacks(t *testing.T) {
	t.Parallel()

	t.Run("failed history lookup", func(t *testing.T) {
		t.Parallel()
		got := characterCardParams(characterCardFixture(), "Night Elf", "Druid", characterCardStats{})
		require.Equal(t, "72", got.Get("ilvl"))
		require.Equal(t, "Nov 2026", got.Get("seen"))
		for _, key := range []string{"logs", "parse", "best", "kills"} {
			require.False(t, got.Has(key), key)
		}
	})

	t.Run("no gear, talents or history", func(t *testing.T) {
		t.Parallel()
		p := characterCardFixture()
		p.Gear = nil
		p.Talents = nil
		p.Level = 0
		p.GuildName = pgtype.Text{}
		p.Gender = database.WowPlayableGenderUnknown
		got := characterCardParams(p, "Night Elf", "Druid", characterCardStats{})
		for _, key := range []string{"ilvl", "spec", "gender", "level", "guild", "logs", "parse", "best", "kills"} {
			require.False(t, got.Has(key), key)
		}
		require.Equal(t, "druid", got.Get("class"))
		require.Equal(t, "Nov 2026", got.Get("seen"))
	})
}

func TestCharacterCardSignedURL(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	api := New(Options{OGServiceURL: base, OGSigningKey: "secret"})
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
	require.Empty(t, New(Options{}).ogImageURL(r, "character", params))
}
