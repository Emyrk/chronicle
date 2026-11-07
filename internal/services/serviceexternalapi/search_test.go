package serviceexternalapi

import (
	"cmp"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

type searchFixture struct {
	router http.Handler
	tenant uuid.UUID
	realm  string
	runs   []uuid.UUID // Molten Core runs, newest first
	// aiKeys maps a supporter tier to a working AI key whose owner has it.
	aiKeys map[string]string
}

// newSearchFixture seeds one tenant with three Molten Core runs and one
// Onyxia run and mounts the external API at /api/external/v1.
func newSearchFixture(t *testing.T) *searchFixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitLong)
	connURL := dbtestutil.NewConnectionURL(t)

	cfg, err := pgxpool.ParseConfig(connURL)
	require.NoError(t, err)
	cfg.ConnConfig.RuntimeParams["app.tenant_bypass"] = "true"
	seed, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err)
	defer seed.Close()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := seed.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}

	f := &searchFixture{tenant: uuid.New()}
	user, server, realm, guild := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	exec("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", user, "u-"+user.String()[:8], user.String()+"@example.com")
	suffix := realm.String()[:8]
	exec("INSERT INTO tenants (id, name, include_in_all) VALUES ($1, $2, false)", f.tenant, "tenant-"+suffix)
	exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", server, "server-"+suffix, f.tenant)
	f.realm = "Nordanaar-" + suffix
	exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realm, server, f.realm)
	exec("INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, 'Alpha | Omega')", guild, realm)
	t0 := time.Date(2026, 10, 15, 19, 0, 0, 0, time.UTC)
	instance := func(name string, start time.Time) uuid.UUID {
		id, lg := uuid.New(), uuid.New()
		exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at) VALUES ($1, $2, $3, $3)", lg, user, start)
		exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", lg)
		exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, guild_id, start_time, category)
			VALUES ($1, $2, $3, $4, $5, $6, 'raid')`, id, realm, lg, name, guild, start)
		return id
	}
	for i := range 3 {
		f.runs = append(f.runs, instance("Molten Core", t0.Add(-time.Duration(i)*24*time.Hour)))
	}
	instance("Onyxia's Lair", t0)

	// One AI key per tier, each owned by a user at that tier.
	f.aiKeys = map[string]string{}
	tiers := map[uuid.UUID]string{}
	for _, tier := range []string{billing.TierFree, billing.TierHonored} {
		owner := uuid.New()
		exec("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", owner, "k-"+owner.String()[:8], owner.String()+"@example.com")
		secret, err := aikey.Generate()
		require.NoError(t, err)
		exec("INSERT INTO ai_keys (id, user_id, tenant_id, hashed_secret, expires_at) VALUES ($1, $2, $3, $4, now() + interval '1 hour')",
			uuid.New(), owner, f.tenant, aikey.Hash(secret))
		f.aiKeys[tier] = secret
		tiers[owner] = tier
	}
	resolver := func(_ context.Context, user uuid.UUID) (serviceinstancesearch.UserAccess, error) {
		return serviceinstancesearch.AccessForTier(cmp.Or(tiers[user], billing.TierFree)), nil
	}

	// A tenant-scoped store that really goes through RLS, as in production.
	cfg, err = pgxpool.ParseConfig(connURL)
	require.NoError(t, err)
	cfg.ConnConfig.RuntimeParams["app.tenant_id"] = f.tenant.String()
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE chronicle")
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	store := database.New(pool)
	svc := &Service{db: store, search: serviceinstancesearch.New(testutil.Logger(t), store, prometheus.NewRegistry(), resolver)}
	svc.aiKeys = aikey.NewAuthenticator(testutil.Logger(t), store, svc.searchTier)
	svc.setupRoutes()
	router := chi.NewRouter()
	router.Mount("/api/external/v1", svc)
	router.NotFound(svc.MountAgentViews(router, http.NotFoundHandler()).ServeHTTP)
	f.router = router
	return f
}

// get requests path (relative to /api/external/v1, or an absolute URL from a
// response) from ip.
func (f *searchFixture) get(t *testing.T, ip, path string) *httptest.ResponseRecorder {
	t.Helper()
	if !strings.HasPrefix(path, "http") {
		path = "/api/external/v1" + path
	}
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-Forwarded-For", ip)
	ctx := servicetenant.WithTenantID(testutil.Context(t, testutil.WaitMedium), f.tenant)
	rec := httptest.NewRecorder()
	f.router.ServeHTTP(rec, req.WithContext(ctx))
	return rec
}

func searchPath(params ...string) string {
	v := url.Values{}
	for i := 0; i < len(params); i += 2 {
		v.Set(params[i], params[i+1])
	}
	return "/raidlogs/search?" + v.Encode()
}

func decodeSearch(t *testing.T, rec *httptest.ResponseRecorder) SearchResponse {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var resp SearchResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	return resp
}

func resultIDs(resp SearchResponse) []uuid.UUID {
	out := make([]uuid.UUID, len(resp.Results))
	for i, r := range resp.Results {
		out[i] = r.ID
	}
	return out
}

const mcText = `instance.name == "Molten Core"`

func TestSearchGET(t *testing.T) {
	t.Parallel()
	f := newSearchFixture(t)

	t.Run("Text", func(t *testing.T) {
		t.Parallel()
		rec := f.get(t, "192.0.2.1", searchPath("q", mcText))
		resp := decodeSearch(t, rec)
		require.Equal(t, f.runs, resultIDs(resp))
		require.Empty(t, resp.NextCursor)
		require.NotEmpty(t, rec.Header().Get(serviceinstancesearch.CostHeader))
		require.NotEmpty(t, rec.Header().Get("RateLimit-Remaining"))
	})

	t.Run("WhereJSON", func(t *testing.T) {
		t.Parallel()
		resp := decodeSearch(t, f.get(t, "192.0.2.2", searchPath("where", `{"field":"instance.name","op":"=","value":"Molten Core"}`)))
		require.Equal(t, f.runs, resultIDs(resp))
	})

	t.Run("NeitherMatchesAll", func(t *testing.T) {
		t.Parallel()
		resp := decodeSearch(t, f.get(t, "192.0.2.3", searchPath()))
		require.Len(t, resp.Results, 4)
	})

	t.Run("SortAndCursor", func(t *testing.T) {
		t.Parallel()
		first := decodeSearch(t, f.get(t, "192.0.2.4", searchPath("q", mcText, "sort", "instance.started_at", "dir", "asc", "limit", "2")))
		require.Equal(t, []uuid.UUID{f.runs[2], f.runs[1]}, resultIDs(first))
		require.NotEmpty(t, first.NextCursor)
		second := decodeSearch(t, f.get(t, "192.0.2.4", searchPath("q", mcText, "sort", "instance.started_at", "dir", "asc", "limit", "2", "cursor", first.NextCursor)))
		require.Equal(t, []uuid.UUID{f.runs[0]}, resultIDs(second))
		require.Empty(t, second.NextCursor)
	})

	t.Run("Markdown", func(t *testing.T) {
		t.Parallel()
		rec := f.get(t, "192.0.2.5", searchPath("q", mcText, "limit", "2", "format", "md"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "text/markdown; charset=utf-8", rec.Header().Get("Content-Type"))
		body := rec.Body.String()
		require.Contains(t, body, "| Run | Date | Realm | Guild | Bosses killed |")
		require.Contains(t, body, "| [Molten Core](http://example.com/instances/"+f.runs[0].String()+") | 2026-10-15 | Nordanaar-")
		require.Contains(t, body, `Alpha \| Omega`)
		lines := strings.Split(strings.TrimSpace(body), "\n")
		next := lines[len(lines)-1]
		require.True(t, strings.HasPrefix(next, "[Next page](http://example.com/api/external/v1/raidlogs/search?"), next)

		// Following the link gets the last run and no further link.
		rec = f.get(t, "192.0.2.5", strings.TrimSuffix(strings.TrimPrefix(next, "[Next page]("), ")"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), f.runs[2].String())
		require.NotContains(t, rec.Body.String(), "Next page")
	})

	t.Run("AdvancedNeedsLogin", func(t *testing.T) {
		t.Parallel()
		rec := f.get(t, "192.0.2.6", searchPath("q", `players.filter(p, p.class == "PRIEST").size() >= 3`))
		require.Equal(t, http.StatusForbidden, rec.Code)
		require.Contains(t, rec.Body.String(), "Log in to use advanced search")
	})

	t.Run("BadInput", func(t *testing.T) {
		t.Parallel()
		cases := []struct {
			path, message, detail string
		}{
			{searchPath("q", `instance.name == `), "Invalid search text.", "Expected a value (at character 17)"},
			{searchPath("q", `instance.name == "x"`, "where", `{}`), "Use either q or where, not both.", ""},
			{searchPath("where", `{`), "where must be a JSON search tree.", "unexpected end of JSON input"},
			{searchPath("q", `instance.nope == "x"`), "Invalid search.", "instance.nope"},
			{searchPath("limit", "0"), "limit must be a positive integer.", ""},
			{searchPath("cursor", "!!"), "cursor is not valid.", ""},
			{searchPath("format", "xml"), "format must be json or md.", ""},
			{searchPath("q", strings.Repeat("(", searchMaxQueryLen+1)), "The search is too long.", ""},
			{searchPath("q", strings.Repeat("(", 100)), "Invalid search text.", "nested too deeply"},
			{"/raidlogs/search/explain?instance_id=nope", "instance_id must be a run UUID.", ""},
		}
		for _, c := range cases {
			rec := f.get(t, "192.0.2.7", c.path)
			require.Equal(t, http.StatusBadRequest, rec.Code, c.path)
			var resp chroniclesdk.Response
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
			require.Contains(t, resp.Message, c.message, c.path)
			require.Contains(t, resp.Detail, c.detail, c.path)
		}
	})

	t.Run("RateLimited", func(t *testing.T) {
		t.Parallel()
		// The anonymous search bucket (40 tokens) runs out well before the
		// external API's 20-request burst.
		var rec *httptest.ResponseRecorder
		for range externalRateLimitBurst {
			rec = f.get(t, "192.0.2.8", searchPath("q", mcText))
			if rec.Code != http.StatusOK {
				break
			}
		}
		require.Equal(t, http.StatusTooManyRequests, rec.Code, rec.Body.String())
		require.NotEmpty(t, rec.Header().Get("Retry-After"))
		require.Contains(t, rec.Body.String(), "You are searching too quickly")
	})

	t.Run("Fields", func(t *testing.T) {
		t.Parallel()
		rec := f.get(t, "192.0.2.9", "/raidlogs/search/fields")
		require.Equal(t, http.StatusOK, rec.Code)
		var resp chroniclesdk.InstanceSearchFieldsResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.NotEmpty(t, resp.Fields)
		require.Equal(t, 25, resp.AnonymousMaxLimit)
	})

	t.Run("Explain", func(t *testing.T) {
		t.Parallel()
		rec := f.get(t, "192.0.2.10", "/raidlogs/search/explain?"+url.Values{"q": {mcText}, "instance_id": {f.runs[0].String()}}.Encode())
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var resp chroniclesdk.InstanceSearchExplainResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.True(t, resp.Matched)

		rec = f.get(t, "192.0.2.10", "/raidlogs/search/explain?"+url.Values{"q": {`instance.name == "Naxxramas"`}, "instance_id": {f.runs[0].String()}}.Encode())
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.False(t, resp.Matched)
	})
}

func TestSearchGETWithAIKey(t *testing.T) {
	t.Parallel()
	f := newSearchFixture(t)
	free, honored := f.aiKeys[billing.TierFree], f.aiKeys[billing.TierHonored]
	keyed := func(secret string, params ...string) string {
		return searchPath(append(params, "ai_key", secret)...)
	}

	t.Run("LoggedInResults", func(t *testing.T) {
		t.Parallel()
		// Anonymous callers can't use player filters; a key's owner can.
		advanced := `players.filter(p, p.class == "PRIEST").size() >= 3`
		require.Equal(t, http.StatusForbidden, f.get(t, "192.0.2.20", searchPath("q", advanced)).Code)
		rec := f.get(t, "192.0.2.20", keyed(free, "q", advanced))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.NotEmpty(t, rec.Header().Get(serviceinstancesearch.CostHeader))
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.Equal(t, "no-referrer", rec.Header().Get("Referrer-Policy"))
		require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
		require.NotEmpty(t, rec.Header().Get(aikey.ViewsRemainingTodayHeader))
		// The user's search budget (100 burst), not the anonymous one (40).
		require.Equal(t, "100", rec.Header().Get("RateLimit-Limit"))

		resp := decodeSearch(t, f.get(t, "192.0.2.20", keyed(free, "q", mcText)))
		require.Equal(t, f.runs, resultIDs(resp))
	})

	t.Run("ResultsPerSearchFollowsTier", func(t *testing.T) {
		t.Parallel()
		rec := f.get(t, "192.0.2.21", keyed(free, "limit", "26"))
		require.Equal(t, http.StatusForbidden, rec.Code)
		require.Contains(t, rec.Body.String(), "limit can be at most 25 with this AI key")
		require.Equal(t, http.StatusOK, f.get(t, "192.0.2.21", keyed(free, "limit", "25")).Code)
		require.Equal(t, http.StatusOK, f.get(t, "192.0.2.21", keyed(honored, "limit", "100")).Code)
	})

	t.Run("MarkdownLinksKeepKey", func(t *testing.T) {
		t.Parallel()
		rec := f.get(t, "192.0.2.22", keyed(honored, "q", mcText, "limit", "2", "format", "md"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := rec.Body.String()
		require.Contains(t, body, "(http://example.com/instances/"+f.runs[0].String()+"?ai_key="+honored+")")
		next := followLink(t, body, "Next page")
		require.Contains(t, next, "ai_key="+honored)

		// A link-following agent stays keyed on the next page.
		rec = f.get(t, "192.0.2.22", next)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), f.runs[2].String()+"?ai_key="+honored)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})

	t.Run("HonoredFields", func(t *testing.T) {
		t.Parallel()
		parse := `players.exists(p, p.class == "MAGE" && p.parse >= 90)`
		rec := f.get(t, "192.0.2.24", keyed(free, "q", parse))
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Searching by player.parse is an Honored supporter perk.")

		rec = f.get(t, "192.0.2.24", keyed(free, "q", parse, "format", "md"))
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
		require.Equal(t, "text/markdown; charset=utf-8", rec.Header().Get("Content-Type"))
		body := rec.Body.String()
		require.Contains(t, body, "Searching by player.parse is an Honored supporter perk.")
		require.Contains(t, body, "(http://example.com/supporter)")
		require.NotContains(t, body, free)

		rec = f.get(t, "192.0.2.24", "/raidlogs/search/explain?"+url.Values{"q": {parse}, "instance_id": {f.runs[0].String()}, "ai_key": {free}}.Encode())
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Honored supporter perk")

		require.Equal(t, http.StatusOK, f.get(t, "192.0.2.25", keyed(honored, "q", parse)).Code)
	})

	t.Run("MenuHidesHonoredFields", func(t *testing.T) {
		t.Parallel()
		mage := `players.exists(p, p.class == "MAGE")`
		rec := f.get(t, "192.0.2.26", keyed(free, "q", mage, "format", "md"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Same player's role is tank")
		require.NotContains(t, rec.Body.String(), "Same player parsed")
		rec = f.get(t, "192.0.2.27", keyed(honored, "q", mage, "format", "md"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Same player parsed 90+")
	})

	t.Run("Rejected", func(t *testing.T) {
		t.Parallel()
		unknown, err := aikey.Generate()
		require.NoError(t, err)
		rec := f.get(t, "192.0.2.23", keyed(unknown, "q", mcText))
		require.Equal(t, http.StatusUnauthorized, rec.Code)
		require.Contains(t, rec.Body.String(), "not valid")

		req := httptest.NewRequest(http.MethodPost, "/api/external/v1"+keyed(free, "q", mcText), nil)
		w := httptest.NewRecorder()
		f.router.ServeHTTP(w, req.WithContext(servicetenant.WithTenantID(testutil.Context(t, testutil.WaitMedium), f.tenant)))
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Contains(t, w.Body.String(), "only on GET")

		// A key only works in its own community.
		req = httptest.NewRequest(http.MethodGet, "/api/external/v1"+keyed(free, "q", mcText), nil)
		w = httptest.NewRecorder()
		f.router.ServeHTTP(w, req.WithContext(servicetenant.WithTenantID(testutil.Context(t, testutil.WaitMedium), uuid.New())))
		require.Equal(t, http.StatusUnauthorized, w.Code)
		require.Contains(t, w.Body.String(), "different Chronicle community")
	})
}

func TestSearchOpenAPI(t *testing.T) {
	t.Parallel()

	service := &Service{}
	service.setupRoutes()
	for _, path := range []string{"/raidlogs/search", "/raidlogs/search/fields", "/raidlogs/search/explain"} {
		op, ok := service.openapi.Paths[path]["get"]
		require.True(t, ok, path)
		require.Equal(t, []string{"Search"}, op.Tags, path)
		require.Contains(t, op.Responses, "429", path)
	}
	md := service.openapi.Paths["/raidlogs/search"]["get"].Responses["200"].Content["text/markdown"]
	require.NotNil(t, md.Example)
	_, err := json.Marshal(service.openapi)
	require.NoError(t, err)
}

func TestSearchMarkdownEscaping(t *testing.T) {
	t.Parallel()

	r := httptest.NewRequest(http.MethodGet, "/api/external/v1/raidlogs/search?format=md", nil)
	resp := SearchResponse{Results: []chroniclesdk.InstanceSearchResult{{
		ID: uuid.New(), Slug: "run", Name: `Molten Core\]`, RealmName: "<b>realm</b>",
		GuildName: `a\|b \[Click\](https://evil.example) ` + "`x`",
	}}}
	body := searchMarkdown(r, resp)
	row := strings.Split(strings.TrimSpace(body), "\n")[2]
	require.Equal(t, `| [Molten Core\\\]](http://example.com/instances/run) | 0001-01-01 | \<b\>realm\</b\> | a\\\|b \\\[Click\\\](https://evil.example) \`+"`x\\`"+` | 0 |`, row)
	// Unescaped, the row still has exactly six cell separators.
	require.Equal(t, 6, strings.Count(strings.ReplaceAll(strings.ReplaceAll(row, `\\`, ""), `\|`, ""), "|"))
}

func TestRequestOriginScheme(t *testing.T) {
	t.Parallel()

	for proto, want := range map[string]string{
		"":                  "http://example.com",
		"https":             "https://example.com",
		"http, https":       "http://example.com",
		"HTTP":              "http://example.com",
		"javascript":        "https://example.com",
		"data:text/html,x;": "https://example.com",
	} {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		if proto != "" {
			r.Header.Set("X-Forwarded-Proto", proto)
		}
		require.Equal(t, want, requestOrigin(r), proto)
	}
}
