package aikey

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/time/rate"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// Rate limiter names. Views are bucketed per user: a user has one active key,
// so this is that key's bucket, and rotating can't reset it.
const (
	limiterViewsMinute = "ai_key_views_minute"
	limiterViewsDay    = "ai_key_views_day"
)

// Failed keys are limited per client IP, in memory on each replica, so
// rejected requests cost no rate-limit writes. Only failures are charged: a
// key that is found and valid never touches this limiter, so a busy shared
// AI-fetcher IP can't lock out working keys.
const (
	// failuresPerMinute and failureBurst count unknown or malformed keys.
	failuresPerMinute = 20
	failureBurst      = 40
	// Stale keys (expired, revoked, another community) are old links, not
	// guesses, so they weigh a quarter of an unknown key.
	unknownKeyCost   = 4
	staleKeyCost     = 1
	failureEntryTTL  = 10 * time.Minute
	failureCleanup   = 5 * time.Minute
	viewBlocksMax    = 10_000
	failureLimitsMax = 100_000
)

// tierCacheTTL bounds how stale a cached supporter tier may be.
const tierCacheTTL = 30 * time.Second

// tierCacheMax caps the cache; it is cleared when full.
const tierCacheMax = 10_000

// Response headers on keyed requests.
const (
	ViewsRemainingHeader      = "Chronicle-AI-Key-Views-Remaining"
	ViewsRemainingTodayHeader = "Chronicle-AI-Key-Views-Remaining-Today"
)

// Store is the database subset AI key authentication needs.
type Store interface {
	ratelimit.Store
	GetAIKeyByHashedSecret(ctx context.Context, hashedSecret []byte) (database.AiKey, error)
	TouchAIKey(ctx context.Context, arg database.TouchAIKeyParams) error
}

// TierResolver returns a user's current supporter tier, such as "free" or
// "honored".
type TierResolver func(ctx context.Context, userID uuid.UUID) (string, error)

// Authenticator validates ?ai_key= on GET routes and applies per-key limits.
type Authenticator struct {
	logger  *slog.Logger
	store   Store
	resolve TierResolver
	now     func() time.Time

	minute, day *ratelimit.Limiter

	mu    sync.Mutex
	tiers map[uuid.UUID]cachedTier
	// blocked remembers users whose view bucket refused a request, so
	// repeated 429s are answered from memory until the bucket has a token.
	blocked map[uuid.UUID]viewBlock

	failMu      sync.Mutex
	failures    map[string]*failureEntry
	lastCleanup time.Time
}

type cachedTier struct {
	tier    string
	expires time.Time
}

type viewBlock struct {
	until    time.Time
	daily    bool
	benefits chroniclesdk.AIKeyBenefits
}

type failureEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewAuthenticator returns an authenticator. resolve is called at most every
// tierCacheTTL per user, so tier changes apply without rotating the key.
func NewAuthenticator(logger *slog.Logger, store Store, resolve TierResolver) *Authenticator {
	free := BenefitsFor("free")
	return &Authenticator{
		logger:      logger.With(slog.String("component", "ai_key")),
		store:       store,
		resolve:     resolve,
		now:         time.Now,
		minute:      ratelimit.New(store, limiterViewsMinute, minuteLimit(free)),
		day:         ratelimit.New(store, limiterViewsDay, DayLimit(free)),
		tiers:       make(map[uuid.UUID]cachedTier),
		blocked:     make(map[uuid.UUID]viewBlock),
		failures:    make(map[string]*failureEntry),
		lastCleanup: time.Now(),
	}
}

func minuteLimit(b chroniclesdk.AIKeyBenefits) ratelimit.Limit {
	return ratelimit.PerMinute(float64(b.ViewsPerMinute), float64(b.ViewsPerMinute))
}

// DayLimit refills ViewsPerDay over 24 hours, so it also fits within
// ratelimit.IdleBucketTTL.
func DayLimit(b chroniclesdk.AIKeyBenefits) ratelimit.Limit {
	return ratelimit.Limit{PerSecond: float64(b.ViewsPerDay) / (24 * 60 * 60), Burst: float64(b.ViewsPerDay)}
}

// ViewsRemainingToday peeks at a user's daily view bucket.
func ViewsRemainingToday(ctx context.Context, store ratelimit.Store, userID uuid.UUID, b chroniclesdk.AIKeyBenefits) (int, error) {
	st, err := ratelimit.New(store, limiterViewsDay, DayLimit(b)).PeekWithLimit(ctx, ratelimit.UserSubject(userID.String()), DayLimit(b))
	if err != nil {
		return 0, err
	}
	return max(int(math.Floor(st.Remaining)), 0), nil
}

func (a *Authenticator) tier(ctx context.Context, userID uuid.UUID) (string, error) {
	now := a.now()
	a.mu.Lock()
	c, ok := a.tiers[userID]
	a.mu.Unlock()
	if ok && now.Before(c.expires) {
		return c.tier, nil
	}
	tier, err := a.resolve(ctx, userID)
	if err != nil {
		return "", err
	}
	a.mu.Lock()
	if len(a.tiers) >= tierCacheMax {
		clear(a.tiers)
	}
	a.tiers[userID] = cachedTier{tier: tier, expires: now.Add(tierCacheTTL)}
	a.mu.Unlock()
	return tier, nil
}

// Middleware authenticates requests that carry ?ai_key=. Requests without
// one pass through untouched. The key is removed from the request URL before
// anything else runs. Keyed requests must be GET, are charged one view, and
// carry the key in context (FromContext, Link). They do not get Chronicle
// claims: handlers that should honor a key read FromContext explicitly.
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secret, ok := takeKey(r)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		w = newKeyedWriter(w)
		ctx := r.Context()
		if r.Method != http.MethodGet {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "AI keys are read-only and work only on GET requests.",
			})
			return
		}

		// Look the key up first: a found, valid key goes straight to its own
		// limits. Malformed keys are rejected without a database read.
		if !ValidFormat(secret) {
			a.rejectKey(w, r, unknownKeyCost, chroniclesdk.Response{
				Message:      "This AI key is not valid.",
				CallToAction: "Ask the user to copy a fresh link from Chronicle with Copy for AI.",
			})
			return
		}
		row, err := a.store.GetAIKeyByHashedSecret(ctx, Hash(secret))
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows) {
			a.rejectKey(w, r, unknownKeyCost, chroniclesdk.Response{
				Message:      "This AI key is not valid.",
				CallToAction: "Ask the user to copy a fresh link from Chronicle with Copy for AI.",
			})
			return
		}
		if err != nil {
			a.logger.Error("look up ai key", slog.String("error", err.Error()))
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Chronicle couldn't check this AI key right now. Try again shortly."})
			return
		}

		tenantID := servicetenant.TenantIDFromContext(ctx)
		if row.TenantScopeID.UUID != tenantID {
			a.rejectKey(w, r, staleKeyCost, chroniclesdk.Response{
				Message: "This AI key belongs to a different Chronicle community. Use links from the community the key was made in.",
			})
			return
		}
		if row.RevokedAt.Valid {
			a.rejectKey(w, r, staleKeyCost, chroniclesdk.Response{
				Message:      "This AI key was revoked or replaced by a newer key.",
				CallToAction: "Ask the user to copy a fresh link from Chronicle with Copy for AI.",
			})
			return
		}

		tier, err := a.tier(ctx, row.UserID)
		if err != nil {
			a.logger.Error("resolve ai key tier", slog.String("user_id", row.UserID.String()), slog.String("error", err.Error()))
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Chronicle couldn't check this AI key right now. Try again shortly."})
			return
		}
		benefits := BenefitsFor(tier)
		expires := ExpiresAt(row, benefits)
		if !a.now().Before(expires) {
			a.rejectKey(w, r, staleKeyCost, chroniclesdk.Response{
				Message:      "This AI key has expired.",
				CallToAction: "Ask the user to copy a fresh link from Chronicle with Copy for AI.",
			})
			return
		}

		if !a.chargeView(w, r, row.UserID, benefits) {
			return
		}
		if err := a.store.TouchAIKey(ctx, database.TouchAIKeyParams{ID: row.ID, LastUserAgent: truncate(r.UserAgent(), 256)}); err != nil {
			a.logger.Error("touch ai key", slog.String("key_id", row.ID.String()), slog.String("error", err.Error()))
		}

		ctx = WithKey(ctx, Key{
			ID: row.ID, UserID: row.UserID, TenantID: tenantID,
			PrivateData: row.PrivateData && benefits.PrivateData,
			ExpiresAt:   expires, Benefits: benefits,
		}, secret)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// chargeView takes one view from the per-minute and daily buckets. It writes
// the 429 and returns false when either is empty. A refusal is remembered in
// memory until the bucket would have a token again, so a client retrying
// in a loop doesn't reach Postgres. Database errors fail open: search keeps
// its own budget, and pages are cheap reads.
func (a *Authenticator) chargeView(w http.ResponseWriter, r *http.Request, userID uuid.UUID, b chroniclesdk.AIKeyBenefits) bool {
	ctx := r.Context()
	now := a.now()
	a.mu.Lock()
	block, blocked := a.blocked[userID]
	if blocked && !now.Before(block.until) {
		delete(a.blocked, userID)
		blocked = false
	}
	a.mu.Unlock()
	if blocked && block.benefits.Tier == b.Tier {
		writeViewLimited(w, r, block.daily, b, block.until.Sub(now))
		return false
	}

	subject := ratelimit.UserSubject(userID.String())
	minute, err := a.minute.TakeWithLimit(ctx, subject, 1, minuteLimit(b))
	if err != nil {
		a.logger.Error("take ai key minute view", slog.String("error", err.Error()))
		return true
	}
	if !minute.Allowed {
		a.block(userID, now, minute.RetryAfter, false, b)
		writeViewLimited(w, r, false, b, minute.RetryAfter)
		return false
	}
	day, err := a.day.TakeWithLimit(ctx, subject, 1, DayLimit(b))
	if err != nil {
		a.logger.Error("take ai key daily view", slog.String("error", err.Error()))
		return true
	}
	if !day.Allowed {
		a.block(userID, now, day.RetryAfter, true, b)
		writeViewLimited(w, r, true, b, day.RetryAfter)
		return false
	}
	w.Header().Set(ViewsRemainingHeader, strconv.Itoa(max(int(math.Floor(minute.Remaining)), 0)))
	w.Header().Set(ViewsRemainingTodayHeader, strconv.Itoa(max(int(math.Floor(day.Remaining)), 0)))
	return true
}

func (a *Authenticator) block(userID uuid.UUID, now time.Time, wait time.Duration, daily bool, b chroniclesdk.AIKeyBenefits) {
	if wait <= 0 || wait == time.Duration(math.MaxInt64) {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.blocked) >= viewBlocksMax {
		clear(a.blocked)
	}
	a.blocked[userID] = viewBlock{until: now.Add(wait), daily: daily, benefits: b}
}

func writeViewLimited(w http.ResponseWriter, r *http.Request, daily bool, b chroniclesdk.AIKeyBenefits, wait time.Duration) {
	setRetryAfter(w, wait)
	resp := chroniclesdk.Response{
		Message: fmt.Sprintf("This AI key is making requests too quickly. At the %s tier it may make %d requests a minute. Wait %s and try again.",
			tierName(b.Tier), b.ViewsPerMinute, humanDuration(wait)),
	}
	if daily {
		resp.Message = fmt.Sprintf("This AI key has used its %d requests for today at the %s tier. It can make another request in %s.",
			b.ViewsPerDay, tierName(b.Tier), humanDuration(wait))
		if next := nextTier(b.Tier); next != "" {
			resp.CallToAction = fmt.Sprintf("%s supporters get %d requests a day.", tierName(next), BenefitsFor(next).ViewsPerDay)
			resp.Link, resp.LinkText = "/supporter", "View supporter perks"
		}
	}
	httpapi.Write(r.Context(), w, http.StatusTooManyRequests, resp)
}

// rejectKey charges the client IP's in-memory failure bucket and writes resp
// as a 401, or a 429 once the IP has failed too often.
func (a *Authenticator) rejectKey(w http.ResponseWriter, r *http.Request, cost int, resp chroniclesdk.Response) {
	limiter := a.failureLimiter(ClientIP(r))
	now := a.now()
	if res := limiter.ReserveN(now, cost); !res.OK() || res.DelayFrom(now) > 0 {
		wait := time.Minute
		if res.OK() {
			wait = res.DelayFrom(now)
			res.CancelAt(now)
		}
		setRetryAfter(w, wait)
		httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.Response{
			Message: fmt.Sprintf("Too many invalid AI keys came from this network. Wait %s and try again.", humanDuration(wait)),
		})
		return
	}
	httpapi.Write(r.Context(), w, http.StatusUnauthorized, resp)
}

func (a *Authenticator) failureLimiter(ip string) *rate.Limiter {
	now := a.now()
	a.failMu.Lock()
	defer a.failMu.Unlock()
	if now.Sub(a.lastCleanup) >= failureCleanup || len(a.failures) >= failureLimitsMax {
		cutoff := now.Add(-failureEntryTTL)
		for k, e := range a.failures {
			if e.lastSeen.Before(cutoff) {
				delete(a.failures, k)
			}
		}
		if len(a.failures) >= failureLimitsMax {
			clear(a.failures)
		}
		a.lastCleanup = now
	}
	e, ok := a.failures[ip]
	if !ok {
		e = &failureEntry{limiter: rate.NewLimiter(rate.Limit(float64(failuresPerMinute*unknownKeyCost)/60), failureBurst*unknownKeyCost)}
		a.failures[ip] = e
	}
	e.lastSeen = now
	return e.limiter
}

func setRetryAfter(w http.ResponseWriter, wait time.Duration) {
	w.Header().Set("Retry-After", strconv.FormatInt(max(int64(math.Ceil(wait.Seconds())), 1), 10))
}

// keyedWriter forces the privacy headers on every keyed response. They are
// set when the writer is wrapped, so a response written past this wrapper
// (a recovered panic's 500, a flush) still has them, and again when the
// status is written, after any handler set its own (some routes set public
// Cache-Control).
type keyedWriter struct {
	http.ResponseWriter
	wrote bool
}

func newKeyedWriter(w http.ResponseWriter) *keyedWriter {
	kw := &keyedWriter{ResponseWriter: w}
	kw.setPrivacyHeaders()
	return kw
}

func (w *keyedWriter) setPrivacyHeaders() {
	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Robots-Tag", "noindex")
	h.Del("Expires")
}

func (w *keyedWriter) WriteHeader(code int) {
	if !w.wrote {
		w.wrote = true
		w.setPrivacyHeaders()
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *keyedWriter) Write(b []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}

// Flush writes the headers through this wrapper before flushing.
func (w *keyedWriter) Flush() {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	_ = http.NewResponseController(w.ResponseWriter).Flush()
}

// Unwrap supports http.ResponseController.
func (w *keyedWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func tierName(tier string) string {
	if tier == "" {
		return ""
	}
	return strings.ToUpper(tier[:1]) + tier[1:]
}

// humanDuration renders a wait for people: "1 second", "40 seconds",
// "3 minutes", "2 hours".
func humanDuration(d time.Duration) string {
	if d == time.Duration(math.MaxInt64) {
		return "a while"
	}
	unit, n := "second", int(math.Ceil(d.Seconds()))
	switch {
	case d >= 90*time.Minute:
		unit, n = "hour", int(math.Ceil(d.Hours()))
	case d >= 90*time.Second:
		unit, n = "minute", int(math.Ceil(d.Minutes()))
	}
	n = max(n, 1)
	if n != 1 {
		unit += "s"
	}
	return fmt.Sprintf("%d %s", n, unit)
}

func truncate(s string, n int) string {
	if len(s) > n {
		s = s[:n]
	}
	return strings.ToValidUTF8(s, "")
}
