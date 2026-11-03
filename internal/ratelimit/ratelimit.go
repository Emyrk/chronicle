// Package ratelimit is a leaky-bucket rate limiter stored in Postgres, so
// every API replica shares the same buckets.
//
// Each Limiter has a name and a Limit. A bucket is keyed by
// "<name>:<subject>", where the subject is usually "user:<uuid>" or
// "ip:<addr>". A take of cost tokens is allowed when the bucket holds at
// least that many. Buckets refill continuously at Limit.PerSecond up to
// Limit.Burst, and a new bucket starts full.
package ratelimit

import (
	"context"
	"math"
	"net/http"
	"strconv"
	"time"

	"golang.org/x/xerrors"

	"github.com/Emyrk/chronicle/database"
)

// Limit configures a bucket.
type Limit struct {
	// PerSecond is the refill rate in tokens per second.
	PerSecond float64
	// Burst is the bucket size: the most tokens that can be spent at once.
	Burst float64
}

// PerMinute returns a Limit that refills n tokens per minute with the given
// burst.
func PerMinute(n, burst float64) Limit {
	return Limit{PerSecond: n / 60, Burst: burst}
}

// Store is the database subset the limiter needs.
type Store interface {
	TakeRateLimitTokens(ctx context.Context, arg database.TakeRateLimitTokensParams) (database.TakeRateLimitTokensRow, error)
}

// Limiter takes tokens from named buckets.
type Limiter struct {
	store Store
	name  string
	limit Limit
}

// New returns a limiter. name namespaces its buckets and must be unique per
// use, e.g. "instance_search".
func New(store Store, name string, limit Limit) *Limiter {
	return &Limiter{store: store, name: name, limit: limit}
}

// Result is the outcome of a take.
type Result struct {
	Allowed bool
	// Remaining is the number of tokens left after the take.
	Remaining float64
	// RetryAfter is how long until a take of the same cost would succeed.
	// Zero when allowed.
	RetryAfter time.Duration
}

// Take tries to take cost tokens from subject's bucket. Errors are database
// errors; the caller decides whether to fail open or closed.
func (l *Limiter) Take(ctx context.Context, subject string, cost float64) (Result, error) {
	if cost < 0 {
		return Result{}, xerrors.Errorf("rate limit cost must not be negative, got %v", cost)
	}
	row, err := l.store.TakeRateLimitTokens(ctx, database.TakeRateLimitTokensParams{
		Key:           l.name + ":" + subject,
		Burst:         l.limit.Burst,
		Cost:          cost,
		RatePerSecond: l.limit.PerSecond,
	})
	if err != nil {
		return Result{}, xerrors.Errorf("take rate limit tokens: %w", err)
	}
	res := Result{Allowed: row.Allowed, Remaining: row.Tokens}
	if !row.Allowed {
		res.RetryAfter = retryAfter(cost, row.Tokens, l.limit)
	}
	return res, nil
}

func retryAfter(cost, tokens float64, limit Limit) time.Duration {
	if cost > limit.Burst || limit.PerSecond <= 0 {
		// The bucket can never hold this many tokens.
		return time.Duration(math.MaxInt64)
	}
	secs := (cost - tokens) / limit.PerSecond
	return time.Duration(math.Ceil(secs * float64(time.Second)))
}

// SetRetryAfter sets the Retry-After header (whole seconds, at least 1) for a
// refused take.
func SetRetryAfter(w http.ResponseWriter, res Result) {
	if res.Allowed {
		return
	}
	secs := int64(math.Ceil(res.RetryAfter.Seconds()))
	if secs < 1 || res.RetryAfter == time.Duration(math.MaxInt64) {
		secs = 1
	}
	w.Header().Set("Retry-After", strconv.FormatInt(secs, 10))
}

// UserSubject and IPSubject build bucket subjects.
func UserSubject(id string) string { return "user:" + id }

// IPSubject builds the bucket subject for a client IP.
func IPSubject(ip string) string { return "ip:" + ip }
