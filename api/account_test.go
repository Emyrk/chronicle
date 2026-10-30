package api

import (
	"bytes"
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAccountPurgeStatusToken(t *testing.T) {
	t.Parallel()
	token, hash, err := newAccountPurgeToken()
	require.NoError(t, err)
	require.Len(t, token, 64)
	decoded, ok := accountPurgeTokenHash(token)
	require.True(t, ok)
	require.Equal(t, hash, decoded)
	other, _, err := newAccountPurgeToken()
	require.NoError(t, err)
	otherHash, ok := accountPurgeTokenHash(other)
	require.True(t, ok)
	require.False(t, bytes.Equal(hash, otherHash))
	_, ok = accountPurgeTokenHash(token[:63])
	require.False(t, ok)
	_, ok = accountPurgeTokenHash("not-hex")
	require.False(t, ok)
	require.Equal(t, sha256.Size, len(hash))
}

func TestAccountPurgeStatusRejectsMissingToken(t *testing.T) {
	t.Parallel()
	router := chi.NewRouter()
	router.Get("/account-purges/{purgeID}", (&API{}).GetAccountPurgeStatus)
	for _, path := range []string{"/account-purges/invalid", "/account-purges/" + uuid.NewString()} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.JSONEq(t, `{"message":"Purge not found"}`, rec.Body.String())
	}
}
