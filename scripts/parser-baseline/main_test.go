package main

import (
	"context"
	"encoding/json"
	"github.com/Emyrk/chronicle/chronicle"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestValidateDatabase(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		dsn   string
		valid bool
	}{
		{"postgres://localhost/parser_baseline_before?sslmode=disable", true},
		{"postgres://127.0.0.1/parser_baseline_after?sslmode=disable", true},
		{"postgres://[::1]/parser_baseline_test?sslmode=disable", true},
		{"postgres://localhost/production?sslmode=disable", false},
		{"postgres://example.com/parser_baseline_test?sslmode=disable", false},
		{"postgres://localhost,example.com/parser_baseline_test?sslmode=disable", false},
	} {
		t.Run(tc.dsn, func(t *testing.T) {
			t.Parallel()
			config, err := pgx.ParseConfig(tc.dsn)
			require.NoError(t, err)
			err = validateDatabase(config)
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestFreshArmoryAttestationRequired(t *testing.T) {
	t.Parallel()
	for _, command := range []string{"run", "export"} {
		err := run(context.Background(), []string{command, "--isolated-db", "--args", "nonexistent.json", "--expect-instances", "1"}, io.Discard)
		require.ErrorContains(t, err, "--fresh-armory-seed")
	}
}

func TestEngineRejectedBeforeInputs(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ command, engine, want string }{
		{"run", "typo", "unsupported baseline engine"},
		{"export", "parsernext-vanilla", "not an export"},
	} {
		err := run(t.Context(), []string{tc.command, "--isolated-db", "--fresh-armory-seed", "--args", "nonexistent.json", "--expect-instances", "1", "--engine", tc.engine}, io.Discard)
		require.ErrorContains(t, err, tc.want)
	}
}

func TestProvenanceIsSeparateAndExclusive(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "provenance.json")
	require.NoError(t, writeProvenance(path, chronicle.BaselineParserNextVanilla))
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	var got map[string]string
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, "parsernext-vanilla", got["engine"])
	require.NotEmpty(t, got["revision"])
	require.Error(t, writeProvenance(path, chronicle.BaselineLegacy))
	after, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, raw, after)
}
