package chronauth

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/authkeys"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/markbates/goth"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

type testRefreshProvider struct {
	calls     atomic.Int32
	started   chan struct{}
	startOnce sync.Once
	release   <-chan struct{}
}

func (p *testRefreshProvider) Name() string   { return "test" }
func (p *testRefreshProvider) SetName(string) {}
func (p *testRefreshProvider) BeginAuth(string) (goth.Session, error) {
	return nil, errors.ErrUnsupported
}
func (p *testRefreshProvider) UnmarshalSession(string) (goth.Session, error) {
	return nil, errors.ErrUnsupported
}
func (p *testRefreshProvider) FetchUser(goth.Session) (goth.User, error) {
	return goth.User{}, errors.ErrUnsupported
}
func (p *testRefreshProvider) Debug(bool) {}
func (p *testRefreshProvider) RefreshToken(refreshToken string) (*oauth2.Token, error) {
	return p.RefreshTokenContext(context.Background(), refreshToken)
}
func (p *testRefreshProvider) RefreshTokenContext(ctx context.Context, _ string) (*oauth2.Token, error) {
	p.calls.Add(1)
	if p.started != nil {
		p.startOnce.Do(func() { close(p.started) })
	}
	if p.release != nil {
		select {
		case <-p.release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return &oauth2.Token{
		AccessToken:  "new-access-token",
		RefreshToken: "new-refresh-token",
		Expiry:       time.Now().Add(time.Hour),
	}, nil
}
func (p *testRefreshProvider) RefreshTokenAvailable() bool { return true }

func newRefreshTestService(
	t *testing.T,
	poolMaxConns string,
	provider goth.Provider,
	logger *slog.Logger,
) (*Service, database.Store, database.UserAuthSession) {
	t.Helper()

	connectionURL := dbtestutil.NewConnectionURL(t)
	ctx := t.Context()

	migrationPool, err := database.NewPostgresDB(ctx, slog.Default(), connectionURL)
	require.NoError(t, err)
	migrationPool.Close()

	u, err := url.Parse(connectionURL)
	require.NoError(t, err)
	if poolMaxConns != "" {
		query := u.Query()
		query.Set("pool_max_conns", poolMaxConns)
		u.RawQuery = query.Encode()
	}
	pool, err := pgxpool.New(ctx, u.String())
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	store := database.New(pool)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	now := time.Now()
	unique := uuid.NewString()
	user, err := store.InsertUser(ctx, database.InsertUserParams{
		ID:        uuid.New(),
		Username:  "refresh-test-" + unique,
		Email:     "refresh-test-" + unique + "@example.com",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	linked, err := store.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID:        uuid.New(),
		LinkedID:  "refresh-test-" + unique,
		UserID:    user.ID,
		Provider:  "test",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	session, err := store.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
		ID:           uuid.New(),
		UserID:       user.ID,
		UserAuthID:   linked.ID,
		RefreshToken: "refresh-token",
		ExpiresAt:    database.Timestamptz(now.Add(time.Hour)),
		CreatedAt:    database.Timestamptz(now),
		UpdatedAt:    database.Timestamptz(now),
		JwtID:        uuid.New(),
	})
	require.NoError(t, err)

	privateKey, err := authkeys.GenerateKey()
	require.NoError(t, err)
	sessions, err := NewSessions(SessionOptions{SecretPEM: authkeys.MarshalPrivateKey(privateKey)})
	require.NoError(t, err)
	metrics, err := newAuthMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	service := &Service{
		Providers: goth.Providers{"test": provider},
		Store:     testCookieStore(t),
		Zed:       zed,
		logger:    logger,
		sessions:  sessions,
		metrics:   metrics,
	}
	return service, store, session
}

func requireResponseCookie(t *testing.T, recorder *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	t.Fatalf("response did not set cookie %q", name)
	return nil
}

func TestRefreshSessionUsesTransactionConnection(t *testing.T) {
	t.Parallel()

	provider := &testRefreshProvider{}
	service, store, session := newRefreshTestService(t, "1", provider, nil)
	ctx := t.Context()
	req := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	resp := httptest.NewRecorder()
	err := service.RefreshSession(ctx, resp, req, &claims.Claims{
		ID:          session.JwtID,
		SessionID:   session.ID,
		Provider:    "test",
		Refreshable: true,
	})
	require.NoError(t, err)
	require.Equal(t, int32(1), provider.calls.Load())
	require.Equal(t, float64(1), authMetricValue(t, service.metrics.refreshes.WithLabelValues("test", authResultSuccess)))
	updated, err := store.GetUserAuthSessionByID(ctx, session.ID)
	require.NoError(t, err)
	require.Equal(t, "new-refresh-token", updated.RefreshToken)
}

func TestRefreshSessionNoOpDoesNotLogSuccess(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	provider := &testRefreshProvider{}
	service, _, session := newRefreshTestService(t, "", provider, logger)
	currentClaims := &claims.Claims{
		ID:          session.JwtID,
		SessionID:   session.ID,
		Provider:    "test",
		Refreshable: true,
	}

	for range 2 {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		resp := httptest.NewRecorder()
		err := service.RefreshSession(t.Context(), resp, req, currentClaims)
		require.NoError(t, err)
		requireResponseCookie(t, resp, AuthSessionName)
	}

	require.Equal(t, int32(1), provider.calls.Load())
	require.Equal(t, 1, strings.Count(logs.String(), "successfully refreshed session"))
}

func TestRefreshSessionCollapsesConcurrentRequests(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseProvider := func() { releaseOnce.Do(func() { close(release) }) }
	t.Cleanup(releaseProvider)
	provider := &testRefreshProvider{started: started, release: release}
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	service, _, session := newRefreshTestService(t, "", provider, logger)
	currentClaims := &claims.Claims{
		ID:          session.JwtID,
		SessionID:   session.ID,
		Provider:    "test",
		Refreshable: true,
	}

	ctx := testutil.Context(t, testutil.WaitShort)
	const requests = 16
	start := make(chan struct{})
	errs := make(chan error, requests)
	responses := make([]*httptest.ResponseRecorder, requests)
	for i := range requests {
		responses[i] = httptest.NewRecorder()
		go func(resp *httptest.ResponseRecorder) {
			<-start
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			errs <- service.RefreshSession(ctx, resp, req, currentClaims)
		}(responses[i])
	}
	close(start)
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatalf("timed out waiting for the refresh provider: %v", ctx.Err())
	}
	releaseProvider()

	for range requests {
		require.NoError(t, <-errs)
	}
	for _, resp := range responses {
		requireResponseCookie(t, resp, AuthSessionName)
	}
	require.Equal(t, int32(1), provider.calls.Load())
	require.Equal(t, 1, strings.Count(logs.String(), "successfully refreshed session"))
}

func TestRefreshSessionFailureMarksCaller(t *testing.T) {
	t.Parallel()

	provider := &testRefreshProvider{}
	service, _, session := newRefreshTestService(t, "", provider, nil)
	delete(service.Providers, "test")
	currentClaims := &claims.Claims{
		ID:          session.JwtID,
		SessionID:   session.ID,
		Provider:    "test",
		Refreshable: true,
	}
	resp := httptest.NewRecorder()
	err := service.RefreshSession(
		t.Context(),
		resp,
		httptest.NewRequest(http.MethodGet, "/", nil),
		currentClaims,
	)
	require.ErrorContains(t, err, "provider not found")
	require.Equal(t, float64(1), authMetricValue(t, service.metrics.refreshes.WithLabelValues("test", authResultError)))
	cookie := requireResponseCookie(t, resp, RefreshFailedCookieName)
	require.Equal(t, session.ID.String(), cookie.Value)
}

func TestRefreshSessionLeaderCancellationDoesNotCancelWaiters(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseProvider := func() { releaseOnce.Do(func() { close(release) }) }
	t.Cleanup(releaseProvider)
	provider := &testRefreshProvider{started: started, release: release}
	service, _, session := newRefreshTestService(t, "", provider, nil)
	currentClaims := &claims.Claims{
		ID:          session.JwtID,
		SessionID:   session.ID,
		Provider:    "test",
		Refreshable: true,
	}

	leaderCtx, cancelLeader := context.WithCancel(t.Context())
	leaderErr := make(chan error, 1)
	go func() {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		leaderErr <- service.RefreshSession(leaderCtx, httptest.NewRecorder(), req, currentClaims)
	}()

	ctx := testutil.Context(t, testutil.WaitShort)
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatalf("timed out waiting for the refresh provider: %v", ctx.Err())
	}
	cancelLeader()
	require.ErrorIs(t, <-leaderErr, context.Canceled)

	followerResp := httptest.NewRecorder()
	followerErr := make(chan error, 1)
	go func() {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		followerErr <- service.RefreshSession(ctx, followerResp, req, currentClaims)
	}()
	releaseProvider()

	require.NoError(t, <-followerErr)
	requireResponseCookie(t, followerResp, AuthSessionName)
	require.Equal(t, int32(1), provider.calls.Load())
}

//func TestRefreshSQL(t *testing.T) {
//	db, _ := dbtestutil.NewDB(t)
//	ctx := testutil.Context(t, testutil.WaitLong)
//
//	user, err := db.InsertUser(ctx, database.InsertUserParams{
//		ID:       uuid.New(),
//		Username: "test",
//		Email:    "test@test.com",
//	})
//	require.NoError(t, err)
//
//	auth, err := db.InsertUserAuth(ctx, database.InsertUserAuthParams{
//		ID:        uuid.New(),
//		LinkedID:  "linked-id",
//		UserID:    user.ID,
//		Provider:  "discord",
//		CreatedAt: database.Timestamptz(time.Now()),
//		UpdatedAt: database.Timestamptz(time.Now()),
//	})
//	require.NoError(t, err)
//
//	session, err := db.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
//		ID:                uuid.New(),
//		UserID:            user.ID,
//		UserAuthID:        auth.ID,
//		AccessToken:       "",
//		AccessTokenSecret: "",
//		RefreshToken:      "",
//		ExpiresAt:         database.Timestamptz(time.Now()),
//		CreatedAt:         database.Timestamptz(time.Now()),
//		UpdatedAt:         database.Timestamptz(time.Now()),
//	})
//	require.NoError(t, err)
//
//	insertTX := dbtestutil.StartTx(t, db, nil)
//
//	txSession, err := insertTX.GetUserAuthSessionByID(ctx, session.ID)
//	require.NoError(t, err)
//
//	go func() {
//		time.Sleep(time.Second * 4)
//		insertTX.Done()
//	}()
//
//	_, err = db.GetUserAuthSessionByID(ctx, txSession.ID)
//	require.NoError(t, err)
//}
