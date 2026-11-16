package main

import (
	"encoding/json"
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
	for _, command := range []string{"export"} {
		err := run(t.Context(), []string{command, "--isolated-db", "--args", "nonexistent.json", "--expect-instances", "1"}, io.Discard)
		require.ErrorContains(t, err, "--fresh-armory-seed")
	}
}

func TestParseRunnerUnavailable(t *testing.T) {
	t.Parallel()
	require.ErrorContains(t, run(t.Context(), []string{"run"}, io.Discard), "usage:")
	require.Error(t, run(t.Context(), []string{"export", "--engine", "legacy"}, io.Discard))
}

func TestProvenanceIsSeparateAndExclusive(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "provenance.json")
	require.NoError(t, writeProvenance(path, exportRequest{ParseGeneration: 1}))
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	var got map[string]any
	require.NoError(t, json.Unmarshal(raw, &got))
	require.NotContains(t, got, "engine")
	require.Contains(t, got, "request")
	require.NotEmpty(t, got["revision"])
	require.Error(t, writeProvenance(path, exportRequest{ParseGeneration: 2}))
	after, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, raw, after)
}

func TestExportRequestValidation(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, input string
		valid       bool
	}{
		{"valid", `{"log_group_id":"11111111-1111-1111-1111-111111111111","parse_generation":1}`, true},
		{"missing", `{}`, false},
		{"null", `null`, false},
		{"generation", `{"log_group_id":"11111111-1111-1111-1111-111111111111","parse_generation":0}`, false},
		{"runner fields", `{"log_group_id":"11111111-1111-1111-1111-111111111111","parse_generation":1,"realm_id":"11111111-1111-1111-1111-111111111111"}`, false},
		{"trailing object", `{"log_group_id":"11111111-1111-1111-1111-111111111111","parse_generation":1}{}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "args.json")
			require.NoError(t, os.WriteFile(path, []byte(tc.input), 0600))
			_, err := readArgs(path)
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
