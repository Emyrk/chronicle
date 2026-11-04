// Package serviceinstancesearch owns instance-search admission and execution for
// both HTTP and trusted in-process callers. Share one Service per API replica.
package serviceinstancesearch

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const MaxConcurrent = 6
const slowLog = 2 * time.Second

var UserLimit = ratelimit.PerMinute(60, 100)
var AnonLimit = ratelimit.PerMinute(20, 40)

// LimitForTier is the single source of truth for supporter search budgets.
func LimitForTier(tier string) ratelimit.Limit {
	burst := float64(100)
	switch tier {
	case billing.TierHonored:
		burst = 300
	case billing.TierRevered:
		burst = 800
	case billing.TierExalted:
		burst = 2000
	}
	return ratelimit.PerMinute(60, burst)
}

// Caller is an explicit identity and tenant selection. A nil UserID identifies
// an anonymous caller, bucketed by IP. A user is bucketed by UUID across both
// HTTP and internal consumers; neither identity nor tenant is taken from ctx.
// Trusted Go callers must supply the authenticated user's UUID and the
// resolved tenant UUID (not uuid.Nil for production tenant searches). A nil
// tenant selects no tenant-scoped rows, rather than bypassing RLS. Reuse the
// instance injected into api.Options.InstanceSearch; constructing another
// Service would create a separate per-replica concurrency cap.
type Caller struct {
	UserID   uuid.UUID
	TenantID uuid.UUID
	IP       string
}
type UserLimitResolver func(context.Context, uuid.UUID) (ratelimit.Limit, error)
type Service struct {
	logger           *slog.Logger
	store            database.Store
	users, anon      *ratelimit.Limiter
	resolveUserLimit UserLimitResolver
	slots            chan struct{}
	duration, cost   *prometheus.HistogramVec
	fieldUses        *prometheus.CounterVec
}
type Result struct {
	Cost       int
	Status     ratelimit.Status
	RetryAfter time.Duration
	Err        error
}

var (
	ErrInvalid       = errors.New("invalid search")
	ErrLoginRequired = errors.New("login required")
	ErrRateLimited   = errors.New("rate limited")
	ErrTooComplex    = errors.New("search too complex")
	ErrBusy          = errors.New("search busy")
)

// New constructs the shared service. Pass this same pointer to HTTP and internal callers.
func New(logger *slog.Logger, store database.Store, registry prometheus.Registerer, resolver UserLimitResolver) *Service {
	if resolver == nil {
		resolver = func(context.Context, uuid.UUID) (ratelimit.Limit, error) { return UserLimit, nil }
	}
	f := promauto.With(registry)
	return &Service{logger: logger.With(slog.String("component", "instance_search")), store: store,
		users: ratelimit.New(store, "instance_search", UserLimit), anon: ratelimit.New(store, "instance_search_anon", AnonLimit),
		resolveUserLimit: resolver, slots: make(chan struct{}, MaxConcurrent),
		duration:  f.NewHistogramVec(prometheus.HistogramOpts{Namespace: "chronicle", Subsystem: "instance_search", Name: "duration_seconds", Help: "Instance search request duration by outcome and caller kind.", Buckets: []float64{.01, .05, .1, .25, .5, 1, 2, 3, 5, 7.5}}, []string{"outcome", "caller"}),
		cost:      f.NewHistogramVec(prometheus.HistogramOpts{Namespace: "chronicle", Subsystem: "instance_search", Name: "cost", Help: "Estimated cost of compiled instance searches.", Buckets: []float64{1, 2, 5, 10, 20, 40, 80, 160, 320, 640, 1280}}, []string{"caller"}),
		fieldUses: f.NewCounterVec(prometheus.CounterOpts{Namespace: "chronicle", Subsystem: "instance_search", Name: "field_uses_total", Help: "Predicate fields used in compiled instance searches."}, []string{"field"})}
}

// ObserveInvalidBody records a malformed HTTP body without charging tokens.
func (s *Service) ObserveInvalidBody(c Caller, explain bool, start time.Time) {
	outcome := "invalid"
	if explain {
		outcome = "explain_invalid"
	}
	s.duration.WithLabelValues(outcome, s.kind(c)).Observe(time.Since(start).Seconds())
}

func (s *Service) Slots() chan struct{}                            { return s.slots } // Useful for deterministic admission tests.
func (s *Service) SetUserLimitResolver(resolver UserLimitResolver) { s.resolveUserLimit = resolver }
func (s *Service) kind(c Caller) string {
	if c.UserID != uuid.Nil {
		return "user"
	}
	return "anon"
}
func (s *Service) bucket(ctx context.Context, c Caller) (*ratelimit.Limiter, string, ratelimit.Limit, error) {
	if c.UserID == uuid.Nil {
		return s.anon, ratelimit.IPSubject(c.IP), AnonLimit, nil
	}
	limit, err := s.resolveUserLimit(ctx, c.UserID)
	return s.users, ratelimit.UserSubject(c.UserID.String()), limit, err
}

// ResolveCaller checks the user's supporter permissions without touching the
// rate bucket. HTTP calls it on malformed bodies to preserve auth-error precedence.
func (s *Service) ResolveCaller(ctx context.Context, c Caller) error {
	_, _, _, err := s.bucket(ctx, c)
	return err
}

func (s *Service) Peek(ctx context.Context, c Caller) (ratelimit.Status, ratelimit.Limit, error) {
	limiter, subject, limit, err := s.bucket(ctx, c)
	if err != nil {
		return ratelimit.Status{}, limit, err
	}
	st, err := limiter.PeekWithLimit(ctx, subject, limit)
	return st, limit, err
}
func (s *Service) observe(start time.Time, c Caller, explain bool, outcome string) {
	if explain {
		outcome = "explain_" + outcome
	}
	s.duration.WithLabelValues(outcome, s.kind(c)).Observe(time.Since(start).Seconds())
}
func (s *Service) run(ctx context.Context, c Caller, q chroniclesdk.InstanceSearchQuery, instanceID uuid.UUID, explain bool) (any, Result) {
	start := time.Now()
	result := Result{}
	fail := func(err error, outcome string) (any, Result) {
		result.Err = err
		s.observe(start, c, explain, outcome)
		return nil, result
	}
	// Do not allow a bypass context to defeat the service's tenant boundary.
	if servicetenant.IsBypass(ctx) {
		return fail(errors.New("instance search must not run with tenant RLS bypassed"), "error")
	}
	ctx = servicetenant.WithTenantID(ctx, c.TenantID)
	limiter, subject, limit, err := s.bucket(ctx, c)
	if err != nil {
		return fail(err, "error")
	}
	compiled, err := instancesearch.CompileForContext(ctx, q, instancesearch.Options{})
	var compiledExplain instancesearch.CompiledExplain
	if err == nil && explain {
		compiledExplain, err = instancesearch.CompileExplainForContext(ctx, q, instanceID, instancesearch.Options{})
	}
	if err != nil {
		result.Status, _ = limiter.PeekWithLimit(ctx, subject, limit)
		return fail(errors.Join(ErrInvalid, err), "invalid")
	}
	result.Cost = compiled.Cost
	if explain {
		result.Cost = compiledExplain.Cost
	}
	if !explain {
		s.cost.WithLabelValues(s.kind(c)).Observe(float64(compiled.Cost))
	}
	if c.UserID == uuid.Nil {
		if err = instancesearch.CheckAnonymous(q); err != nil {
			result.Status, _ = limiter.PeekWithLimit(ctx, subject, limit)
			return fail(errors.Join(ErrLoginRequired, err), "login_required")
		}
	}
	take, err := limiter.TakeWithLimit(ctx, subject, float64(result.Cost), limit)
	if err != nil {
		return fail(err, "error")
	}
	result.Status = take.Status
	if !take.Allowed {
		result.RetryAfter = take.RetryAfter
		if float64(result.Cost) > limit.Burst {
			return fail(ErrTooComplex, "rate_limited")
		}
		return fail(ErrRateLimited, "rate_limited")
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		if st, e := limiter.RefundWithLimit(ctx, subject, float64(result.Cost), limit); e == nil {
			result.Status = st
		} else {
			s.logger.Error("instance search rate limit refund", slog.String("error", e.Error()))
		}
		result.RetryAfter = time.Second
		return fail(ErrBusy, "busy")
	}
	for _, field := range compiled.Fields {
		s.fieldUses.WithLabelValues(field).Inc()
	}
	var value any
	if explain {
		value, err = instancesearch.Explain(ctx, s.store, compiledExplain, instancesearch.SearchOptions{})
	} else {
		value, err = instancesearch.Search(ctx, s.store, compiled, instancesearch.SearchOptions{})
	}
	elapsed := time.Since(start)
	if errors.Is(err, instancesearch.ErrTimeout) || elapsed > slowLog {
		s.logger.Warn("slow instance search", slog.String("caller", subject), slog.Duration("elapsed", elapsed), slog.Bool("timed_out", errors.Is(err, instancesearch.ErrTimeout)), slog.Int("cost", compiled.Cost), slog.String("query", instancesearch.FormatCEL(q.Where)))
	}
	if err != nil {
		if errors.Is(err, instancesearch.ErrTimeout) {
			return fail(err, "timeout")
		}
		if errors.Is(err, instancesearch.ErrNotFound) {
			return fail(err, "not_found")
		}
		s.logger.Error("instance search", slog.String("error", err.Error()))
		return fail(err, "error")
	}
	s.observe(start, c, explain, "ok")
	return value, result
}

// Search compiles, charges and executes a tenant-scoped query. Both HTTP and
// internal callers are recorded under the same user/anon metrics labels. Result includes
// cost, bucket state, and an error suitable for HTTP translation.
func (s *Service) Search(ctx context.Context, c Caller, q chroniclesdk.InstanceSearchQuery) (instancesearch.Page, Result) {
	v, r := s.run(ctx, c, q, uuid.Nil, false)
	if v == nil {
		return instancesearch.Page{}, r
	}
	return v.(instancesearch.Page), r
}
func (s *Service) Explain(ctx context.Context, c Caller, q chroniclesdk.InstanceSearchQuery, id uuid.UUID) (instancesearch.Explanation, Result) {
	v, r := s.run(ctx, c, q, id, true)
	if v == nil {
		return instancesearch.Explanation{}, r
	}
	return v.(instancesearch.Explanation), r
}
