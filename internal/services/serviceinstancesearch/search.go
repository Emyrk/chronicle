// Package serviceinstancesearch owns instance-search admission and execution for
// both HTTP and trusted in-process callers. Share one Service per API replica.
package serviceinstancesearch

import (
	"context"
	"errors"
	"log/slog"
	"math"
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
const runtimeTokensPerSecond = 10
const accountingTimeout = 2 * time.Second

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

func AccessForTier(tier string) UserAccess {
	return UserAccess{Limit: LimitForTier(tier), Tier: tier}
}

func tierAtLeast(tier, minimum string) bool {
	rank := map[string]int{"free": 0, billing.TierHonored: 1, billing.TierRevered: 2, billing.TierExalted: 3}
	return rank[tier] >= rank[minimum]
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
type UserAccess struct {
	Limit ratelimit.Limit
	Tier  string
}

type UserAccessResolver func(context.Context, uuid.UUID) (UserAccess, error)
type Service struct {
	logger            *slog.Logger
	store             database.Store
	users, anon       *ratelimit.Limiter
	resolveUserAccess UserAccessResolver
	search            func(context.Context, database.Store, instancesearch.Compiled, instancesearch.SearchOptions) (instancesearch.Page, error)
	explain           func(context.Context, database.Store, instancesearch.CompiledExplain, instancesearch.SearchOptions) (instancesearch.Explanation, error)
	runtimeCost       func(time.Duration) int
	slots             chan struct{}
	duration, cost    *prometheus.HistogramVec
	fieldUses         *prometheus.CounterVec
}
type Result struct {
	Cost         int
	RuntimeCost  int
	Status       ratelimit.Status
	RetryAfter   time.Duration
	RequiredTier string
	Err          error
}

var (
	ErrInvalid           = errors.New("invalid search")
	ErrLoginRequired     = errors.New("login required")
	ErrRateLimited       = errors.New("rate limited")
	ErrTooComplex        = errors.New("search too complex")
	ErrBusy              = errors.New("search busy")
	ErrSupporterRequired = errors.New("supporter tier required")
)

// New constructs the shared service. Pass this same pointer to HTTP and internal callers.
func New(logger *slog.Logger, store database.Store, registry prometheus.Registerer, resolver UserAccessResolver) *Service {
	if resolver == nil {
		resolver = func(context.Context, uuid.UUID) (UserAccess, error) { return AccessForTier("free"), nil }
	}
	f := promauto.With(registry)
	return &Service{logger: logger.With(slog.String("component", "instance_search")), store: store,
		users: ratelimit.New(store, "instance_search", UserLimit), anon: ratelimit.New(store, "instance_search_anon", AnonLimit),
		resolveUserAccess: resolver, search: instancesearch.Search, explain: instancesearch.Explain,
		runtimeCost: runtimeCost, slots: make(chan struct{}, MaxConcurrent),
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

func (s *Service) Slots() chan struct{} { return s.slots } // Useful for deterministic admission tests.
func (s *Service) SetUserAccessResolver(resolver UserAccessResolver) {
	s.resolveUserAccess = resolver
}
func (s *Service) kind(c Caller) string {
	if c.UserID != uuid.Nil {
		return "user"
	}
	return "anon"
}
func (s *Service) bucket(ctx context.Context, c Caller) (*ratelimit.Limiter, string, UserAccess, error) {
	if c.UserID == uuid.Nil {
		return s.anon, ratelimit.IPSubject(c.IP), UserAccess{Limit: AnonLimit, Tier: "free"}, nil
	}
	access, err := s.resolveUserAccess(ctx, c.UserID)
	return s.users, ratelimit.UserSubject(c.UserID.String()), access, err
}

// TierAtLeast reports whether tier includes minimum. Tier names use the billing
// supporter tier strings plus "free".
func TierAtLeast(tier, minimum string) bool { return tierAtLeast(tier, minimum) }

// PeekAccess reads the shared bucket and resolved supporter access without
// spending tokens.
func (s *Service) PeekAccess(ctx context.Context, c Caller) (ratelimit.Status, UserAccess, error) {
	limiter, subject, access, err := s.bucket(ctx, c)
	if err != nil {
		return ratelimit.Status{}, access, err
	}
	st, err := limiter.PeekWithLimit(ctx, subject, access.Limit)
	return st, access, err
}

// ExecuteAdvanced admits and runs another advanced-search workload through the
// exact same user bucket, concurrency slots, and runtime accounting as instance
// search. The tier check happens before any token charge.
func (s *Service) ExecuteAdvanced(ctx context.Context, c Caller, requiredTier string, staticCost int, fields []string, execute func(context.Context, database.Store) (any, error)) (any, Result) {
	start := time.Now()
	result := Result{Cost: staticCost, RequiredTier: requiredTier}
	fail := func(err error, outcome string) (any, Result) {
		result.Err = err
		s.observe(start, c, false, outcome)
		return nil, result
	}
	limiter, subject, access, err := s.bucket(ctx, c)
	if err != nil {
		return fail(err, "error")
	}
	limit := access.Limit
	if c.UserID == uuid.Nil || !tierAtLeast(access.Tier, requiredTier) {
		result.Status, _ = limiter.PeekWithLimit(ctx, subject, limit)
		return fail(ErrSupporterRequired, "supporter_required")
	}
	take, err := limiter.TakeWithLimit(ctx, subject, float64(staticCost), limit)
	if err != nil {
		return fail(err, "error")
	}
	result.Status = take.Status
	if !take.Allowed {
		result.RetryAfter = take.RetryAfter
		if float64(staticCost) > limit.Burst {
			return fail(ErrTooComplex, "rate_limited")
		}
		return fail(ErrRateLimited, "rate_limited")
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		if st, refundErr := limiter.RefundWithLimit(ctx, subject, float64(staticCost), limit); refundErr == nil {
			result.Status = st
		} else {
			s.logger.Error("advanced search rate limit refund", slog.String("error", refundErr.Error()))
		}
		result.RetryAfter = time.Second
		return fail(ErrBusy, "busy")
	}
	for _, field := range fields {
		s.fieldUses.WithLabelValues(field).Inc()
	}
	executionStart := time.Now()
	value, err := execute(ctx, s.store)
	s.chargeRuntime(ctx, limiter, subject, limit, time.Since(executionStart), &result)
	if err != nil {
		return fail(err, "error")
	}
	s.observe(start, c, false, "ok")
	return value, result
}

// ResolveCaller checks the user's supporter permissions without touching the
// rate bucket. HTTP calls it on malformed bodies to preserve auth-error precedence.
func (s *Service) ResolveCaller(ctx context.Context, c Caller) error {
	_, _, _, err := s.bucket(ctx, c)
	return err
}

func (s *Service) Peek(ctx context.Context, c Caller) (ratelimit.Status, ratelimit.Limit, error) {
	limiter, subject, access, err := s.bucket(ctx, c)
	if err != nil {
		return ratelimit.Status{}, access.Limit, err
	}
	st, err := limiter.PeekWithLimit(ctx, subject, access.Limit)
	return st, access.Limit, err
}
func (s *Service) observe(start time.Time, c Caller, explain bool, outcome string) {
	if explain {
		outcome = "explain_" + outcome
	}
	s.duration.WithLabelValues(outcome, s.kind(c)).Observe(time.Since(start).Seconds())
}
func runtimeCost(elapsed time.Duration) int {
	if elapsed <= 0 {
		return 0
	}
	return int(math.Ceil(elapsed.Seconds() * runtimeTokensPerSecond))
}

func (s *Service) chargeRuntime(ctx context.Context, limiter *ratelimit.Limiter, subject string, limit ratelimit.Limit, elapsed time.Duration, result *Result) {
	cost := s.runtimeCost(elapsed)
	if cost == 0 {
		return
	}
	accountingCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), accountingTimeout)
	defer cancel()
	status, err := limiter.ForceTakeWithLimit(accountingCtx, subject, float64(cost), limit)
	if err != nil {
		s.logger.Error("instance search runtime charge", slog.String("caller", subject), slog.Int("cost", cost), slog.String("error", err.Error()))
		return
	}
	result.RuntimeCost = cost
	result.Status = status
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
	limiter, subject, access, err := s.bucket(ctx, c)
	if err != nil {
		return fail(err, "error")
	}
	limit := access.Limit
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
	if !explain && q.Sort != nil {
		minimum := instancesearch.SortMinimumTier(compiled.Sort.Field)
		if !tierAtLeast(access.Tier, string(minimum)) {
			result.RequiredTier = string(minimum)
			result.Status, _ = limiter.PeekWithLimit(ctx, subject, limit)
			return fail(ErrSupporterRequired, "supporter_required")
		}
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
	executionStart := time.Now()
	if explain {
		value, err = s.explain(ctx, s.store, compiledExplain, instancesearch.SearchOptions{})
	} else {
		value, err = s.search(ctx, s.store, compiled, instancesearch.SearchOptions{})
	}
	s.chargeRuntime(ctx, limiter, subject, limit, time.Since(executionStart), &result)
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
