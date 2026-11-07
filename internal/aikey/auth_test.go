package aikey

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// fakeStore keeps keys and token buckets in memory. Buckets never refill,
// which makes limits exact in tests.
type fakeStore struct {
	mu      sync.Mutex
	keys    map[string]database.AiKey
	buckets map[string]float64
	touched map[uuid.UUID]database.TouchAIKeyParams
}

func newFakeStore() *fakeStore {
	return &fakeStore{keys: map[string]database.AiKey{}, buckets: map[string]float64{}, touched: map[uuid.UUID]database.TouchAIKeyParams{}}
}

func (s *fakeStore) TakeRateLimitTokens(_ context.Context, arg database.TakeRateLimitTokensParams) (database.TakeRateLimitTokensRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tokens, ok := s.buckets[arg.Key]
	if !ok {
		tokens = arg.Burst
	}
	tokens = min(tokens, arg.Burst)
	allowed := tokens >= arg.Cost
	if allowed {
		tokens -= arg.Cost
	}
	s.buckets[arg.Key] = tokens
	return database.TakeRateLimitTokensRow{Allowed: allowed, Tokens: tokens}, nil
}

func (s *fakeStore) ForceTakeRateLimitTokens(_ context.Context, arg database.ForceTakeRateLimitTokensParams) (float64, error) {
	panic("unused")
}

func (s *fakeStore) PeekRateLimitTokens(_ context.Context, arg database.PeekRateLimitTokensParams) (float64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if tokens, ok := s.buckets[arg.Key]; ok {
		return min(tokens, arg.Burst), nil
	}
	return arg.Burst, nil
}

func (s *fakeStore) GetAIKeyByHashedSecret(_ context.Context, hashed []byte) (database.AiKey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.keys[string(hashed)]
	if !ok {
		return database.AiKey{}, sql.ErrNoRows
	}
	return row, nil
}

func (s *fakeStore) TouchAIKey(_ context.Context, arg database.TouchAIKeyParams) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.touched[arg.ID] = arg
	return nil
}

// addKey stores a key created at created that lasts lifetime and returns its secret.
func (s *fakeStore) addKey(t *testing.T, user, tenant uuid.UUID, created time.Time, lifetime time.Duration, mutate ...func(*database.AiKey)) (string, database.AiKey) {
	t.Helper()
	secret, err := Generate()
	require.NoError(t, err)
	row := database.AiKey{
		ID: uuid.New(), UserID: user,
		TenantID:      uuid.NullUUID{UUID: tenant, Valid: tenant != uuid.Nil},
		TenantScopeID: TenantScope(tenant),
		HashedSecret:  Hash(secret),
		CreatedAt:     database.Timestamptz(created),
		ExpiresAt:     database.Timestamptz(created.Add(lifetime)),
	}
	for _, m := range mutate {
		m(&row)
	}
	s.mu.Lock()
	s.keys[string(row.HashedSecret)] = row
	s.mu.Unlock()
	return secret, row
}

type authFixture struct {
	store  *fakeStore
	auth   *Authenticator
	tenant uuid.UUID
	tiers  sync.Map // user -> tier
	logs   *bytes.Buffer
	now    time.Time
	// seen is the last request the protected handler saw.
	mu   sync.Mutex
	seen *http.Request
}

func newAuthFixture(t *testing.T) *authFixture {
	t.Helper()
	f := &authFixture{store: newFakeStore(), tenant: uuid.New(), logs: &bytes.Buffer{}, now: time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)}
	logger := slog.New(slog.NewTextHandler(&lockedWriter{w: f.logs}, &slog.HandlerOptions{Level: slog.LevelDebug}))
	f.auth = NewAuthenticator(logger, f.store, func(_ context.Context, user uuid.UUID) (string, error) {
		if tier, ok := f.tiers.Load(user); ok {
			return tier.(string), nil
		}
		return billing.TierFree, nil
	})
	f.auth.now = func() time.Time { return f.now }
	return f
}

type lockedWriter struct {
	mu sync.Mutex
	w  *bytes.Buffer
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

// handler stands in for an external API route: it records the request, logs
// its URL the way a careless handler might, and sets a public cache header.
func (f *authFixture) handler(logger *slog.Logger) http.Handler {
	return f.auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.seen = r
		f.mu.Unlock()
		logger.Info("request", slog.String("url", r.URL.String()), slog.String("uri", r.RequestURI))
		w.Header().Set("Cache-Control", "public, max-age=300")
		_, _ = w.Write([]byte("ok " + Link(r.Context(), "https://chronicle.example/next?page=2")))
	}))
}

func (f *authFixture) do(t *testing.T, method, target string, mutate ...func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	req.Header.Set("User-Agent", "ChatGPT-User/1.0")
	for _, m := range mutate {
		m(req)
	}
	req = req.WithContext(servicetenant.WithTenantID(req.Context(), f.tenant))
	rec := httptest.NewRecorder()
	logger := slog.New(slog.NewTextHandler(&lockedWriter{w: f.logs}, nil))
	f.handler(logger).ServeHTTP(rec, req)
	return rec
}

func message(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var resp chroniclesdk.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp), rec.Body.String())
	return resp.Message + " " + resp.CallToAction
}

func TestMiddleware(t *testing.T) {
	t.Parallel()

	t.Run("NoKeyPassesThrough", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		rec := f.do(t, http.MethodPost, "/search?q=x")
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "public, max-age=300", rec.Header().Get("Cache-Control"))
		_, ok := FromContext(f.seen.Context())
		require.False(t, ok)
		require.Equal(t, "ok https://chronicle.example/next?page=2", rec.Body.String())
	})

	t.Run("ValidKey", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		user := uuid.New()
		secret, row := f.store.addKey(t, user, f.tenant, f.now.Add(-time.Hour), 24*time.Hour, func(r *database.AiKey) { r.PrivateData = true })
		rec := f.do(t, http.MethodGet, "/search?q=x&ai_key="+secret)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		key, ok := FromContext(f.seen.Context())
		require.True(t, ok)
		require.Equal(t, row.ID, key.ID)
		require.Equal(t, user, key.UserID)
		require.Equal(t, f.tenant, key.TenantID)
		require.True(t, key.PrivateData)
		require.Equal(t, billing.TierFree, key.Benefits.Tier)
		claims, ok := chronauth.AuthenticatedClaims(f.seen.Context())
		require.True(t, ok)
		require.Equal(t, user, claims.Subject)
		require.Equal(t, row.ID, claims.AIKeyID)

		// The key is gone from the request; links carry it forward.
		require.Equal(t, "q=x", f.seen.URL.RawQuery)
		require.Equal(t, "/search?q=x", f.seen.RequestURI)
		require.Equal(t, "ok https://chronicle.example/next?ai_key="+secret+"&page=2", rec.Body.String())

		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.Equal(t, "no-referrer", rec.Header().Get("Referrer-Policy"))
		require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
		require.Equal(t, "29", rec.Header().Get(ViewsRemainingHeader))
		require.Equal(t, "999", rec.Header().Get(ViewsRemainingTodayHeader))

		touched := f.store.touched[row.ID]
		require.Equal(t, "ChatGPT-User/1.0", touched.LastUserAgent)
	})

	t.Run("RejectedOnNonGET", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		secret, _ := f.store.addKey(t, uuid.New(), f.tenant, f.now, time.Hour)
		for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch} {
			rec := f.do(t, method, "/search?ai_key="+secret)
			require.Equal(t, http.StatusForbidden, rec.Code, method)
			require.Contains(t, message(t, rec), "only on GET")
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		}
		require.Nil(t, f.seen)
	})

	t.Run("Failures", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		user := uuid.New()
		expired, _ := f.store.addKey(t, user, f.tenant, f.now.Add(-2*time.Hour), time.Hour)
		revoked, _ := f.store.addKey(t, user, f.tenant, f.now, time.Hour, func(r *database.AiKey) { r.RevokedAt = database.Timestamptz(f.now) })
		otherTenant, _ := f.store.addKey(t, user, uuid.New(), f.now, time.Hour)
		unknown, err := Generate()
		require.NoError(t, err)

		for name, tc := range map[string]struct{ secret, want string }{
			"Expired":     {expired, "expired"},
			"Revoked":     {revoked, "revoked or replaced"},
			"OtherTenant": {otherTenant, "different Chronicle community"},
			"Unknown":     {unknown, "not valid"},
			"Malformed":   {"ck_nope", "not valid"},
			"Empty":       {"", "not valid"},
		} {
			rec := f.do(t, http.MethodGet, "/search?ai_key="+tc.secret)
			require.Equal(t, http.StatusUnauthorized, rec.Code, name)
			require.Contains(t, message(t, rec), tc.want, name)
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"), name)
		}
		require.Nil(t, f.seen)
		// Expired, revoked and other-community keys are stale links, not
		// guesses, so only the last three were charged to the IP.
		require.Equal(t, InvalidLimit.Burst-3, f.store.buckets[limiterInvalid+":ip:192.0.2.1"])
	})

	t.Run("WrongKeysLimitedPerIP", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		valid, _ := f.store.addKey(t, uuid.New(), f.tenant, f.now, time.Hour)
		from := func(ip string) func(*http.Request) {
			return func(r *http.Request) { r.Header.Set("CF-Connecting-IP", ip) }
		}
		for i := range int(InvalidLimit.Burst) {
			rec := f.do(t, http.MethodGet, "/x?ai_key=ck_wrong", from("198.51.100.7"))
			require.Equal(t, http.StatusUnauthorized, rec.Code, i)
		}
		rec := f.do(t, http.MethodGet, "/x?ai_key=ck_wrong", from("198.51.100.7"))
		require.Equal(t, http.StatusTooManyRequests, rec.Code)
		require.NotEmpty(t, rec.Header().Get("Retry-After"))
		require.Contains(t, message(t, rec), "Too many invalid AI keys")
		// Once blocked, the IP can't try more keys, even real ones.
		rec = f.do(t, http.MethodGet, "/x?ai_key="+valid, from("198.51.100.7"))
		require.Equal(t, http.StatusTooManyRequests, rec.Code)
		// Other clients are unaffected, even behind the same proxy.
		rec = f.do(t, http.MethodGet, "/x?ai_key="+valid, from("198.51.100.8"), func(r *http.Request) {
			r.Header.Set("X-Forwarded-For", "198.51.100.7")
		})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	})

	t.Run("ViewLimitsFollowLiveTier", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		user := uuid.New()
		secret, _ := f.store.addKey(t, user, f.tenant, f.now, time.Hour)
		for i := range 30 {
			rec := f.do(t, http.MethodGet, "/x?ai_key="+secret)
			require.Equal(t, http.StatusOK, rec.Code, i)
		}
		rec := f.do(t, http.MethodGet, "/x?ai_key="+secret)
		require.Equal(t, http.StatusTooManyRequests, rec.Code)
		require.NotEmpty(t, rec.Header().Get("Retry-After"))
		require.Contains(t, message(t, rec), "30 requests a minute")

		// Upgrading raises the limit on the same key once the tier cache
		// expires. The fake bucket doesn't refill, so empty it by hand.
		f.tiers.Store(user, billing.TierHonored)
		f.now = f.now.Add(tierCacheTTL)
		delete(f.store.buckets, limiterViewsMinute+":user:"+user.String())
		for i := range 60 {
			rec := f.do(t, http.MethodGet, "/x?ai_key="+secret)
			require.Equal(t, http.StatusOK, rec.Code, i)
		}
		key, _ := FromContext(f.seen.Context())
		require.Equal(t, billing.TierHonored, key.Benefits.Tier)
		rec = f.do(t, http.MethodGet, "/x?ai_key="+secret)
		require.Equal(t, http.StatusTooManyRequests, rec.Code)
		require.Contains(t, message(t, rec), "Honored tier it may make 60 requests a minute")
	})

	t.Run("DailyCap", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		user := uuid.New()
		secret, _ := f.store.addKey(t, user, f.tenant, f.now, time.Hour)
		f.store.buckets[limiterViewsDay+":user:"+user.String()] = 0
		rec := f.do(t, http.MethodGet, "/x?ai_key="+secret)
		require.Equal(t, http.StatusTooManyRequests, rec.Code)
		require.Equal(t, "87", rec.Header().Get("Retry-After"))
		msg := message(t, rec)
		require.Contains(t, msg, "used its 1000 requests for today at the Free tier")
		require.Contains(t, msg, "Honored supporters get 3000 requests a day")
	})

	t.Run("DowngradeShortensKey", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		user := uuid.New()
		f.tiers.Store(user, billing.TierExalted)
		secret, _ := f.store.addKey(t, user, f.tenant, f.now.Add(-48*time.Hour), 30*24*time.Hour)
		require.Equal(t, http.StatusOK, f.do(t, http.MethodGet, "/x?ai_key="+secret).Code)

		// At the free tier a key lasts at most 24 hours.
		f.tiers.Store(user, billing.TierFree)
		f.now = f.now.Add(tierCacheTTL)
		rec := f.do(t, http.MethodGet, "/x?ai_key="+secret)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
		require.Contains(t, message(t, rec), "expired")
	})

	t.Run("KeyNeverLogged", func(t *testing.T) {
		t.Parallel()
		f := newAuthFixture(t)
		user := uuid.New()
		secret, _ := f.store.addKey(t, user, f.tenant, f.now, time.Hour)
		paths := []string{
			"/x?ai_key=" + secret,
			"/x?a=1&ai_key=" + secret + "&ai_key=" + secret,
			"/x?ai_key=" + secret + "&bad=%zz",
		}
		for _, p := range paths {
			require.Equal(t, http.StatusOK, f.do(t, http.MethodGet, p).Code, p)
		}
		// Error paths log too.
		f.do(t, http.MethodPost, "/x?ai_key="+secret)
		f.store.buckets[limiterViewsMinute+":user:"+user.String()] = 0
		f.do(t, http.MethodGet, "/x?ai_key="+secret)

		require.Contains(t, f.logs.String(), "url=/x")
		require.NotContains(t, f.logs.String(), secret)
		require.NotContains(t, f.logs.String(), strings.TrimPrefix(secret, chroniclesdk.AIKeyPrefix))
		require.NotContains(t, f.logs.String(), "ai_key")
	})
}

func TestTakeKey(t *testing.T) {
	t.Parallel()
	for raw, want := range map[string]struct {
		secret string
		ok     bool
		query  string
	}{
		"q=1":                     {"", false, "q=1"},
		"ai_key=ck_a":             {"ck_a", true, ""},
		"b=2&ai_key=ck_a&a=1":     {"ck_a", true, "a=1&b=2"},
		"ai_key=ck_a&ai_key=ck_b": {"ck_a", true, ""},
		"q=ai_key":                {"", false, "q=ai_key"},
		"ai_key=ck_%zz&q=1":       {"", false, "q=1"},
		"ai_key=":                 {"", true, ""},
	} {
		req := httptest.NewRequest(http.MethodGet, "/p?"+raw, nil)
		secret, ok := takeKey(req)
		require.Equal(t, want.ok, ok, raw)
		require.Equal(t, want.secret, secret, raw)
		require.Equal(t, want.query, req.URL.RawQuery, raw)
		require.NotContains(t, req.RequestURI, "ai_key=", raw)
	}
}

func TestKeyFormat(t *testing.T) {
	t.Parallel()
	a, err := Generate()
	require.NoError(t, err)
	b, err := Generate()
	require.NoError(t, err)
	require.NotEqual(t, a, b)
	require.Len(t, a, len("ck_")+32)
	require.True(t, ValidFormat(a))
	for _, bad := range []string{"", "ck_", "ck_" + strings.Repeat("A", 32), "xx_" + a[3:], a + "0", a[:len(a)-1]} {
		require.False(t, ValidFormat(bad), bad)
	}
	require.Equal(t, Hash(a), Hash(a))
	require.NotEqual(t, Hash(a), Hash(b))
	require.Len(t, Hash(a), 32)
}

func TestLink(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	require.Equal(t, "https://c.example/a?b=1", Link(ctx, "https://c.example/a?b=1"))
	ctx = WithKey(ctx, Key{}, "ck_abc")
	require.Equal(t, "https://c.example/a?ai_key=ck_abc&b=1", Link(ctx, "https://c.example/a?b=1"))
	require.Equal(t, "https://c.example/a?ai_key=ck_abc", Link(ctx, "https://c.example/a?ai_key=old"))
}

func TestClientIP(t *testing.T) {
	t.Parallel()
	req := func(h map[string]string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = "10.0.0.1:1234"
		for k, v := range h {
			r.Header.Set(k, v)
		}
		return r
	}
	require.Equal(t, "10.0.0.1", ClientIP(req(nil)))
	require.Equal(t, "203.0.113.9", ClientIP(req(map[string]string{"X-Forwarded-For": "1.1.1.1, 203.0.113.9"})))
	require.Equal(t, "198.51.100.1", ClientIP(req(map[string]string{"X-Forwarded-For": "1.1.1.1, 203.0.113.9", "CF-Connecting-IP": "198.51.100.1"})))
	require.Equal(t, "10.0.0.1", ClientIP(req(map[string]string{"CF-Connecting-IP": "nope", "X-Forwarded-For": "junk"})))
}

func TestHumanDuration(t *testing.T) {
	t.Parallel()
	require.Equal(t, "1 second", humanDuration(0))
	require.Equal(t, "2 seconds", humanDuration(1500*time.Millisecond))
	require.Equal(t, "3 minutes", humanDuration(150*time.Second))
	require.Equal(t, "2 hours", humanDuration(91*time.Minute))
}
