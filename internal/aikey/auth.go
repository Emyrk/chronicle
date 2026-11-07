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

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Rate limiter names. Views are bucketed per user: a user has one active key,
// so this is that key's bucket, and rotating can't reset it.
const (
	limiterViewsMinute = "ai_key_views_minute"
	limiterViewsDay    = "ai_key_views_day"
	limiterInvalid     = "ai_key_invalid"
)

// InvalidLimit bounds wrong-key attempts per client IP. It is generous so a
// shared AI-fetcher IP is not blocked by a few stale links.
var InvalidLimit = ratelimit.PerMinute(20, 40)

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

	minute, day, invalid *ratelimit.Limiter

	mu    sync.Mutex
	tiers map[uuid.UUID]cachedTier
}

type cachedTier struct {
	tier    string
	expires time.Time
}

// NewAuthenticator returns an authenticator. resolve is called at most every
// tierCacheTTL per user, so tier changes apply without rotating the key.
func NewAuthenticator(logger *slog.Logger, store Store, resolve TierResolver) *Authenticator {
	free := BenefitsFor("free")
	return &Authenticator{
		logger:  logger.With(slog.String("component", "ai_key")),
		store:   store,
		resolve: resolve,
		now:     time.Now,
		minute:  ratelimit.New(store, limiterViewsMinute, minuteLimit(free)),
		day:     ratelimit.New(store, limiterViewsDay, DayLimit(free)),
		invalid: ratelimit.New(store, limiterInvalid, InvalidLimit),
		tiers:   make(map[uuid.UUID]cachedTier),
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
// carry the key in context (FromContext, Link) plus Chronicle claims marked
// with AIKeyID.
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secret, ok := takeKey(r)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		w = &keyedWriter{ResponseWriter: w}
		ctx := r.Context()
		if r.Method != http.MethodGet {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "AI keys are read-only and work only on GET requests.",
			})
			return
		}

		ipSubject := ratelimit.IPSubject(ClientIP(r))
		if st, err := a.invalid.Peek(ctx, ipSubject); err != nil {
			// Guessing a 128-bit key is hopeless anyway; fail open.
			a.logger.Error("peek ai key invalid bucket", slog.String("error", err.Error()))
		} else if st.Remaining < 1 {
			wait := time.Duration(math.Ceil((1 - st.Remaining) / InvalidLimit.PerSecond * float64(time.Second)))
			a.writeInvalidLimited(w, r, ratelimit.Result{Status: st, RetryAfter: wait})
			return
		}

		var row database.AiKey
		var err error
		if ValidFormat(secret) {
			row, err = a.store.GetAIKeyByHashedSecret(ctx, Hash(secret))
		} else {
			err = sql.ErrNoRows
		}
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows) {
			a.wrongKey(w, r, ipSubject)
			return
		}
		if err != nil {
			a.logger.Error("look up ai key", slog.String("error", err.Error()))
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Chronicle couldn't check this AI key right now. Try again shortly."})
			return
		}

		tenantID := servicetenant.TenantIDFromContext(ctx)
		if row.TenantScopeID.UUID != tenantID {
			httpapi.Write(ctx, w, http.StatusUnauthorized, chroniclesdk.Response{
				Message: "This AI key belongs to a different Chronicle community. Use links from the community the key was made in.",
			})
			return
		}
		if row.RevokedAt.Valid {
			httpapi.Write(ctx, w, http.StatusUnauthorized, chroniclesdk.Response{
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
			httpapi.Write(ctx, w, http.StatusUnauthorized, chroniclesdk.Response{
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
		ctx = chronauth.WithClaims(ctx, &claims.Claims{Subject: row.UserID, AIKeyID: row.ID})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// chargeView takes one view from the per-minute and daily buckets. It writes
// the 429 and returns false when either is empty. Database errors fail open:
// search keeps its own budget, and pages are cheap reads.
func (a *Authenticator) chargeView(w http.ResponseWriter, r *http.Request, userID uuid.UUID, b chroniclesdk.AIKeyBenefits) bool {
	ctx := r.Context()
	subject := ratelimit.UserSubject(userID.String())
	minute, err := a.minute.TakeWithLimit(ctx, subject, 1, minuteLimit(b))
	if err != nil {
		a.logger.Error("take ai key minute view", slog.String("error", err.Error()))
		return true
	}
	if !minute.Allowed {
		ratelimit.SetRetryAfter(w, minute)
		httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{
			Message: fmt.Sprintf("This AI key is making requests too quickly. At the %s tier it may make %d requests a minute. Wait %s and try again.",
				tierName(b.Tier), b.ViewsPerMinute, humanDuration(minute.RetryAfter)),
		})
		return false
	}
	day, err := a.day.TakeWithLimit(ctx, subject, 1, DayLimit(b))
	if err != nil {
		a.logger.Error("take ai key daily view", slog.String("error", err.Error()))
		return true
	}
	if !day.Allowed {
		ratelimit.SetRetryAfter(w, day)
		resp := chroniclesdk.Response{
			Message: fmt.Sprintf("This AI key has used its %d requests for today at the %s tier. It can make another request in %s.",
				b.ViewsPerDay, tierName(b.Tier), humanDuration(day.RetryAfter)),
		}
		if next := nextTier(b.Tier); next != "" {
			resp.CallToAction = fmt.Sprintf("%s supporters get %d requests a day.", tierName(next), BenefitsFor(next).ViewsPerDay)
			resp.Link, resp.LinkText = "/supporter", "View supporter perks"
		}
		httpapi.Write(ctx, w, http.StatusTooManyRequests, resp)
		return false
	}
	w.Header().Set(ViewsRemainingHeader, strconv.Itoa(max(int(math.Floor(minute.Remaining)), 0)))
	w.Header().Set(ViewsRemainingTodayHeader, strconv.Itoa(max(int(math.Floor(day.Remaining)), 0)))
	return true
}

// wrongKey charges the client IP for an unknown key.
func (a *Authenticator) wrongKey(w http.ResponseWriter, r *http.Request, ipSubject string) {
	ctx := r.Context()
	res, err := a.invalid.Take(ctx, ipSubject, 1)
	if err != nil {
		a.logger.Error("take ai key invalid bucket", slog.String("error", err.Error()))
	} else if !res.Allowed {
		a.writeInvalidLimited(w, r, res)
		return
	}
	httpapi.Write(ctx, w, http.StatusUnauthorized, chroniclesdk.Response{
		Message:      "This AI key is not valid.",
		CallToAction: "Ask the user to copy a fresh link from Chronicle with Copy for AI.",
	})
}

func (*Authenticator) writeInvalidLimited(w http.ResponseWriter, r *http.Request, res ratelimit.Result) {
	ratelimit.SetRetryAfter(w, res)
	httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.Response{
		Message: fmt.Sprintf("Too many invalid AI keys came from this network. Wait %s and try again.", humanDuration(res.RetryAfter)),
	})
}

// keyedWriter forces the privacy headers on every keyed response, after any
// handler set its own (some routes set public Cache-Control).
type keyedWriter struct {
	http.ResponseWriter
	wrote bool
}

func (w *keyedWriter) WriteHeader(code int) {
	if !w.wrote {
		w.wrote = true
		h := w.Header()
		h.Set("Cache-Control", "no-store")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Robots-Tag", "noindex")
		h.Del("Expires")
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *keyedWriter) Write(b []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
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
