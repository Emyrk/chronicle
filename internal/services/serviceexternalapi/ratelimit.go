package serviceexternalapi

import (
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"golang.org/x/time/rate"
)

const (
	externalRateLimitPerMinute = 60
	externalRateLimitBurst     = 20
	externalLimiterEntryTTL    = 10 * time.Minute
	externalLimiterCleanup     = 5 * time.Minute
)

// externalIPLimiter owns the external API's per-process, per-IP token buckets.
// It is intentionally separate from the game-data API limiter so traffic to
// either API cannot consume the other's allowance.
type externalIPLimiter struct {
	mu                sync.Mutex
	limiters          map[string]*externalLimiterEntry
	requestsPerMinute int
	burst             int
	lastCleanup       time.Time
}

type externalLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newExternalIPLimiter() *externalIPLimiter {
	return newExternalIPLimiterWithConfig(externalRateLimitPerMinute, externalRateLimitBurst)
}

func newExternalIPLimiterWithConfig(requestsPerMinute, burst int) *externalIPLimiter {
	return &externalIPLimiter{
		limiters:          make(map[string]*externalLimiterEntry),
		requestsPerMinute: requestsPerMinute,
		burst:             burst,
		lastCleanup:       time.Now(),
	}
}

func (l *externalIPLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limiter := l.get(externalClientIP(r))
		allowed := limiter.Allow()
		l.setHeaders(w, limiter)
		if !allowed {
			w.Header().Set("Retry-After", "1")
			httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.Response{
				Message: "Rate limit exceeded.",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// statusMiddleware reports the current allowance without consuming it. It is
// attached directly to the health route so mounting the service under a path
// prefix cannot accidentally turn the status check into a limited request.
func (l *externalIPLimiter) statusMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		l.setHeaders(w, l.get(externalClientIP(r)))
		next.ServeHTTP(w, r)
	})
}

func (l *externalIPLimiter) setHeaders(w http.ResponseWriter, limiter *rate.Limiter) {
	remaining := max(int(math.Floor(limiter.Tokens())), 0)
	w.Header().Set("RateLimit-Limit", strconv.Itoa(l.requestsPerMinute))
	w.Header().Set("RateLimit-Remaining", strconv.Itoa(remaining))
}

func (l *externalIPLimiter) get(ip string) *rate.Limiter {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastCleanup) >= externalLimiterCleanup {
		cutoff := now.Add(-externalLimiterEntryTTL)
		for key, entry := range l.limiters {
			if entry.lastSeen.Before(cutoff) {
				delete(l.limiters, key)
			}
		}
		l.lastCleanup = now
	}

	entry, ok := l.limiters[ip]
	if !ok {
		entry = &externalLimiterEntry{
			limiter: rate.NewLimiter(rate.Every(time.Minute/time.Duration(l.requestsPerMinute)), l.burst),
		}
		l.limiters[ip] = entry
	}
	entry.lastSeen = now
	return entry.limiter
}

// externalClientIP gets the original client IP as provided by Chronicle's
// reverse proxy, falling back to the direct peer address for local requests.
func externalClientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if index := strings.IndexByte(forwarded, ','); index >= 0 {
			forwarded = forwarded[:index]
		}
		return strings.TrimSpace(forwarded)
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
