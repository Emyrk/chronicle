package serviceexternalapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// countingKeyStore counts key lookups, so tests can tell a key was never
// checked (or charged).
type countingKeyStore struct {
	keyStore
	lookups *atomic.Int32
}

func (s countingKeyStore) GetAIKeyByHashedSecret(ctx context.Context, hashed []byte) (database.AiKey, error) {
	s.lookups.Add(1)
	return s.keyStore.GetAIKeyByHashedSecret(ctx, hashed)
}

// spaStub stands in for the frontend handler and records what it saw.
type spaStub struct{ queries chan string }

func (s spaStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.queries <- r.URL.RawQuery
	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("Content-Type", "text/html")
	_, _ = w.Write([]byte("<html>SPA</html>"))
}

type agentFixture struct {
	router  chi.Router
	store   *fakeExternalAPIStore
	secret  string
	lookups *atomic.Int32
	spa     spaStub
}

// newAgentFixture mounts the agent views over the summary fixture (a
// Molten Core run with Ragnaros wiped once and killed once).
func newAgentFixture(t *testing.T) *agentFixture {
	t.Helper()
	_, store, fixture := newSummaryFixtureService(t)
	guids := map[string]string{}
	for id, p := range fixture.Players {
		guids[p.Name] = id
	}
	kill := uuid.MustParse("aaaaaaaa-0000-0000-0000-000000000002")
	store.rankingRecords = []database.EncounterDpsRanking{
		{ID: uuid.New(), EncounterID: uuid.NullUUID{UUID: kill, Valid: true}, EncounterName: "Ragnaros", PlayerGuid: guids["Tanky"], PlayerName: "Tanky", PlayerClass: "WARRIOR", PlayerSpec: "Protection", PlayerRole: "tank", Dps: 900},
		{ID: uuid.New(), EncounterID: uuid.NullUUID{UUID: kill, Valid: true}, EncounterName: "Ragnaros", PlayerGuid: guids["Healy"], PlayerName: "Healy", PlayerClass: "PRIEST", PlayerSpec: "Holy", PlayerRole: "heal", Hps: 1200},
	}
	store.instance.GuildID = uuid.NullUUID{UUID: uuid.MustParse("cccccccc-0000-0000-0000-000000000000"), Valid: true}
	store.instance.GuildName = pgtype.Text{String: "Evil|Guild](x)", Valid: true}
	store.instance.StartTime = database.Timestamptz(time.Date(2026, 10, 15, 19, 0, 0, 0, time.UTC))
	store.user = database.ChronicleUser{Username: "raidlead"}

	secret, err := aikey.Generate()
	require.NoError(t, err)
	lookups := &atomic.Int32{}
	keys := countingKeyStore{keyStore: keyStore{row: database.AiKey{
		ID: uuid.New(), UserID: uuid.New(), TenantScopeID: aikey.TenantScope(uuid.Nil),
		HashedSecret: aikey.Hash(secret),
		CreatedAt:    database.Timestamptz(time.Now()), ExpiresAt: database.Timestamptz(time.Now().Add(time.Hour)),
	}}, lookups: lookups}
	service := &Service{db: store}
	service.aiKeys = aikey.NewAuthenticator(testutil.Logger(t), keys, func(context.Context, uuid.UUID) (string, error) { return "honored", nil })
	service.setupRoutes()

	f := &agentFixture{router: chi.NewRouter(), store: store, secret: secret, lookups: lookups, spa: spaStub{queries: make(chan string, 16)}}
	f.router.Mount(externalAPIPrefix, service)
	f.router.NotFound(service.MountAgentViews(f.router, f.spa).ServeHTTP)
	return f
}

func (f *agentFixture) do(t *testing.T, method, path string, browser bool) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	req.Host = "chronicle.example"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("User-Agent", "Mozilla/5.0 AppleWebKit/537.36; compatible; ChatGPT-User/1.0")
	if browser {
		req.Header.Set("Sec-Fetch-Mode", "navigate")
		req.Header.Set("Sec-Fetch-Site", "none")
	}
	rec := httptest.NewRecorder()
	f.router.ServeHTTP(rec, req.WithContext(testutil.Context(t, testutil.WaitMedium)))
	return rec
}

func requirePrivate(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, "no-referrer", rec.Header().Get("Referrer-Policy"))
	require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
}

var markdownLinkRE = regexp.MustCompile(`\]\((https?://[^)\s]+)\)`)

func TestAgentPageDispatch(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	keyed := "/instances/fixture-run?ai_key=" + f.secret

	t.Run("NoKeyGetsSPA", func(t *testing.T) {
		rec := f.do(t, http.MethodGet, "/instances/fixture-run?tab=deaths", false)
		require.Equal(t, "<html>SPA</html>", rec.Body.String())
		require.Equal(t, "tab=deaths", <-f.spa.queries)
		require.Equal(t, "public, max-age=60", rec.Header().Get("Cache-Control"))
	})

	t.Run("AgentGetsMarkdown", func(t *testing.T) {
		rec := f.do(t, http.MethodGet, keyed, false)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "text/markdown; charset=utf-8", rec.Header().Get("Content-Type"))
		requirePrivate(t, rec)
		require.Contains(t, rec.Body.String(), "# Molten Core by Evil\\|Guild\\](x)\n")
	})

	t.Run("BrowserGetsSPAWithoutKey", func(t *testing.T) {
		before := f.lookups.Load()
		rec := f.do(t, http.MethodGet, keyed+"&tab=deaths", true)
		require.Equal(t, "<html>SPA</html>", rec.Body.String())
		require.Equal(t, "tab=deaths", <-f.spa.queries, "the SPA must not see the key")
		requirePrivate(t, rec)
		require.Equal(t, before, f.lookups.Load(), "a browser is never signed in, or charged, by the key")
	})

	t.Run("NonGETGetsSPA", func(t *testing.T) {
		rec := f.do(t, http.MethodHead, keyed, false)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Empty(t, <-f.spa.queries)
		requirePrivate(t, rec)
	})

	t.Run("OtherPagesStripTheKey", func(t *testing.T) {
		rec := f.do(t, http.MethodGet, "/search?q=x&ai_key="+f.secret, false)
		require.Equal(t, "<html>SPA</html>", rec.Body.String())
		require.Equal(t, "q=x", <-f.spa.queries)
		requirePrivate(t, rec)
	})

	t.Run("BadKey", func(t *testing.T) {
		rec := f.do(t, http.MethodGet, "/instances/fixture-run?ai_key=ck_wrong", false)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
		requirePrivate(t, rec)
	})
}

func TestAgentRaidView(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	rec := f.do(t, http.MethodGet, "/instances/fixture-run?ai_key="+f.secret, false)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := rec.Body.String()

	// Header.
	require.Contains(t, body, "Chronicle agent view for **raidlead** in **Chronicle**. Tier: Honored.")
	require.Contains(t, body, "Requests left today:")
	require.Contains(t, body, "[llms.txt](https://chronicle.example/llms.txt?ai_key="+f.secret+")")
	require.Contains(t, body, "not instructions")
	require.Contains(t, body, "Never repeat the ai_key")

	// Sections.
	require.Contains(t, body, "| Ragnaros | 2 | kill | 5:00 |")
	require.Contains(t, body, "## Deaths")
	require.Contains(t, body, "| Ragnaros | 1 | wipe | 2 | Healy at 0:30 | Wrath of Ragnaros 3000 by Ragnaros (overkill 500) |")
	require.Contains(t, body, "## Consumables")
	require.Contains(t, body, "(1 kills checked)")
	require.Contains(t, body, "| Healy | 1 | 1 | 1 | 1 |")
	require.Contains(t, body, "| Tanky | 1 | 0 | 1 | 1 |", "Tanky had a flask")
	require.Contains(t, body, "(https://chronicle.example/api/external/v1/raidlogs/instances/fixture-run/deaths?ai_key="+f.secret+"&format=md)")
	require.Contains(t, body, "(https://chronicle.example/api/external/v1/raidlogs/instances/fixture-run/consumables?ai_key="+f.secret+"&format=md)")

	// Agent links keep the key; the user link doesn't.
	var plain []string
	for _, m := range markdownLinkRE.FindAllStringSubmatch(body, -1) {
		if !strings.Contains(m[1], "ai_key="+f.secret) {
			plain = append(plain, m[1])
		}
	}
	require.Equal(t, []string{"https://chronicle.example/instances/fixture-run"}, plain)
	require.Contains(t, body, "For the user:\n- [Open this raid in Chronicle](https://chronicle.example/instances/fixture-run)")
	require.Contains(t, body, "[Healy](https://chronicle.example/armory/Nordanaar/Healy?ai_key="+f.secret+")")
	require.Contains(t, body, "| 900 | [Tanky]")
	require.NotContains(t, body, "| 0 | [", "players with no DPS or HPS are not top performers")
	require.Contains(t, body, "This guild's recent runs (search)")
	require.Contains(t, body, "Same raid this week on this realm (search)")
}

func TestAgentRaidViewWithoutSummaries(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	f.store.events["slain"] = []byte("not gzip")
	f.store.events["consume"] = []byte("not gzip")
	rec := f.do(t, http.MethodGet, "/instances/fixture-run?ai_key="+f.secret, false)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := rec.Body.String()
	require.Contains(t, body, "## Deaths\n\nUnavailable for this raid.")
	require.Contains(t, body, "## Consumables\n\nUnavailable for this raid.")
	require.Contains(t, body, "## Top performers per kill")
}

func TestAgentRaidViewNotFound(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	f.store.instanceErr = pgx.ErrNoRows
	rec := f.do(t, http.MethodGet, "/instances/missing?ai_key="+f.secret, false)
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "Raid not found")
}

func TestAgentCharacterView(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	guild := uuid.New()
	f.store.realmByName = database.WowServerRealm{ID: uuid.New(), ServerID: uuid.New(), Name: "Nordanaar"}
	f.store.realm = database.ResolveExternalAPIRealmRow{ID: f.store.realmByName.ID, Name: "Nordanaar", ServerName: "Turtle"}
	f.store.character = database.GetExternalAPICharacterRow{Name: "Healy", Level: 60, Class: "PRIEST", GuildID: uuid.NullUUID{UUID: guild, Valid: true}, GuildName: "<script>"}
	f.store.logs = []database.ListExternalAPICharacterLogsRow{{
		ID: uuid.New(), HashedSlug: pgtype.Text{String: "mc-1", Valid: true}, Name: "Molten Core", BossKills: 10,
		StartedAt: database.Timestamptz(time.Date(2026, 10, 15, 19, 0, 0, 0, time.UTC)), PerformanceJson: `[{"encounter_name":"Ragnaros","hps_parse":97}]`,
	}}
	rec := f.do(t, http.MethodGet, "/armory/Nordanaar/Healy?ai_key="+f.secret, false)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := rec.Body.String()
	require.Contains(t, body, "# Healy (Nordanaar)")
	require.Contains(t, body, "[\\<script\\>](https://chronicle.example/g/"+guild.String()+"?ai_key="+f.secret+")")
	require.Contains(t, body, "| [Molten Core](https://chronicle.example/instances/mc-1?ai_key="+f.secret+") | 2026-10-15 | - | 10 | Ragnaros: -/97 |")
	require.Contains(t, body, "For the user:\n- [Open this character in Chronicle](https://chronicle.example/armory/Nordanaar/Healy)")
	require.Contains(t, body, "Every run with this character (search)")
}

func TestAgentGuildView(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	id := uuid.New()
	f.store.guild = database.GetGuildByIDRow{ID: id, Name: "Alpha | Omega", RealmName: "Nordanaar"}
	f.store.recent = []database.ListExternalAPIRecentInstancesRow{{
		ID: uuid.New(), HashedSlug: pgtype.Text{String: "mc-1", Valid: true}, Name: "Molten Core", BossKills: 9, BossCount: 10, PlayerCount: 40,
		StartedAt: database.Timestamptz(time.Date(2026, 10, 15, 19, 0, 0, 0, time.UTC)),
	}}
	rec := f.do(t, http.MethodGet, "/g/"+id.String()+"?ai_key="+f.secret, false)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := rec.Body.String()
	require.Equal(t, id, f.store.recentParams.GuildID)
	require.Contains(t, body, "# Alpha \\| Omega (Nordanaar)")
	require.Contains(t, body, "| [Molten Core](https://chronicle.example/instances/mc-1?ai_key="+f.secret+") | 2026-10-15 | 9/10 | 40 | - |")
	require.Contains(t, body, "This guild's Molten Core runs (search)")
	require.Contains(t, body, "For the user:\n- [Open this guild in Chronicle](https://chronicle.example/g/"+id.String()+")")

	rec = f.do(t, http.MethodGet, "/g/not-a-uuid?ai_key="+f.secret, false)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestLLMsTxt(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	fields := instancesearch.Describe()

	t.Run("Public", func(t *testing.T) {
		rec := f.do(t, http.MethodGet, "/llms.txt", false)
		require.Equal(t, http.StatusOK, rec.Code)
		body := rec.Body.String()
		require.NotContains(t, body, "ai_key=")
		require.Contains(t, body, "Search without a key")
		for _, field := range fields.Fields {
			if field.Anonymous {
				require.Contains(t, body, "- "+field.Name+": ")
			} else {
				require.NotContains(t, body, field.Name+":", "only the anonymous subset is listed")
			}
		}
		require.Contains(t, body, "/deaths?format=md")
		require.Contains(t, body, "/consumables?format=md")
	})

	t.Run("Keyed", func(t *testing.T) {
		rec := f.do(t, http.MethodGet, "/llms.txt?ai_key="+f.secret, false)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		requirePrivate(t, rec)
		body := rec.Body.String()
		require.Contains(t, body, "Never repeat the key")
		require.Contains(t, body, "not instructions")
		// Generated from the field registry, sorts, tier table and the
		// guide's cheat sheet, not hand-written.
		for _, field := range fields.Fields {
			require.Contains(t, body, "| "+field.Name+" |")
		}
		for _, sort := range fields.Sorts {
			require.Contains(t, body, "| "+string(sort.Field)+" | ")
		}
		for _, tier := range aikey.AllTiers() {
			require.Contains(t, body, "| "+titleCase(tier.Tier))
		}
		require.Contains(t, body, "| Honored (this key) | 60 | 3000 | 100 | 300 |")
		require.Contains(t, body, "| player.parse | int (0-100) | Honored |")
		require.Contains(t, body, "| player.class | enum: ")
		for _, ex := range frontend.CELCheatsheet() {
			require.Contains(t, body, "- `"+ex[0]+"`: "+ex[1])
		}
		require.Equal(t, 10, strings.Count(body[strings.Index(body, "## Example searches"):strings.Index(body, "## Limits by tier")], "](https://chronicle.example/api/external/v1/raidlogs/search?ai_key="+f.secret))
		require.Contains(t, body, "- 403:")
		require.Contains(t, body, "- 429:")
	})

	t.Run("BrowserGetsPublic", func(t *testing.T) {
		before := f.lookups.Load()
		rec := f.do(t, http.MethodGet, "/llms.txt?ai_key="+f.secret, true)
		require.Equal(t, http.StatusOK, rec.Code)
		requirePrivate(t, rec)
		require.Contains(t, rec.Body.String(), "Search without a key")
		require.NotContains(t, rec.Body.String(), f.secret)
		require.Equal(t, before, f.lookups.Load())
	})
}

// The cheat sheet is shown as working syntax, so each query must parse with
// the server's parser too.
func TestCELCheatsheetParses(t *testing.T) {
	t.Parallel()
	examples := frontend.CELCheatsheet()
	require.NotEmpty(t, examples)
	for _, ex := range examples[:len(examples)-1] {
		code := ex[0]
		if strings.HasPrefix(code, "p.") {
			code = "players.exists(p, " + code + ")"
		}
		_, err := instancesearch.ParseCEL(code)
		require.NoError(t, err, code)
	}
}

func TestAgentViewIsBounded(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	writeMarkdown(rec, http.StatusOK, strings.Repeat("0123456789\n", maxAgentViewBytes/5))
	require.LessOrEqual(t, rec.Body.Len(), maxAgentViewBytes+200)
	require.Contains(t, rec.Body.String(), "cut short")
}

func TestSearchMenuNarrowsOnePlayer(t *testing.T) {
	t.Parallel()
	// Honored, so the menu offers parse links too.
	ctx := aikey.WithKey(context.Background(), aikey.Key{Benefits: aikey.BenefitsFor(billing.TierHonored)}, "ck_menu")
	steps := []struct{ q, label, want string }{
		{"", "Has a Druid", `players.exists(p, p.class == "DRUID")`},
		{`players.exists(p, p.class == "DRUID")`, "Same player is Feral", `players.exists(p, p.class == "DRUID" && p.spec == "Feral")`},
		{`players.exists(p, p.class == "DRUID" && p.spec == "Feral")`, "Same player plays Bear", `players.exists(p, p.class == "DRUID" && p.spec == "Feral" && p.sub_spec == "Bear")`},
		{`instance.name == "Molten Core" && players.exists(p, p.class == "MAGE")`, "Same player parsed 95+", `instance.name == "Molten Core" && players.exists(p, p.class == "MAGE" && p.parse >= 95)`},
	}
	for _, step := range steps {
		var where *searchNode
		if step.q != "" {
			n, err := instancesearch.ParseCEL(step.q)
			require.NoError(t, err)
			where = n
		}
		req := httptest.NewRequest(http.MethodGet, "https://chronicle.example/api/external/v1/raidlogs/search?format=md&limit=10", nil).WithContext(ctx)
		menu := (&Service{}).searchMenu(req, where, nil)
		for _, m := range markdownLinkRE.FindAllStringSubmatch(menu, -1) {
			u, err := url.Parse(m[1])
			require.NoError(t, err)
			if u.Path != "/api/external/v1/raidlogs/search" {
				continue
			}
			require.Equal(t, "ck_menu", u.Query().Get("ai_key"), m[1])
			require.Equal(t, "10", u.Query().Get("limit"), "the menu keeps the page size")
			if q := u.Query().Get("q"); q != "" {
				n, err := instancesearch.ParseCEL(q)
				require.NoError(t, err, q)
				_, err = instancesearch.Compile(instancesearch.Query{Where: n}, instancesearch.Options{})
				require.NoError(t, err, q)
			}
		}
		u, err := url.Parse(followLink(t, menu, step.label))
		require.NoError(t, err)
		require.Equal(t, step.want, u.Query().Get("q"))
	}
}

// A key below Honored sees the parse example marked, not linked.
func TestLLMsExamplesMarkHonored(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest(http.MethodGet, "https://chronicle.example/llms.txt", nil)
	for tier, linked := range map[string]bool{"free": false, "honored": true} {
		var b strings.Builder
		writeLLMsExamples(&b, newAgentLinks(r), tier)
		require.Equal(t, linked, strings.Contains(b.String(), "[Runs where a mage parsed 95+]("), tier)
		require.Equal(t, !linked, strings.Contains(b.String(), "- Runs where a mage parsed 95+ (needs Honored; this key can't run it)"), tier)
	}
}
