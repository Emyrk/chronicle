package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func newInstanceSearchAPI(t *testing.T) (*API, *prometheus.Registry) {
	t.Helper()
	db, _ := dbtestutil.NewDB(t)
	registry := prometheus.NewRegistry()
	return &API{instanceSearch: serviceinstancesearch.New(testutil.Logger(t), db, registry, nil)}, registry
}

// doSearch posts body as the given user (uuid.Nil = anonymous) from ip.
func doSearch(t *testing.T, api *API, user uuid.UUID, ip, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/raidlogs/search", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", ip)
	ctx := testutil.Context(t, testutil.WaitMedium)
	if user != uuid.Nil {
		ctx = chronauth.WithClaims(ctx, &claims.Claims{Subject: user})
	}
	rec := httptest.NewRecorder()
	api.InstanceSearch(rec, req.WithContext(ctx))
	return rec
}

const (
	simpleSearch   = `{"where": {"field": "instance.name", "op": "=", "value": "Molten Core"}}`
	advancedSearch = `{"where": {"count_players": {"where": {"field": "player.class", "op": "=", "value": "PRIEST"}, "op": ">=", "value": 3}}}`
)

func TestInstanceSearch(t *testing.T) {
	t.Parallel()

	t.Run("AnonymousSimple", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		rec := doSearch(t, api, uuid.Nil, "10.0.0.1", simpleSearch)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var page chroniclesdk.InstanceSearchResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &page))
		require.NotNil(t, page.Results)
	})

	t.Run("AnonymousAdvancedNeedsLogin", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		rec := doSearch(t, api, uuid.Nil, "10.0.0.1", advancedSearch)
		require.Equal(t, http.StatusForbidden, rec.Code)
		require.Contains(t, rec.Body.String(), "Log in to use advanced search")
	})

	t.Run("LoggedInAdvanced", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		rec := doSearch(t, api, uuid.New(), "10.0.0.1", advancedSearch)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	})

	t.Run("SortTierRequirements", func(t *testing.T) {
		t.Parallel()
		for _, tc := range []struct {
			name      string
			user      uuid.UUID
			tier      string
			field     string
			boss      string
			status    int
			wantError string
		}{
			{name: "AnonymousFree", field: "instance.name", status: http.StatusOK},
			{name: "Free", user: uuid.New(), tier: "free", field: "instance.name", status: http.StatusOK},
			{name: "FreeNeedsHonored", user: uuid.New(), tier: "free", field: "instance.clear_time_ms", status: http.StatusForbidden, wantError: "Honored supporter perk"},
			{name: "HonoredIdleTime", user: uuid.New(), tier: "honored", field: "instance.idle_time_ms", status: http.StatusOK},
			{name: "HonoredKillTime", user: uuid.New(), tier: "honored", field: "instance.kill_time_ms", boss: "Ragnaros", status: http.StatusOK},
			{name: "HonoredNeedsReveredDeaths", user: uuid.New(), tier: "honored", field: "instance.deaths", status: http.StatusForbidden, wantError: "Revered supporter perk"},
			{name: "Honored", user: uuid.New(), tier: "honored", field: "instance.clear_time_ms", status: http.StatusOK},
			{name: "Revered", user: uuid.New(), tier: "revered", field: "instance.deaths", status: http.StatusOK},
			{name: "Exalted", user: uuid.New(), tier: "exalted", field: "instance.deaths", status: http.StatusOK},
		} {
			t.Run(tc.name, func(t *testing.T) {
				t.Parallel()
				api, _ := newInstanceSearchAPI(t)
				api.instanceSearch.SetUserAccessResolver(func(context.Context, uuid.UUID) (serviceinstancesearch.UserAccess, error) {
					return serviceinstancesearch.AccessForTier(tc.tier), nil
				})
				body := `{"sort": {"field": "` + tc.field + `"`
				if tc.boss != "" {
					body += `, "boss": "` + tc.boss + `"`
				}
				body += `}}`
				rec := doSearch(t, api, tc.user, "10.0.0.1", body)
				require.Equal(t, tc.status, rec.Code, rec.Body.String())
				if tc.wantError != "" {
					require.Contains(t, rec.Body.String(), tc.wantError)
				}
			})
		}
	})

	t.Run("Invalid", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		rec := doSearch(t, api, uuid.New(), "10.0.0.1", `{"where": {"field": "instance.nope", "op": "=", "value": 1}}`)
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), `unknown field \"instance.nope\"`)
	})

	t.Run("AnonymousRateLimitedPerIP", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		var rec *httptest.ResponseRecorder
		for range 40 {
			rec = doSearch(t, api, uuid.Nil, "10.0.0.2", simpleSearch)
			if rec.Code == http.StatusTooManyRequests {
				break
			}
			require.Equal(t, http.StatusOK, rec.Code)
		}
		require.NotNil(t, rec)
		require.Equal(t, http.StatusTooManyRequests, rec.Code)
		require.NotEmpty(t, rec.Header().Get("Retry-After"))
		// Other IPs have their own bucket.
		require.Equal(t, http.StatusOK, doSearch(t, api, uuid.Nil, "10.0.0.3", simpleSearch).Code)
	})

	t.Run("TooComplex", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		preds := make([]string, 40)
		for i := range preds {
			preds[i] = `{"field": "instance.idle_time_ms", "op": "<", "value": 1}`
		}
		rec := doSearch(t, api, uuid.New(), "10.0.0.1", `{"where": {"and": [`+strings.Join(preds, ",")+`]}}`)
		require.Equal(t, http.StatusTooManyRequests, rec.Code)
		require.Contains(t, rec.Body.String(), "too complex")
	})

	t.Run("BusyRefunds", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		for range cap(api.instanceSearch.Slots()) {
			api.instanceSearch.Slots() <- struct{}{}
		}
		rec := doSearch(t, api, uuid.New(), "10.0.0.1", simpleSearch)
		require.Equal(t, http.StatusServiceUnavailable, rec.Code)
		require.Empty(t, rec.Header().Get(InstanceSearchRuntimeCostHeader))
		// The search never ran, so the bucket is full again.
		require.Equal(t, "100", rec.Header().Get("RateLimit-Remaining"))
	})

	// Every response reports the bucket; every response for a query that
	// compiled reports its cost.
	t.Run("HeadersAlwaysPresent", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		user := uuid.New()
		heavy := make([]string, 40)
		for i := range heavy {
			heavy[i] = `{"field": "instance.idle_time_ms", "op": "<", "value": 1}`
		}

		cases := []struct {
			name     string
			user     uuid.UUID
			body     string
			status   int
			wantCost string
		}{
			{"BadJSON", user, `{not json`, http.StatusBadRequest, ""},
			{"Invalid", user, `{"where": {"field": "instance.nope", "op": "=", "value": 1}}`, http.StatusBadRequest, ""},
			{"OK", user, simpleSearch, http.StatusOK, "3"},
			{"LoginRequired", uuid.Nil, advancedSearch, http.StatusForbidden, "13"},
			{"TooComplex", user, `{"where": {"and": [` + strings.Join(heavy, ",") + `]}}`, http.StatusTooManyRequests, "801"},
		}
		for _, tc := range cases {
			rec := doSearch(t, api, tc.user, "10.0.0.9", tc.body)
			require.Equal(t, tc.status, rec.Code, tc.name)
			require.NotEmpty(t, rec.Header().Get("RateLimit-Limit"), tc.name)
			require.NotEmpty(t, rec.Header().Get("RateLimit-Remaining"), tc.name)
			require.NotEmpty(t, rec.Header().Get("RateLimit-Reset"), tc.name)
			require.Equal(t, tc.wantCost, rec.Header().Get(InstanceSearchCostHeader), tc.name)
			if tc.name == "OK" {
				require.NotEmpty(t, rec.Header().Get(InstanceSearchRuntimeCostHeader))
			} else {
				require.Empty(t, rec.Header().Get(InstanceSearchRuntimeCostHeader))
			}
		}

		// Only the successful search spent tokens: 3 static plus runtime.
		rec := doSearch(t, api, user, "10.0.0.9", `{not json`)
		remaining := mustAtoi(t, rec.Header().Get("RateLimit-Remaining"))
		require.GreaterOrEqual(t, remaining, 90)
		require.LessOrEqual(t, remaining, 96)
	})

	t.Run("LimitEndpoint", func(t *testing.T) {
		t.Parallel()
		api, _ := newInstanceSearchAPI(t)
		user := uuid.New()
		get := func(user uuid.UUID) chroniclesdk.InstanceSearchLimitResponse {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/raidlogs/search/limit", nil)
			req.Header.Set("X-Forwarded-For", "10.0.0.8")
			ctx := testutil.Context(t, testutil.WaitShort)
			if user != uuid.Nil {
				ctx = chronauth.WithClaims(ctx, &claims.Claims{Subject: user})
			}
			rec := httptest.NewRecorder()
			api.InstanceSearchLimit(rec, req.WithContext(ctx))
			require.Equal(t, http.StatusOK, rec.Code)
			require.NotEmpty(t, rec.Header().Get("RateLimit-Remaining"))
			var out chroniclesdk.InstanceSearchLimitResponse
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
			return out
		}

		fresh := get(user)
		require.True(t, fresh.LoggedIn)
		require.Equal(t, 100.0, fresh.Limit)
		require.Equal(t, 100.0, fresh.Remaining)
		require.InDelta(t, 60, fresh.RefillPerMinute, 0.001)
		require.EqualValues(t, 0, fresh.ResetSeconds)

		searchRec := doSearch(t, api, user, "10.0.0.8", advancedSearch)
		require.Equal(t, http.StatusOK, searchRec.Code)
		runtimeCost := mustAtoi(t, searchRec.Header().Get(InstanceSearchRuntimeCostHeader))
		after := get(user)
		require.InDelta(t, 100-13-runtimeCost, after.Remaining, 0.5)
		require.Positive(t, after.ResetSeconds)
		// Peeking does not spend.
		require.InDelta(t, after.Remaining, get(user).Remaining, 0.5)

		anon := get(uuid.Nil)
		require.False(t, anon.LoggedIn)
		require.Equal(t, 40.0, anon.Limit)
	})

	t.Run("Metrics", func(t *testing.T) {
		t.Parallel()
		api, registry := newInstanceSearchAPI(t)
		require.Equal(t, http.StatusOK, doSearch(t, api, uuid.New(), "10.0.0.1", advancedSearch).Code)
		require.Equal(t, http.StatusForbidden, doSearch(t, api, uuid.Nil, "10.0.0.1", advancedSearch).Code)

		families, err := registry.Gather()
		require.NoError(t, err)
		series := map[string]int{}
		var priestUses float64
		for _, mf := range families {
			series[mf.GetName()] = len(mf.GetMetric())
			if mf.GetName() != "chronicle_instance_search_field_uses_total" {
				continue
			}
			for _, m := range mf.GetMetric() {
				if m.GetLabel()[0].GetValue() == "player.class" {
					priestUses = m.GetCounter().GetValue()
				}
			}
		}
		require.Equal(t, float64(1), priestUses)
		// ok/user and login_required/anon.
		require.Equal(t, 2, series["chronicle_instance_search_duration_seconds"])
	})
}

func TestInstanceSearchSupporterLimits(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		tier  string
		burst float64
	}{
		{tier: "free", burst: 100},
		{tier: "honored", burst: 300},
		{tier: "revered", burst: 800},
		{tier: "exalted", burst: 2000},
		{tier: "unknown", burst: 100},
	} {
		t.Run(tc.tier, func(t *testing.T) {
			t.Parallel()
			limit := serviceinstancesearch.LimitForTier(tc.tier)
			require.Equal(t, tc.burst, limit.Burst)
			require.InDelta(t, 60, limit.PerSecond*60, 0.001)

			api, _ := newInstanceSearchAPI(t)
			api.instanceSearch.SetUserAccessResolver(func(context.Context, uuid.UUID) (serviceinstancesearch.UserAccess, error) {
				return serviceinstancesearch.UserAccess{Limit: limit, Tier: tc.tier}, nil
			})
			req := httptest.NewRequest(http.MethodGet, "/api/v1/raidlogs/search/limit", nil)
			ctx := chronauth.WithClaims(testutil.Context(t, testutil.WaitShort), &claims.Claims{Subject: uuid.New()})
			rec := httptest.NewRecorder()
			api.InstanceSearchLimit(rec, req.WithContext(ctx))
			require.Equal(t, http.StatusOK, rec.Code)

			var out chroniclesdk.InstanceSearchLimitResponse
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
			require.Equal(t, tc.burst, out.Limit)
			require.Equal(t, tc.burst, out.Remaining)
			require.Equal(t, tc.burst, float64(mustAtoi(t, rec.Header().Get("RateLimit-Limit"))))
		})
	}
}

func mustAtoi(t *testing.T, value string) int {
	t.Helper()
	n, err := strconv.Atoi(value)
	require.NoError(t, err)
	return n
}

func TestInstanceSearchMalformedBodyTierFailure(t *testing.T) {
	t.Parallel()
	for _, explain := range []bool{false, true} {
		t.Run(strconv.FormatBool(explain), func(t *testing.T) {
			t.Parallel()
			api, _ := newInstanceSearchAPI(t)
			api.instanceSearch.SetUserAccessResolver(func(context.Context, uuid.UUID) (serviceinstancesearch.UserAccess, error) {
				return serviceinstancesearch.UserAccess{}, errors.New("supporter authorization unavailable")
			})
			user := uuid.New()
			var rec *httptest.ResponseRecorder
			if explain {
				rec = doExplain(t, api, user, "{")
			} else {
				rec = doSearch(t, api, user, "10.0.0.1", "{")
			}
			require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), "Search is unavailable right now")
			require.Empty(t, rec.Header().Get("RateLimit-Remaining"))
		})
	}
}

func doExplain(t *testing.T, api *API, user uuid.UUID, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/raidlogs/search/explain", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "10.0.0.9")
	ctx := testutil.Context(t, testutil.WaitMedium)
	if user != uuid.Nil {
		ctx = chronauth.WithClaims(ctx, &claims.Claims{Subject: user})
	}
	rec := httptest.NewRecorder()
	api.InstanceSearchExplain(rec, req.WithContext(ctx))
	return rec
}

// Evidence itself is covered against real runs in internal/instancesearch;
// these cover the HTTP rules. No run exists here, so allowed requests 404.
func TestInstanceSearchExplain(t *testing.T) {
	t.Parallel()
	body := func(query string) string {
		return `{"instance_id": "` + uuid.NewString() + `", "query": ` + query + `}`
	}

	cases := []struct {
		name   string
		user   uuid.UUID
		body   string
		status int
		want   string
		// Explain costs 1 + search cost / 4: advancedSearch 13 -> 4, simpleSearch 3 -> 1.
		cost string
	}{
		{"UnknownRun", uuid.New(), body(advancedSearch), http.StatusNotFound, "Run not found", "4"},
		{"AnonymousSimple", uuid.Nil, body(simpleSearch), http.StatusNotFound, "Run not found", "1"},
		{"AnonymousAdvancedNeedsLogin", uuid.Nil, body(advancedSearch), http.StatusForbidden, "Log in", "4"},
		{"Invalid", uuid.New(), body(`{"where": {"field": "instance.nope", "op": "=", "value": 1}}`), http.StatusBadRequest, "unknown field", ""},
		{"BadJSON", uuid.New(), `{`, http.StatusBadRequest, "valid JSON", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			api, _ := newInstanceSearchAPI(t)
			rec := doExplain(t, api, tc.user, tc.body)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), tc.want)
			require.Equal(t, tc.cost, rec.Header().Get("Chronicle-Search-Cost"))
			require.NotEmpty(t, rec.Header().Get("RateLimit-Remaining"))
		})
	}
}

// Internal and HTTP searches share the same per-user bucket and per-replica slots.
func TestInstanceSearchInternalHTTPParity(t *testing.T) {
	t.Parallel()
	api, _ := newInstanceSearchAPI(t)
	user := uuid.New()
	caller := serviceinstancesearch.Caller{UserID: user}
	ctx := testutil.Context(t, testutil.WaitMedium)
	_, result := api.instanceSearch.Search(ctx, caller, chroniclesdk.InstanceSearchQuery{})
	require.NoError(t, result.Err)
	require.Equal(t, 1, result.Cost)
	rec := doSearch(t, api, user, "10.0.0.1", simpleSearch)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "3", rec.Header().Get(InstanceSearchCostHeader))
	require.NotEmpty(t, rec.Header().Get(InstanceSearchRuntimeCostHeader))
	remaining := mustAtoi(t, rec.Header().Get("RateLimit-Remaining"))
	require.GreaterOrEqual(t, remaining, 90)
	require.LessOrEqual(t, remaining, 100)
	for range cap(api.instanceSearch.Slots()) {
		api.instanceSearch.Slots() <- struct{}{}
	}
	rec = doSearch(t, api, user, "10.0.0.1", simpleSearch)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	after := mustAtoi(t, rec.Header().Get("RateLimit-Remaining"))
	require.GreaterOrEqual(t, after, remaining)
	require.LessOrEqual(t, after, 100)
}
