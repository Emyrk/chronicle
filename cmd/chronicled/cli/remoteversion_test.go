package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

func TestResolveParserVersionURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"simple https", "https://chronicle.example.com", "https://chronicle.example.com/api/v1/parser-version", false},
		{"trailing slash", "https://chronicle.example.com/", "https://chronicle.example.com/api/v1/parser-version", false},
		{"with base path", "https://chronicle.example.com/base/", "https://chronicle.example.com/base/api/v1/parser-version", false},
		{"multiple trailing slashes", "https://chronicle.example.com///", "https://chronicle.example.com/api/v1/parser-version", false},
		{"http", "http://localhost:4000", "http://localhost:4000/api/v1/parser-version", false},
		{"whitespace padded", "  https://chronicle.example.com  ", "https://chronicle.example.com/api/v1/parser-version", false},
		{"query and fragment removed", "https://chronicle.example.com/base?x=1#part", "https://chronicle.example.com/base/api/v1/parser-version", false},
		{"no scheme", "chronicle.example.com", "", true},
		{"empty", "", "", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := resolveParserVersionURL(tc.input)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestCheckRemoteParserVersion_Match(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/v1/parser-version", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(chroniclesdk.ParserVersionResponse{
			Version: version.ExactParserVersion(),
		})
	}))
	defer srv.Close()

	err := checkRemoteParserVersion(context.Background(), srv.URL)
	require.NoError(t, err)
}

func TestCheckRemoteParserVersion_Mismatch(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(chroniclesdk.ParserVersionResponse{
			Version: "v0.0.0+different",
		})
	}))
	defer srv.Close()

	err := checkRemoteParserVersion(context.Background(), srv.URL)
	require.Error(t, err)
	require.Contains(t, err.Error(), "parser version mismatch")
}

func TestCheckRemoteParserVersion_HTTPError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	err := checkRemoteParserVersion(context.Background(), srv.URL)
	require.Error(t, err)
	require.Contains(t, err.Error(), "HTTP 500")
}

func TestCheckRemoteParserVersion_BadJSON(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("not json"))
	}))
	defer srv.Close()

	err := checkRemoteParserVersion(context.Background(), srv.URL)
	require.Error(t, err)
	require.Contains(t, err.Error(), "decode")
}
