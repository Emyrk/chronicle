package httpcache

import (
	"fmt"
	"net/http"
	"time"
)

const (
	leaderboardBrowserMaxAge        = 60
	leaderboardStaleWhileRevalidate = 30
	leaderboardCacheTag             = "leaderboards"
)

// MarkLeaderboardResponse makes a successful public leaderboard response
// cacheable until the next UTC half-hour boundary. Browser caching stays short;
// Cloudflare shares the response until the common refresh boundary.
func MarkLeaderboardResponse(w http.ResponseWriter, now time.Time) {
	ttl := UntilNextHalfHour(now)
	w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", leaderboardBrowserMaxAge))
	w.Header().Set("Cloudflare-CDN-Cache-Control", fmt.Sprintf("public, max-age=%d, stale-while-revalidate=%d", ttl, leaderboardStaleWhileRevalidate))
	w.Header().Set("Cache-Tag", leaderboardCacheTag)
}

// UntilNextHalfHour returns whole seconds until the next UTC :00 or :30
// boundary. A response created exactly on a boundary receives a full 30-minute
// lifetime, and sub-second intervals round up so the TTL is never zero.
func UntilNextHalfHour(now time.Time) int {
	now = now.UTC()
	next := now.Truncate(30 * time.Minute).Add(30 * time.Minute)
	remaining := next.Sub(now)
	seconds := int((remaining + time.Second - 1) / time.Second)
	if seconds < 1 {
		return 1
	}
	return seconds
}

// CacheSuccessfulLeaderboardResponses applies leaderboard cache headers only
// when a handler writes a successful response.
func CacheSuccessfulLeaderboardResponses(now func() time.Time) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				next.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(&leaderboardResponseWriter{ResponseWriter: w, now: now}, r)
		})
	}
}

type leaderboardResponseWriter struct {
	http.ResponseWriter
	now         func() time.Time
	wroteHeader bool
}

func (w *leaderboardResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	if status >= http.StatusOK && status < http.StatusMultipleChoices {
		MarkLeaderboardResponse(w.ResponseWriter, w.now())
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *leaderboardResponseWriter) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (w *leaderboardResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}
