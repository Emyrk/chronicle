package chronauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestContextualRefreshProviderCancelsTokenRequest(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(started)
		<-release
	}))
	t.Cleanup(func() {
		close(release)
		server.Close()
	})

	provider := withContextualTokenRefresh(
		&testRefreshProvider{},
		"client-id",
		"client-secret",
		server.URL,
	)
	refresher, ok := provider.(contextualTokenRefresher)
	require.True(t, ok)

	testCtx := testutil.Context(t, testutil.WaitShort)
	refreshCtx, cancel := context.WithCancel(testCtx)
	result := make(chan error, 1)
	go func() {
		_, err := refresher.RefreshTokenContext(refreshCtx, "refresh-token")
		result <- err
	}()

	select {
	case <-started:
	case <-testCtx.Done():
		t.Fatalf("timed out waiting for token request: %v", testCtx.Err())
	}
	cancel()
	select {
	case err := <-result:
		require.ErrorIs(t, err, context.Canceled)
	case <-testCtx.Done():
		t.Fatalf("timed out waiting for token refresh cancellation: %v", testCtx.Err())
	}
}

var _ contextualTokenRefresher = (*contextualRefreshProvider)(nil)
