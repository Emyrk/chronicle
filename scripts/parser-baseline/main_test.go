package main

import (
	"context"
	"io"
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
