package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseAccessURL(t *testing.T) {
	t.Parallel()
	for _, raw := range []string{"https://chronicle.example", "https://chronicle.example/", "http://localhost:4000"} {
		parsed, err := parseAccessURL(raw)
		require.NoError(t, err, raw)
		require.Equal(t, raw, parsed.String())
	}
	for _, raw := range []string{"", "ftp://chronicle.example", "https://user@chronicle.example", "https://chronicle.example/path", "https://chronicle.example?query=1", "https://chronicle.example#fragment"} {
		_, err := parseAccessURL(raw)
		require.ErrorContains(t, err, "HTTP(S) origin", raw)
	}
}

func TestListenerAddresses(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("LIVESESSION_PUBLIC_ADDR", "")
	t.Setenv("LIVESESSION_PRIVATE_ADDR", "")

	publicAddr, privateAddr, err := listenerAddresses()
	require.NoError(t, err)
	require.Equal(t, ":8080", publicAddr)
	require.Equal(t, ":8081", privateAddr)

	t.Setenv("PORT", "9090")
	publicAddr, privateAddr, err = listenerAddresses()
	require.NoError(t, err)
	require.Equal(t, ":9090", publicAddr)
	require.Equal(t, ":8081", privateAddr)

	t.Setenv("LIVESESSION_PUBLIC_ADDR", "127.0.0.1:7000")
	t.Setenv("LIVESESSION_PRIVATE_ADDR", "127.0.0.1:7001")
	publicAddr, privateAddr, err = listenerAddresses()
	require.NoError(t, err)
	require.Equal(t, "127.0.0.1:7000", publicAddr)
	require.Equal(t, "127.0.0.1:7001", privateAddr)

	t.Setenv("LIVESESSION_PRIVATE_ADDR", "127.0.0.1:7000")
	_, _, err = listenerAddresses()
	require.ErrorContains(t, err, "different addresses")
}

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
