package servicegamedata

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/Emyrk/chronicle/internal/clientip"
)

// ipLimiter manages per-IP token buckets for rate limiting.
type ipLimiter struct {
	mu       sync.Mutex
	limiters map[string]*entry
	rate     rate.Limit
	burst    int
	clientIP clientip.Resolver
}

type entry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newIPLimiter(r rate.Limit, burst int, clientIP clientip.Resolver) *ipLimiter {
	l := &ipLimiter{
		limiters: make(map[string]*entry),
		rate:     r,
		burst:    burst,
		clientIP: clientIP,
	}
	go l.cleanup()
	return l
}

// get returns the rate limiter for the given IP, creating one if needed.
func (l *ipLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	e, ok := l.limiters[ip]
	if !ok {
		e = &entry{
			limiter: rate.NewLimiter(l.rate, l.burst),
		}
		l.limiters[ip] = e
	}
	e.lastSeen = time.Now()
	return e.limiter
}

// cleanup removes stale entries every 5 minutes.
func (l *ipLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		l.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for ip, e := range l.limiters {
			if e.lastSeen.Before(cutoff) {
				delete(l.limiters, ip)
			}
		}
		l.mu.Unlock()
	}
}

// middleware returns chi-compatible middleware that enforces the rate limit.
func (l *ipLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := l.clientIP.Key(r)
		if !l.get(ip).Allow() {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "12")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate limit exceeded"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
