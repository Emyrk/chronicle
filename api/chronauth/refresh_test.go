package chronauth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/authkeys"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/markbates/goth"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

type testRefreshProvider struct{}

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
func (p *testRefreshProvider) RefreshToken(string) (*oauth2.Token, error) {
	return &oauth2.Token{
		AccessToken:  "new-access-token",
		RefreshToken: "new-refresh-token",
		Expiry:       time.Now().Add(time.Hour),
	}, nil
}
func (p *testRefreshProvider) RefreshTokenAvailable() bool { return true }

func TestRefreshSessionUsesTransactionConnection(t *testing.T) {
	t.Parallel()

	connectionURL := dbtestutil.NewConnectionURL(t)
	ctx := t.Context()

	migrationPool, err := database.NewPostgresDB(ctx, slog.Default(), connectionURL)
	require.NoError(t, err)
	migrationPool.Close()

	u, err := url.Parse(connectionURL)
	require.NoError(t, err)
	query := u.Query()
	query.Set("pool_max_conns", "1")
	u.RawQuery = query.Encode()
	pool, err := pgxpool.New(ctx, u.String())
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	store := database.New(pool)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	now := time.Now()
	user, err := store.InsertUser(ctx, database.InsertUserParams{
		ID:        uuid.New(),
		Username:  "refresh-test",
		Email:     "refresh-test@example.com",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	linked, err := store.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID:        uuid.New(),
		LinkedID:  "refresh-test",
		UserID:    user.ID,
		Provider:  "test",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	jwtID := uuid.New()
	session, err := store.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
		ID:           uuid.New(),
		UserID:       user.ID,
		UserAuthID:   linked.ID,
		RefreshToken: "refresh-token",
		ExpiresAt:    database.Timestamptz(now.Add(time.Hour)),
		CreatedAt:    database.Timestamptz(now),
		UpdatedAt:    database.Timestamptz(now),
		JwtID:        jwtID,
	})
	require.NoError(t, err)

	privateKey, err := authkeys.GenerateKey()
	require.NoError(t, err)
	sessions, err := NewSessions(SessionOptions{SecretPEM: authkeys.MarshalPrivateKey(privateKey)})
	require.NoError(t, err)
	service := &Service{
		Providers: goth.Providers{"test": &testRefreshProvider{}},
		Store:     newCookieStore(false),
		Zed:       zed,
		logger:    slog.Default(),
		sessions:  sessions,
	}
	refreshCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(refreshCtx)
	resp := httptest.NewRecorder()
	err = service.RefreshSession(refreshCtx, resp, req, &claims.Claims{
		ID:          jwtID,
		SessionID:   session.ID,
		Provider:    "test",
		Refreshable: true,
	})
	require.NoError(t, err)
	require.NoError(t, refreshCtx.Err(), "refresh deadlocked waiting for a second pool connection")
	updated, err := store.GetUserAuthSessionByID(ctx, session.ID)
	require.NoError(t, err)
	require.Equal(t, "new-refresh-token", updated.RefreshToken)
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
