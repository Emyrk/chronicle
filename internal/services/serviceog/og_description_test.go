package serviceog

import (
	"context"
	"encoding/json"
	"html"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestOGCountAndClock(t *testing.T) {
	t.Parallel()
	for n, want := range map[int64]string{0: "0", 7: "7", 999: "999", 1000: "1,000", 12345: "12,345", 1234567: "1,234,567"} {
		require.Equal(t, want, ogCount(n))
	}
	for ms, want := range map[int64]string{0: "0:00", 59_000: "0:59", 1_992_000: "33:12", 3_600_000: "1:00:00", 5_233_099: "1:27:13"} {
		require.Equal(t, want, ogClock(ms))
	}
}

func TestGuildOGDescription(t *testing.T) {
	t.Parallel()

	raids := guildOGFixtureRaids()
	when := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	data := guildOGData{
		Guild:   database.GetGuildByIDRow{Name: "Nightfall", RealmName: "Secret Realm"},
		Members: 25,
		Encounters: []database.GuildEncounterKillsRow{
			guildOGKill("Molten Core", "Lucifron", 4, when),
			guildOGKill("Molten Core", "Magmadar", 3, when),
			guildOGKill("Blackwing Lair", "Razorgore the Untamed", 5, when),
		},
		BestRuns: []database.GuildBestRunsRow{{InstanceName: "Blackwing Lair", DurationMs: 1_992_000}},
	}

	t.Run("full", func(t *testing.T) {
		t.Parallel()
		got := guildOGDescription(data, raids, "WoW Forever")
		require.Equal(t, "Nightfall on WoW Forever: 1/2 BWL, 2/2 MC · 12 boss kills · 25 players · best BWL clear 33:12. Raid progression and best clears on Chronicle.", got)
		require.NotContains(t, got, "Secret Realm")
	})
	t.Run("no product", func(t *testing.T) {
		t.Parallel()
		require.True(t, strings.HasPrefix(guildOGDescription(data, raids, ""), "Nightfall: 1/2 BWL"))
	})
	t.Run("members only", func(t *testing.T) {
		t.Parallel()
		got := guildOGDescription(guildOGData{Guild: data.Guild, Members: 1}, raids, "")
		require.Equal(t, "Nightfall: 1 player. Raid progression and best clears on Chronicle.", got)
	})
	t.Run("kills without raid metadata", func(t *testing.T) {
		t.Parallel()
		require.Contains(t, guildOGDescription(data, nil, ""), "12 boss kills")
	})
	t.Run("only three raids lead", func(t *testing.T) {
		t.Parallel()
		many := data
		many.Encounters = append([]database.GuildEncounterKillsRow{
			guildOGKill("Onyxia's Lair", "Onyxia", 1, when),
			guildOGKill("Temple of Ahn'Qiraj", "The Prophet Skeram", 1, when),
		}, data.Encounters...)
		got := guildOGDescription(many, raids, "")
		require.Contains(t, got, "1/9 AQ40, 1/2 BWL, 1/1 Ony")
		require.NotContains(t, got, "MC")
	})
	t.Run("nothing to report falls back", func(t *testing.T) {
		t.Parallel()
		require.Empty(t, guildOGDescription(guildOGData{Guild: data.Guild}, raids, "WoW Forever"))
	})
}

func TestCensusOGDescription(t *testing.T) {
	t.Parallel()

	rows := []database.CensusPlayerCountsRow{
		{Race: database.WowPlayableRaceOrc, Count: 1200},
		{Race: database.WowPlayableRaceTroll, Count: 34},
		{Race: database.WowPlayableRaceHuman, Count: 2345},
	}
	base := "Explore character and population statistics."
	params := censusOGParams(rows, database.WoWFlavor{database.FlavorVanilla})

	require.Equal(t,
		"Horde 1,234 vs Alliance 2,345: characters seen in the last 90 days on WoW Forever. "+base,
		censusOGDescription(params, "WoW Forever", base))
	require.Equal(t,
		"Horde 1,234 vs Alliance 2,345: characters seen in the last 90 days. "+base,
		censusOGDescription(params, "", base))
	require.Empty(t, censusOGDescription(nil, "WoW Forever", base), "no counted faction")
	require.Empty(t, censusOGDescription(url.Values{"horde": {"0"}, "alliance": {"0"}, "days": {"90"}}, "", base))
}

func TestLeaderboardOGFacts(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla}
	facts := func(tab, instance, query string) string {
		q, err := url.ParseQuery(query)
		require.NoError(t, err)
		return leaderboardOGFacts(testPreviews(), flavor, tab, instance, q)
	}

	require.Equal(t, "Naxxramas: Top Peak 97.8 (Ana), top Mastery 82.7 (Cy), fastest clear 1:27:13 (Fast).", facts("", "", ""),
		"the hub lands on the highest-progression raid with leaders")
	require.Equal(t, "Top Peak 97.8 (Ana), top Mastery 82.7 (Cy), fastest clear 1:27:13 (Fast).", facts("", "Naxxramas", ""))
	require.Equal(t, "Top Peak 97.8 (Ana), top Mastery 82.7 (Cy).", facts("ratings", "Naxxramas", ""))
	require.Equal(t, "Fastest full clear 1:27:13 (Fast).", facts("speedruns", "Naxxramas", ""))
	require.Equal(t, "Best single-fight DPS 1,636 (Ek).", facts("performances", "Naxxramas", ""))
	require.Equal(t, "Naxxramas: Fastest full clear 1:27:13 (Fast).", facts("speedruns", "", ""),
		"a landing tab uses the highest-progression raid that has data for it")
	require.Equal(t, "Temple of Ahn'Qiraj: Fastest full clear 1:00:00 (Bugs).", leaderboardOGFacts(testPreviews()[4:], flavor, "speedruns", "", nil))

	// Figures come from the preview's own entries, so another raid's leader never leaks in.
	require.NotContains(t, facts("", "Molten Core", ""), "Ana")
	require.Equal(t, "Top Peak 90.0 (Mo).", facts("ratings", "Molten Core", ""))

	// No card, no figures: unlisted tabs, a raid with no leaders, a raid with no preview, no previews.
	require.Empty(t, facts("statistics", "Naxxramas", ""))
	require.Empty(t, facts("parsing", "", ""))
	require.Empty(t, facts("", "Blackwing Lair", ""))
	require.Empty(t, facts("", "Unknown Raid", ""))
	require.Empty(t, leaderboardOGFacts(nil, flavor, "", "", nil))

	// Realm names never appear.
	for _, tab := range []string{"", "ratings", "speedruns", "performances"} {
		for _, instance := range []string{"", "Naxxramas"} {
			require.NotContains(t, facts(tab, instance, "subject=guild"), "Secret")
			require.NotContains(t, facts(tab, instance, ""), "Secret")
		}
	}
}

func TestInstanceOGDescription(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 1, 2, 20, 0, 0, 0, time.UTC)
	tagline := "Raid performance and contribution analysis tool by Chronicle."
	require.Equal(t, "Jan 2, 2026 · 2h 3m · 40 players · 9 bosses killed\n"+tagline,
		instanceOGDescription(start, 2*time.Hour+3*time.Minute, 40, 9))
	require.Equal(t, "Jan 2, 2026 · 0h 45m · 1 player · 1 boss killed\n"+tagline,
		instanceOGDescription(start, 45*time.Minute, 1, 1))
	// Unknown figures are left out, not printed as zero or as year 1.
	require.Equal(t, "10 players\n"+tagline, instanceOGDescription(time.Time{}, 0, 10, 0))
	require.Equal(t, tagline, instanceOGDescription(time.Time{}, 0, 0, 0))
}

func TestInstanceBossesKilled(t *testing.T) {
	t.Parallel()

	require.Equal(t, 2, instanceBossesKilled([]database.LogInstanceEncounter{
		{Name: "Lucifron", Boss: true, KillType: database.KillTypeClean},
		{Name: "Magmadar", Boss: true, KillType: database.KillTypePartial},
		{Name: "Magmadar", Boss: true, KillType: database.KillTypeClean}, // a repeat kill counts once
		{Name: "Garr", Boss: true, KillType: database.KillTypeWipe},
		{Name: "Trash", Boss: false, KillType: database.KillTypeClean},
	}))
	require.Zero(t, instanceBossesKilled(nil))
}

// descriptionStore answers every lookup a description is built from.
type descriptionStore struct {
	database.Store
	tenantID uuid.UUID
}

func (s descriptionStore) CensusPlayerCounts(context.Context, database.CensusPlayerCountsParams) ([]database.CensusPlayerCountsRow, error) {
	return []database.CensusPlayerCountsRow{
		{Race: database.WowPlayableRaceOrc, Count: 1234},
		{Race: database.WowPlayableRaceHuman, Count: 2345},
	}, nil
}

func (s descriptionStore) ListLeaderboardHighlights(context.Context, database.ListLeaderboardHighlightsParams) ([]database.LeaderboardHighlight, error) {
	payload, err := json.Marshal(testPreviews()[2])
	if err != nil {
		return nil, err
	}
	return []database.LeaderboardHighlight{{TenantID: s.tenantID, InstanceName: "Naxxramas", Payload: payload}}, nil
}

func (s descriptionStore) GetGuildByID(_ context.Context, id uuid.UUID) (database.GetGuildByIDRow, error) {
	return database.GetGuildByIDRow{ID: id, Name: "Nightfall", RealmName: "Secret Realm"}, nil
}
func (s descriptionStore) GetGuildPage(context.Context, uuid.UUID) (database.GuildPage, error) {
	return database.GuildPage{}, pgx.ErrNoRows
}
func (s descriptionStore) CountGuildPlayers(context.Context, uuid.UUID) (int64, error) {
	return 25, nil
}
func (s descriptionStore) GuildEncounterKills(context.Context, uuid.UUID) ([]database.GuildEncounterKillsRow, error) {
	when := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	return []database.GuildEncounterKillsRow{
		guildOGKill("Molten Core", "Lucifron", 4, when),
		guildOGKill("Blackwing Lair", "Razorgore the Untamed", 5, when),
	}, nil
}
func (s descriptionStore) GuildBestRuns(context.Context, database.GuildBestRunsParams) ([]database.GuildBestRunsRow, error) {
	return nil, nil
}

func (s descriptionStore) PublicInstance(context.Context, uuid.UUID) (database.LogInstancesGuild, error) {
	return database.LogInstancesGuild{ID: uuid.New(), Name: "Molten Core", GuildName: pgtype.Text{String: "Nightfall", Valid: true}}, nil
}
func (s descriptionStore) EncountersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounter, error) {
	start := time.Date(2026, 1, 2, 20, 0, 0, 0, time.UTC)
	at := func(m int) pgtype.Timestamptz {
		return pgtype.Timestamptz{Time: start.Add(time.Duration(m) * time.Minute), Valid: true}
	}
	return []database.LogInstanceEncounter{
		{Name: "Lucifron", Boss: true, KillType: database.KillTypeClean, StartTime: at(0), EndTime: at(5)},
		{Name: "Magmadar", Boss: true, KillType: database.KillTypeClean, StartTime: at(30), EndTime: at(36)},
		{Name: "Garr", Boss: true, KillType: database.KillTypeWipe, StartTime: at(60), EndTime: at(63)},
	}, nil
}
func (s descriptionStore) InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error) {
	return make([]database.LogInstancePlayer, 40), nil
}

var metaDescription = regexp.MustCompile(`<meta name="description" content="([^"]*)"`)
var metaOGDescription = regexp.MustCompile(`<meta property="og:description" content="([^"]*)"`)

// TestMetaDescriptionsWithoutJavaScript renders each page type through the real
// frontend handler and index.html, as a crawler's plain GET would see it, and
// checks the description holds numbers from the page's data. The same text is in
// the og:description tag.
func TestMetaDescriptionsWithoutJavaScript(t *testing.T) {
	t.Parallel()

	indexHTML, err := os.ReadFile("../../../frontend/chronicle/index.html")
	require.NoError(t, err)
	siteFS := fstest.MapFS{"index.html": &fstest.MapFile{Data: indexHTML}}
	branding := func(*http.Request) *frontend.HTMLBranding {
		return &frontend.HTMLBranding{Description: "BOILERPLATE"}
	}

	tenant := database.Tenant{ID: uuid.New(), Slug: pgtype.Text{String: "forever", Valid: true}}
	newHandler := func(configured bool) http.Handler {
		opts := Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), descriptionStore{tenantID: tenant.ID})}
		if configured {
			base, err := url.Parse("https://og.example.com/")
			require.NoError(t, err)
			opts.OGServiceURL, opts.OGSigningKey = base, "k"
		}
		return frontend.Handler(siteFS, New(opts).Routes(), branding, nil)
	}
	get := func(handler http.Handler, path string) string {
		req := httptest.NewRequest(http.MethodGet, "https://forever.chronicleclassic.com"+path, nil)
		ctx := servicetenant.WithTenant(testutil.Context(t, testutil.WaitMedium), tenant)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req.WithContext(ctx))
		require.Equal(t, http.StatusOK, rec.Code, path)
		body := rec.Body.String()
		desc := metaDescription.FindStringSubmatch(body)
		og := metaOGDescription.FindStringSubmatch(body)
		require.NotNil(t, desc, path)
		require.NotNil(t, og, path)
		require.Equal(t, desc[1], og[1], "description and og:description agree")
		text := html.UnescapeString(desc[1])
		t.Logf("%-45s %s", path, strings.ReplaceAll(text, "\n", " ⏎ "))
		return text
	}

	configured := newHandler(true)

	guild := get(configured, "/g/"+uuid.NewString())
	require.Contains(t, guild, "Nightfall")
	require.Contains(t, guild, "9 boss kills")
	require.Contains(t, guild, "25 players")
	require.NotContains(t, guild, "Secret Realm")

	census := get(configured, "/census")
	require.Contains(t, census, "Horde 1,234 vs Alliance 2,345")
	require.Contains(t, census, "last 90 days")

	hub := get(configured, "/leaderboards")
	require.Contains(t, hub, "Naxxramas: Top Peak 97.8 (Ana)")
	raidBoard := get(configured, "/leaderboards/Naxxramas/speedruns")
	require.Contains(t, raidBoard, "Fastest full clear 1:27:13 (Fast)")
	require.NotContains(t, hub+raidBoard, "Secret")

	// A raid page's figures come from lookups it already makes, so they appear
	// even with no OG service.
	raid := get(newHandler(false), "/instances/"+uuid.NewString())
	require.Contains(t, raid, "Jan 2, 2026")
	require.Contains(t, raid, "40 players")
	require.Contains(t, raid, "2 bosses killed")

	// With no OG service the generated-card lookups stay off, so guild, census
	// and leaderboard pages keep their existing descriptions.
	plain := newHandler(false)
	require.Equal(t, "Nightfall guild: raid progression and best clears on Chronicle.", get(plain, "/g/"+uuid.NewString()))
	require.NotContains(t, get(plain, "/census"), "Horde")
	require.NotContains(t, get(plain, "/leaderboards/Naxxramas/speedruns"), "1:27:13")
}
