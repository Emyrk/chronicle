package serviceog

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/xerrors"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
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
				// Dungeon kills count toward neither raids logged nor since.
				guildOGKill("Ragefire Chasm", "Taragaman", 3, mar.AddDate(-1, 0, 0)),
				guildOGKill("Wailing Caverns", "Mutanus", 4, mar.AddDate(-1, 0, 0)),
				// A raid kill that isn't a progression boss: no row, but a raid logged.
				guildOGKill("Naxxramas", "Trash Pack", 2, mar),
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
			"raids": {"2"},
			"top":   {"Thalendris:mage:99,Grimtusk:warrior:80,Lyra:priest:56"},
			"avg":   {"69"},
		}, got)
	})
}

func TestGuildOGLogoURL(t *testing.T) {
	t.Parallel()
	host := "forever.chronicleclassic.com"
	for raw, want := range map[string]string{
		" https://forever.chronicleclassic.com/c/images/a.png ": "https://forever.chronicleclassic.com/c/images/a.png",
		"/c/images/a.png":                            "https://forever.chronicleclassic.com/c/images/a.png",
		"https://chronicleclassic.com/a.png":         "https://chronicleclassic.com/a.png",
		"https://cdn.chronicleclassic.com/a.png":     "https://cdn.chronicleclassic.com/a.png",
		"https://FOREVER.chronicleclassic.com/a.png": "https://FOREVER.chronicleclassic.com/a.png",
		// Not Chronicle-hosted: the monogram shows.
		"https://cdn.example.com/a.png":                  "",
		"https://evilchronicleclassic.com/a.png":         "",
		"https://chronicleclassic.com.evil/a.png":        "",
		"http://forever.chronicleclassic.com/a.png":      "",
		"https://u:p@forever.chronicleclassic.com/a.png": "",
		"//evil.com/a.png":                               "",
		"data:image/png;base64,AAAA":                     "",
		"javascript:alert(1)":                            "",
		"":                                               "",
		"/" + strings.Repeat("a", 600):                   "",
	} {
		require.Equal(t, want, guildOGLogoURL(host, raw), raw)
	}
	// The page host may carry a port locally.
	require.Equal(t, "https://localhost:4000/a.png", guildOGLogoURL("localhost:4000", "/a.png"))
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

// Turtle splits Tower of Karazhan into Lower/Upper, which only exist as
// derived names on the registry entry.
func TestGuildOGTurtleKarazhan(t *testing.T) {
	t.Parallel()
	turtle := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorTurtle}
	reg := registry.RegistryForFlavor(nil, turtle)
	raids := guildOGRaids(reg.AllInstanceDetails())

	upper, ok := raids["Upper Tower of Karazhan"]
	require.True(t, ok, "UKara must be indexed")
	require.Positive(t, upper.Total)
	require.Len(t, upper.Bosses, upper.Total)
	require.Greater(t, upper.Order, raids["Naxxramas"].Order)
	_, ok = raids["Lower Tower of Karazhan"]
	require.True(t, ok, "LKara must be indexed")

	var boss string
	for b := range upper.Bosses {
		boss = b
		break
	}
	when := time.Date(2025, 6, 1, 20, 0, 0, 0, time.UTC)
	got := guildOGParams("turtle.chronicleclassic.com", guildOGData{
		Guild: database.GetGuildByIDRow{Name: "Nightfall", RealmName: "Nordanaar"},
		Encounters: []database.GuildEncounterKillsRow{
			guildOGKill("Naxxramas", "Patchwerk", 3, when),
			guildOGKill("Upper Tower of Karazhan", boss, 1, when),
		},
		BestRuns: []database.GuildBestRunsRow{
			{InstanceName: "Naxxramas", DurationMs: 9_000_000},
			{InstanceName: "Upper Tower of Karazhan", DurationMs: 5_400_000},
		},
	}, raids)
	require.Equal(t, fmt.Sprintf("Naxx:1:%d,UKara:1:%d", raids["Naxxramas"].Total, upper.Total), got.Get("prog"))
	require.Equal(t, "UKara", got.Get("bestraid"))
	require.Equal(t, "5400", got.Get("best"))
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

// guildOGFaultStore makes one card query fail (or block until its context is
// done) on top of a real store.
type guildOGFaultStore struct {
	database.Store
	block bool
}

func (s guildOGFaultStore) GetGuildPage(ctx context.Context, guildID uuid.UUID) (database.GuildPage, error) {
	if s.block {
		<-ctx.Done()
		return database.GuildPage{}, ctx.Err()
	}
	return database.GuildPage{}, xerrors.New("boom")
}

func TestGuildOGResolver(t *testing.T) {
	t.Parallel()
	// Setup gets its own context, and so does every subtest: parallel
	// subtests only start once the parent returns and a -parallel slot is
	// free, which on a busy runner can be longer than any parent deadline.
	setupCtx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)

	serverID := uuid.New()
	_, err := store.InsertWoWServer(setupCtx, database.InsertWoWServerParams{ID: serverID, Name: "og guild " + serverID.String()})
	require.NoError(t, err)
	realmID := uuid.New()
	realmName := "Realm " + realmID.String()[:8]
	_, err = store.InsertWoWServerRealm(setupCtx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: realmName})
	require.NoError(t, err)
	guild, err := store.UpsertGuild(setupCtx, database.UpsertGuildParams{RealmID: realmID, Name: "Nightfall", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)
	theme, err := json.Marshal(chroniclesdk.GuildPageTheme{
		PrimaryColor: "#A63F3F",
		LogoURL:      "https://cdn.example.com/logo.png",
		Tags:         []chroniclesdk.GuildTag{chroniclesdk.GuildTagRaiding},
	})
	require.NoError(t, err)
	_, err = store.UpsertGuildPage(setupCtx, database.UpsertGuildPageParams{GuildID: guild.ID, Theme: theme})
	require.NoError(t, err)

	ogBase, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	newAPI := func(db database.Store, configured bool) *Service {
		opts := &Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), db)}
		if configured {
			opts.OGServiceURL = ogBase
			opts.OGSigningKey = "k"
		}
		return New(*opts)
	}
	request := func(ctx context.Context) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/g/"+guild.ID.String(), nil).WithContext(ctx)
		r.Host = "forever.chronicleclassic.com"
		return r
	}
	imageQuery := func(t *testing.T, raw string) url.Values {
		t.Helper()
		require.NotEmpty(t, raw)
		u, err := url.Parse(raw)
		require.NoError(t, err)
		q := u.Query()
		require.Equal(t, ogSignature("k", q), q.Get("sig"))
		return q
	}
	wantTitle := "Nightfall"
	wantDescription := "Nightfall guild on " + realmName + ": raid progression, best clears and top parses on Chronicle."

	t.Run("Unconfigured", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)
		og := newAPI(store, false).guildOG(request(ctx), guild.ID.String())
		require.NotNil(t, og)
		require.Empty(t, og.ImageURL)
		require.Equal(t, wantTitle, og.Title)
		require.Equal(t, wantDescription, og.Description)
		require.Equal(t, "https://forever.chronicleclassic.com/g/"+guild.ID.String(), og.URL)
	})

	t.Run("UnknownOrInvalid", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)
		api := newAPI(store, true)
		require.Nil(t, api.guildOG(request(ctx), uuid.NewString()))
		require.Nil(t, api.guildOG(request(ctx), "not-a-uuid"))
	})

	t.Run("Configured", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)
		og := newAPI(store, true).guildOG(request(ctx), guild.ID.String())
		require.NotNil(t, og)
		require.Equal(t, wantTitle, og.Title)
		require.Equal(t, wantDescription, og.Description)
		q := imageQuery(t, og.ImageURL)
		require.Equal(t, "guild", q.Get("template"))
		require.Equal(t, "Nightfall", q.Get("name"))
		require.Equal(t, realmName, q.Get("realm"))
		require.Equal(t, "A63F3F", q.Get("accent"))
		require.Equal(t, "Raiding", q.Get("tag"))
		require.Equal(t, "forever.chronicleclassic.com", q.Get("host"))
		require.False(t, q.Has("icon"), "a logo on another host is never sent")
	})

	for name, fault := range map[string]guildOGFaultStore{
		"QueryFails":    {Store: store},
		"QueryTimesOut": {Store: store, block: true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitMedium)
			start := time.Now()
			og := newAPI(fault, true).guildOG(request(ctx), guild.ID.String())
			require.Less(t, time.Since(start), guildOGCardTimeout+2*time.Second)
			require.NotNil(t, og)
			require.Equal(t, wantTitle, og.Title)
			q := imageQuery(t, og.ImageURL)
			require.Equal(t, "Nightfall", q.Get("name"))
			require.Equal(t, realmName, q.Get("realm"))
			// Only the failed page-theme lookup's params are missing.
			require.False(t, q.Has("accent"))
			require.False(t, q.Has("tag"))
		})
	}
}
