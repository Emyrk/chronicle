package parseradmission

import (
	"context"
	"errors"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestAdmissionCancelsAndRechecks(t *testing.T) {
	t.Parallel()
	primary := "a"
	g, err := New("a", func(context.Context) (string, error) { return primary, nil })
	require.NoError(t, err)
	ctx, release, err := g.Admit(t.Context(), "a")
	require.NoError(t, err)
	defer release()
	primary = "b"
	require.ErrorIs(t, g.Refresh(t.Context()), ErrIncompatible)
	require.ErrorIs(t, ctx.Err(), context.Canceled)
	_, _, err = g.Admit(t.Context(), "a")
	require.ErrorIs(t, err, ErrIncompatible)
	primary = "a"
	require.NoError(t, g.Refresh(t.Context()))
	_, _, err = g.Admit(t.Context(), "b")
	require.ErrorIs(t, err, ErrIncompatible)
	g.Close()
	require.ErrorIs(t, g.Refresh(t.Context()), ErrIncompatible)
}

func TestUnavailableCancels(t *testing.T) {
	t.Parallel()
	var failure error
	g, err := New("a", func(context.Context) (string, error) { return "a", failure })
	require.NoError(t, err)
	ctx, release, err := g.Admit(t.Context(), "a")
	require.NoError(t, err)
	defer release()
	failure = errors.New("offline")
	require.Error(t, g.Refresh(t.Context()))
	require.ErrorIs(t, ctx.Err(), context.Canceled)
}

func TestHTTPFetcher(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, body string
		status     int
		ok         bool
	}{
		{"exact", `{"binary_identity":"abc"}`, 200, true},
		{"bad-json", `oops`, 200, false}, {"offline", `{}`, 503, false},
		{"trailing", `{"binary_identity":"abc"}{}`, 200, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, Path, r.URL.Path)
				require.Contains(t, r.Header.Get("Cache-Control"), "no-store")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			fetch, err := HTTPFetcher(server.URL)
			require.NoError(t, err)
			id, err := fetch(t.Context())
			if tc.ok {
				require.NoError(t, err)
				require.Equal(t, "abc", id)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestConcurrentAdmissionShutdown(t *testing.T) {
	t.Parallel()
	g, err := New("a", func(context.Context) (string, error) { return "a", nil })
	require.NoError(t, err)
	var wg sync.WaitGroup
	contexts := make(chan context.Context, 32)
	for range 32 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ctx, release, err := g.Admit(t.Context(), "a")
			if err == nil {
				defer release()
				contexts <- ctx
			}
		}()
	}
	g.Close()
	wg.Wait()
	close(contexts)
	for ctx := range contexts {
		require.ErrorIs(t, ctx.Err(), context.Canceled)
	}
	_, _, err = g.Admit(t.Context(), "a")
	require.ErrorIs(t, err, ErrIncompatible)
}
