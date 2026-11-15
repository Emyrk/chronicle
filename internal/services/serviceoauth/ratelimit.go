package serviceoauth

import (
	"net/http"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/clientip"
	"golang.org/x/time/rate"
)

const (
	deviceAuthorizationRate  = 30
	deviceAuthorizationBurst = 10
	deviceLimiterTTL         = 10 * time.Minute
	deviceLimiterCleanup     = 5 * time.Minute
)

type deviceAuthorizationLimiter struct {
	mu          sync.Mutex
	entries     map[string]*deviceLimiterEntry
	lastCleanup time.Time
	clientIP    clientip.Resolver
}

type deviceLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newDeviceAuthorizationLimiter(clientIP clientip.Resolver) *deviceAuthorizationLimiter {
	return &deviceAuthorizationLimiter{
		entries:     make(map[string]*deviceLimiterEntry),
		lastCleanup: time.Now(),
		clientIP:    clientIP,
	}
}

func (l *deviceAuthorizationLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.get(l.clientIP.Key(r)).Allow() {
			w.Header().Set("Retry-After", "2")
			httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.Response{Message: "Rate limit exceeded."})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (l *deviceAuthorizationLimiter) get(ip string) *rate.Limiter {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastCleanup) >= deviceLimiterCleanup {
		for key, entry := range l.entries {
			if now.Sub(entry.lastSeen) > deviceLimiterTTL {
				delete(l.entries, key)
			}
		}
		l.lastCleanup = now
	}
	entry, ok := l.entries[ip]
	if !ok {
		entry = &deviceLimiterEntry{limiter: rate.NewLimiter(rate.Every(time.Minute/deviceAuthorizationRate), deviceAuthorizationBurst)}
		l.entries[ip] = entry
	}
	entry.lastSeen = now
	return entry.limiter
}
