package httpcache

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestUntilNextHalfHour(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name string
		now  time.Time
		want int
	}{
		{name: "hour boundary", now: time.Date(2026, time.November, 10, 10, 0, 0, 0, time.UTC), want: 1800},
		{name: "before half hour", now: time.Date(2026, time.November, 10, 10, 29, 59, 0, time.UTC), want: 1},
		{name: "half hour boundary", now: time.Date(2026, time.November, 10, 10, 30, 0, 0, time.UTC), want: 1800},
		{name: "before next hour", now: time.Date(2026, time.November, 10, 10, 59, 59, 500_000_000, time.UTC), want: 1},
		{name: "non UTC input", now: time.Date(2026, time.November, 10, 5, 7, 0, 0, time.FixedZone("EST", -5*60*60)), want: 1380},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, UntilNextHalfHour(tt.now))
		})
	}
}

func TestMarkLeaderboardResponse(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	MarkLeaderboardResponse(recorder, time.Date(2026, time.November, 10, 10, 7, 0, 0, time.UTC))

	require.Equal(t, "public, max-age=60", recorder.Header().Get("Cache-Control"))
	require.Equal(t, "public, max-age=1380, stale-while-revalidate=30", recorder.Header().Get("Cloudflare-CDN-Cache-Control"))
	require.Equal(t, "leaderboards", recorder.Header().Get("Cache-Tag"))
}

func TestCacheSuccessfulLeaderboardResponses(t *testing.T) {
	t.Parallel()

	now := func() time.Time { return time.Date(2026, time.November, 10, 10, 7, 0, 0, time.UTC) }
	middleware := CacheSuccessfulLeaderboardResponses(now)

	for _, status := range []int{http.StatusOK, http.StatusBadRequest, http.StatusInternalServerError} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			t.Parallel()
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(status)
			})).ServeHTTP(recorder, request)

			if status == http.StatusOK {
				require.Equal(t, "leaderboards", recorder.Header().Get("Cache-Tag"))
				require.Equal(t, "public, max-age=1380, stale-while-revalidate=30", recorder.Header().Get("Cloudflare-CDN-Cache-Control"))
				return
			}
			require.Empty(t, recorder.Header().Get("Cache-Control"))
			require.Empty(t, recorder.Header().Get("Cloudflare-CDN-Cache-Control"))
			require.Empty(t, recorder.Header().Get("Cache-Tag"))
		})
	}

	t.Run("successful HEAD is cached", func(t *testing.T) {
		t.Parallel()
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodHead, "/", nil)
		middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		})).ServeHTTP(recorder, request)

		require.Equal(t, "leaderboards", recorder.Header().Get("Cache-Tag"))
	})

	t.Run("successful POST is not cached", func(t *testing.T) {
		t.Parallel()
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/", nil)
		middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		})).ServeHTTP(recorder, request)

		require.Empty(t, recorder.Header().Get("Cache-Control"))
		require.Empty(t, recorder.Header().Get("Cloudflare-CDN-Cache-Control"))
		require.Empty(t, recorder.Header().Get("Cache-Tag"))
	})
}
