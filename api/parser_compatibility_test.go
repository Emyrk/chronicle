package api

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/internal/parseradmission"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParserCompatibilityExactIdentity(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	ParserCompatibility(rec, httptest.NewRequest(http.MethodGet, parseradmission.Path, nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	var response parseradmission.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	identity, err := version.BinaryIdentity()
	require.NoError(t, err)
	require.Equal(t, identity, response.BinaryIdentity)
	require.NotEqual(t, version.ExactParserVersion(), response.BinaryIdentity)
}

func TestParserCompatibilityBypassesTenantAndAuth(t *testing.T) {
	t.Parallel()
	called := false
	handler := parserCompatibilityMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(http.StatusUnauthorized) }))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, parseradmission.Path, nil))
	require.False(t, called)
	require.Equal(t, http.StatusOK, rec.Code)
	other := httptest.NewRecorder()
	handler.ServeHTTP(other, httptest.NewRequest(http.MethodGet, "/api/v1/parser-version", nil))
	require.True(t, called)
	require.Equal(t, http.StatusUnauthorized, other.Code)
}
