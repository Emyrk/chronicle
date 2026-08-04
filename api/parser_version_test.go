package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

func TestParserVersion(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/parser-version", nil)
	rec := httptest.NewRecorder()
	(&api.API{}).ParserVersion(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp chroniclesdk.ParserVersionResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	require.Equal(t, version.ExactParserVersion(), resp.Version)
	require.NotEmpty(t, resp.Version)
}
