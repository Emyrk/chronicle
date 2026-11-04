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
	ForceTakeRateLimitTokens(ctx context.Context, arg database.ForceTakeRateLimitTokensParams) (float64, error)
	PeekRateLimitTokens(ctx context.Context, arg database.PeekRateLimitTokensParams) (float64, error)
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

// Limit returns the limiter's configuration.
func (l *Limiter) Limit() Limit { return l.limit }

// Status is a bucket's state.
type Status struct {
	// Limit is the bucket size (burst).
	Limit float64
	// Remaining is the number of tokens in the bucket now.
	Remaining float64
	// Reset is how long until the bucket is full again.
	Reset time.Duration
}

// Result is the outcome of a take.
type Result struct {
	Status
	Allowed bool
	// RetryAfter is how long until a take of the same cost would succeed.
	// Zero when allowed.
	RetryAfter time.Duration
}

// Take tries to take cost tokens from subject's bucket. Errors are database
// errors; the caller decides whether to fail open or closed.
func (l *Limiter) Take(ctx context.Context, subject string, cost float64) (Result, error) {
	return l.TakeWithLimit(ctx, subject, cost, l.limit)
}

// TakeWithLimit is Take with a per-request limit. The limiter name and subject
// still select the same bucket, so changing a user's limit does not create or
// reset a separate bucket.
func (l *Limiter) TakeWithLimit(ctx context.Context, subject string, cost float64, limit Limit) (Result, error) {
	if cost < 0 {
		return Result{}, xerrors.Errorf("rate limit cost must not be negative, got %v", cost)
	}
	return l.take(ctx, subject, cost, limit)
}

// ForceTake takes cost tokens from subject's bucket even when that makes its
// balance negative. Use it for work whose final cost is only known after the
// work has completed.
func (l *Limiter) ForceTake(ctx context.Context, subject string, cost float64) (Status, error) {
	return l.ForceTakeWithLimit(ctx, subject, cost, l.limit)
}

// ForceTakeWithLimit is ForceTake with a per-request limit.
func (l *Limiter) ForceTakeWithLimit(ctx context.Context, subject string, cost float64, limit Limit) (Status, error) {
	if cost < 0 {
		return Status{}, xerrors.Errorf("forced rate limit cost must not be negative, got %v", cost)
	}
	tokens, err := l.store.ForceTakeRateLimitTokens(ctx, database.ForceTakeRateLimitTokensParams{
		Key:           l.key(subject),
		Burst:         limit.Burst,
		Cost:          cost,
		RatePerSecond: limit.PerSecond,
	})
	if err != nil {
		return Status{}, xerrors.Errorf("force take rate limit tokens: %w", err)
	}
	return status(tokens, limit), nil
}

// Refund returns tokens to subject's bucket, capped at the burst. Use it
// when a request was charged but did no work.
func (l *Limiter) Refund(ctx context.Context, subject string, tokens float64) (Status, error) {
	return l.RefundWithLimit(ctx, subject, tokens, l.limit)
}

// RefundWithLimit is Refund with a per-request limit.
func (l *Limiter) RefundWithLimit(ctx context.Context, subject string, tokens float64, limit Limit) (Status, error) {
	if tokens < 0 {
		return Status{}, xerrors.Errorf("rate limit refund must not be negative, got %v", tokens)
	}
	res, err := l.take(ctx, subject, -tokens, limit)
	return res.Status, err
}

func (l *Limiter) take(ctx context.Context, subject string, cost float64, limit Limit) (Result, error) {
	row, err := l.store.TakeRateLimitTokens(ctx, database.TakeRateLimitTokensParams{
		Key:           l.key(subject),
		Burst:         limit.Burst,
		Cost:          cost,
		RatePerSecond: limit.PerSecond,
	})
	if err != nil {
		return Result{}, xerrors.Errorf("take rate limit tokens: %w", err)
	}
	res := Result{Status: status(row.Tokens, limit), Allowed: row.Allowed}
	if !row.Allowed {
		res.RetryAfter = retryAfter(cost, row.Tokens, limit)
	}
	return res, nil
}

// Peek returns subject's bucket state without taking anything.
func (l *Limiter) Peek(ctx context.Context, subject string) (Status, error) {
	return l.PeekWithLimit(ctx, subject, l.limit)
}

// PeekWithLimit is Peek with a per-request limit.
func (l *Limiter) PeekWithLimit(ctx context.Context, subject string, limit Limit) (Status, error) {
	tokens, err := l.store.PeekRateLimitTokens(ctx, database.PeekRateLimitTokensParams{
		Key:           l.key(subject),
		Burst:         limit.Burst,
		RatePerSecond: limit.PerSecond,
	})
	if err != nil {
		return Status{}, xerrors.Errorf("peek rate limit tokens: %w", err)
	}
	return status(tokens, limit), nil
}

func (l *Limiter) key(subject string) string { return l.name + ":" + subject }

func status(tokens float64, limit Limit) Status {
	return Status{Limit: limit.Burst, Remaining: tokens, Reset: retryAfter(limit.Burst, tokens, limit)}
}

// retryAfter is how long until the bucket holds cost tokens.
func retryAfter(cost, tokens float64, limit Limit) time.Duration {
	if tokens >= cost {
		return 0
	}
	if cost > limit.Burst || limit.PerSecond <= 0 {
		// The bucket can never hold this many tokens.
		return time.Duration(math.MaxInt64)
	}
	secs := (cost - tokens) / limit.PerSecond
	return time.Duration(math.Ceil(secs * float64(time.Second)))
}

// SetHeaders sets RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset
// (IETF RateLimit header fields draft; whole tokens and whole seconds).
func SetHeaders(w http.ResponseWriter, s Status) {
	w.Header().Set("RateLimit-Limit", strconv.FormatInt(int64(s.Limit), 10))
	w.Header().Set("RateLimit-Remaining", strconv.FormatInt(int64(math.Floor(s.Remaining)), 10))
	if s.Reset != time.Duration(math.MaxInt64) {
		w.Header().Set("RateLimit-Reset", strconv.FormatInt(int64(math.Ceil(s.Reset.Seconds())), 10))
	}
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

// UserSubject builds the bucket subject for a logged-in user.
func UserSubject(id string) string { return "user:" + id }

// IPSubject builds the bucket subject for a client IP.
func IPSubject(ip string) string { return "ip:" + ip }
