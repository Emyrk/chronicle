package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRequiredConfiguration(t *testing.T) {
	t.Setenv("LIVESESSION_INTERNAL_SECRET", "")
	t.Setenv("LIVESESSION_ALLOWED_ORIGINS", "")
	require.ErrorContains(t, run(), "LIVESESSION_INTERNAL_SECRET")
	t.Setenv("LIVESESSION_INTERNAL_SECRET", "test-secret")
	require.ErrorContains(t, run(), "LIVESESSION_ALLOWED_ORIGINS")
	t.Setenv("CHRONICLE_ACCESS_URL", "https://chronicle.example")
	for _, origin := range []string{"*", "https://*", "https://*.com", "https://example.com/path", "https://example.com,", "https://bad[.example.com"} {
		t.Setenv("LIVESESSION_ALLOWED_ORIGINS", origin)
		require.ErrorContains(t, run(), "invalid live session origin pattern", origin)
	}
	t.Setenv("LIVESESSION_ALLOWED_ORIGINS", "https://chronicle.example")
	t.Setenv("CHRONICLE_ACCESS_URL", "")
	require.True(t, strings.Contains(run().Error(), "CHRONICLE_ACCESS_URL"))
}
