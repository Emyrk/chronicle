package servicestripecli

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/stretchr/testify/require"
)

func TestLocalWebhookURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		accessURL string
		want      string
		wantErr   string
	}{
		{name: "default", want: "http://localhost:4000/api/v1/billing/webhook"},
		{name: "localhost", accessURL: "http://localhost:4444/base?ignored=true", want: "http://localhost:4444/api/v1/billing/webhook"},
		{name: "IPv4 loopback", accessURL: "http://127.0.0.1:4000", want: "http://127.0.0.1:4000/api/v1/billing/webhook"},
		{name: "non-local", accessURL: "https://chronicleclassic.com", wantErr: "requires a localhost access URL"},
		{name: "wrong scheme", accessURL: "ftp://localhost:4000", wantErr: "requires an HTTP access URL"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := localWebhookURL(tt.accessURL)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestRedactWebhookSecrets(t *testing.T) {
	t.Parallel()

	output := redactWebhookSecrets("Ready! secret whsec_test_secret (^C to quit)")
	require.Equal(t, "Ready! secret [REDACTED] (^C to quit)", output)
}

func TestParseWebhookSecret(t *testing.T) {
	t.Parallel()

	secret, err := parseWebhookSecret([]byte("Ready! Your webhook signing secret is whsec_test_secret (^C to quit)"))
	require.NoError(t, err)
	require.Equal(t, "whsec_test_secret", secret)

	_, err = parseWebhookSecret([]byte("not authenticated"))
	require.ErrorContains(t, err, "did not return")
}

func TestServiceDisabled(t *testing.T) {
	t.Parallel()

	s := New(services.New())
	s.lookPath = func(string) (string, error) {
		t.Fatal("disabled service must not look up Stripe CLI")
		return "", nil
	}
	require.NoError(t, s.Start(context.Background()))
	require.NoError(t, s.Close(context.Background()))
}

func TestServiceReportsMissingCLI(t *testing.T) {
	t.Parallel()

	s := New(services.New())
	s.enabled = true
	s.logger = slog.New(slog.DiscardHandler)
	s.lookPath = func(string) (string, error) {
		return "", errors.New("missing")
	}

	require.ErrorContains(t, s.Start(context.Background()), "find Stripe CLI")
}

func TestServiceStartsAndStopsListener(t *testing.T) {
	t.Parallel()

	executable := filepath.Join(t.TempDir(), "stripe")
	require.NoError(t, os.WriteFile(executable, []byte(`#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--print-secret" ]; then
    echo whsec_test_listener
    exit 0
  fi
done
exec sleep 60
`), 0o755))

	var configuredSecret string
	s := New(services.New())
	s.enabled = true
	s.logger = slog.New(slog.DiscardHandler)
	s.lookPath = func(string) (string, error) { return executable, nil }
	s.accessURL = func(*services.Services) string { return "" }
	s.configureWebhookSecret = func(_ *services.Services, secret string) error {
		configuredSecret = secret
		return nil
	}

	require.NoError(t, s.Start(context.Background()))
	require.Equal(t, "whsec_test_listener", configuredSecret)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	require.NoError(t, s.Close(ctx))
}
