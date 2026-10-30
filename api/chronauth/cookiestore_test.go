package chronauth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/sessions"
	"github.com/stretchr/testify/require"
)

func testCookieStore(t testing.TB) *sessions.CookieStore {
	t.Helper()
	store, err := newCookieStore(false, []byte("test jwt secret"))
	require.NoError(t, err)
	return store
}

// TestCookieStoreKeys checks that cookies are bound to the JWT secret: a
// cookie made with the old public key, or another secret, is rejected.
func TestCookieStoreKeys(t *testing.T) {
	t.Parallel()

	_, err := newCookieStore(false, nil)
	require.Error(t, err)

	save := func(store *sessions.CookieStore) []*http.Cookie {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		sess, err := store.New(req, LinkSessionName)
		require.NoError(t, err)
		sess.Values["user_id"] = "forged"
		require.NoError(t, sess.Save(req, rec))
		return rec.Result().Cookies()
	}
	load := func(store *sessions.CookieStore, cookies []*http.Cookie) error {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		for _, c := range cookies {
			req.AddCookie(c)
		}
		_, err := store.New(req, LinkSessionName)
		return err
	}

	store := testCookieStore(t)
	require.NoError(t, load(store, save(store)))
	require.Error(t, load(store, save(newLegacyCookieStore(false))), "old public key must not be accepted")
	other, err := newCookieStore(false, []byte("another secret"))
	require.NoError(t, err)
	require.Error(t, load(store, save(other)))
}

// TestAuthSessionMigratesLegacyCookie keeps users signed in across the key
// change: an old session cookie is read once and re-saved with the new key.
func TestAuthSessionMigratesLegacyCookie(t *testing.T) {
	t.Parallel()

	legacy := newLegacyCookieStore(false)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	old, err := legacy.New(req, AuthSessionName)
	require.NoError(t, err)
	old.Values["jwt"] = "signed-jwt"
	require.NoError(t, old.Save(req, rec))

	s := &Service{Store: testCookieStore(t), legacyStore: legacy}
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	for _, c := range rec.Result().Cookies() {
		req.AddCookie(c)
	}
	rec = httptest.NewRecorder()
	auth, err := s.authSession(rec, req)
	require.NoError(t, err)
	require.Equal(t, "signed-jwt", auth.Values["jwt"])

	// The re-saved cookie decodes with the current key alone.
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	for _, c := range rec.Result().Cookies() {
		req.AddCookie(c)
	}
	current, err := s.Store.New(req, AuthSessionName)
	require.NoError(t, err)
	require.Equal(t, "signed-jwt", current.Values["jwt"])
}
