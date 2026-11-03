package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/google/uuid"
)

const (
	// instanceSearchMaxConcurrent caps searches running at once per process
	// so heavy searches can never hold more than a few pool connections.
	instanceSearchMaxConcurrent = 6
	// instanceSearchSlowLog is the duration above which a search is logged.
	instanceSearchSlowLog = 2 * time.Second
)

const (
	instanceSearchUserRefillPerMinute = 60
	instanceSearchFreeBurst           = 100
	instanceSearchHonoredBurst        = 300
	instanceSearchReveredBurst        = 800
	instanceSearchExaltedBurst        = 2000
)

var (
	// Logged-in buckets share a refill rate but get more room at higher
	// supporter tiers. The free bucket takes five minutes to refill from empty.
	instanceSearchUserLimit = ratelimit.PerMinute(instanceSearchUserRefillPerMinute, instanceSearchFreeBurst)
	// Anonymous users only get cheap queries; bucketed per IP.
	instanceSearchAnonLimit = ratelimit.PerMinute(20, 40)
)

type instanceSearchUserLimitResolver func(context.Context, uuid.UUID) (ratelimit.Limit, error)

type instanceSearch struct {
	logger           *slog.Logger
	store            database.Store
	users            *ratelimit.Limiter
	anon             *ratelimit.Limiter
	resolveUserLimit instanceSearchUserLimitResolver
	slots            chan struct{}
	metrics          *instanceSearchMetrics
}

type instanceSearchMetrics struct {
	duration  *prometheus.HistogramVec
	cost      *prometheus.HistogramVec
	fieldUses *prometheus.CounterVec
}

func newInstanceSearch(logger *slog.Logger, store database.Store, registry prometheus.Registerer, resolveUserLimit instanceSearchUserLimitResolver) *instanceSearch {
	factory := promauto.With(registry)
	if resolveUserLimit == nil {
		resolveUserLimit = func(context.Context, uuid.UUID) (ratelimit.Limit, error) {
			return instanceSearchUserLimit, nil
		}
	}
	return &instanceSearch{
		logger:           logger.With(slog.String("component", "instance_search")),
		store:            store,
		users:            ratelimit.New(store, "instance_search", instanceSearchUserLimit),
		anon:             ratelimit.New(store, "instance_search_anon", instanceSearchAnonLimit),
		resolveUserLimit: resolveUserLimit,
		slots:            make(chan struct{}, instanceSearchMaxConcurrent),
		metrics: &instanceSearchMetrics{
			duration: factory.NewHistogramVec(prometheus.HistogramOpts{
				Namespace: "chronicle",
				Subsystem: "instance_search",
				Name:      "duration_seconds",
				Help:      "Instance search request duration by outcome and caller kind.",
				Buckets:   []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 7.5},
			}, []string{"outcome", "caller"}),
			cost: factory.NewHistogramVec(prometheus.HistogramOpts{
				Namespace: "chronicle",
				Subsystem: "instance_search",
				Name:      "cost",
				Help:      "Estimated cost of compiled instance searches.",
				// Covers the most a valid query can cost (MaxNodes x the
				// heaviest field, ~1280) so heavy queries don't all land in +Inf.
				Buckets: []float64{1, 2, 5, 10, 20, 40, 80, 160, 320, 640, 1280},
			}, []string{"caller"}),
			fieldUses: factory.NewCounterVec(prometheus.CounterOpts{
				Namespace: "chronicle",
				Subsystem: "instance_search",
				Name:      "field_uses_total",
				Help:      "Predicate fields used in compiled instance searches.",
			}, []string{"field"}),
		},
	}
}

// InstanceSearchCostHeader carries the compiled query's cost (rate-limit
// tokens) on every response for a query that compiled.
const InstanceSearchCostHeader = "Chronicle-Search-Cost"

// instanceSearchMaxBody bounds the request body. The node and list limits
// keep valid queries far below this.
const instanceSearchMaxBody = 64 << 10

// searchCaller is who is searching and which bucket they draw from.
type searchCaller struct {
	kind     string // "user" or "anon", the metrics label
	loggedIn bool
	subject  string
	limiter  *ratelimit.Limiter
	limit    ratelimit.Limit
}

func instanceSearchLimitForTier(tier string) ratelimit.Limit {
	burst := float64(instanceSearchFreeBurst)
	switch tier {
	case billing.TierHonored:
		burst = instanceSearchHonoredBurst
	case billing.TierRevered:
		burst = instanceSearchReveredBurst
	case billing.TierExalted:
		burst = instanceSearchExaltedBurst
	}
	return ratelimit.PerMinute(instanceSearchUserRefillPerMinute, burst)
}

func newInstanceSearchUserLimitResolver(zed *authz.Authz) instanceSearchUserLimitResolver {
	return func(ctx context.Context, userID uuid.UUID) (ratelimit.Limit, error) {
		return resolveInstanceSearchUserLimit(ctx, zed, userID)
	}
}

func resolveInstanceSearchUserLimit(ctx context.Context, zed *authz.Authz, userID uuid.UUID) (ratelimit.Limit, error) {
	actor := policy.New().User(userID)
	chronicle := policy.New().GlobalChronicle()
	permissions, err := zed.Check(ctx, nil,
		chronicle.CanHas_exalted_User(actor),
		chronicle.CanHas_revered_User(actor),
		chronicle.CanHas_honored_User(actor),
	)
	if err != nil {
		return ratelimit.Limit{}, err
	}
	if len(permissions) != 3 {
		return ratelimit.Limit{}, errors.New("check instance search supporter tier: expected 3 permission results")
	}
	return instanceSearchLimitForTier(highestSupporterTier(permissions[0], permissions[1], permissions[2])), nil
}

func (s *instanceSearch) caller(r *http.Request) (searchCaller, error) {
	if claims, ok := chronauth.AuthenticatedClaims(r.Context()); ok {
		limit, err := s.resolveUserLimit(r.Context(), claims.Subject)
		if err != nil {
			return searchCaller{}, err
		}
		return searchCaller{kind: "user", loggedIn: true, subject: ratelimit.UserSubject(claims.Subject.String()), limiter: s.users, limit: limit}, nil
	}
	return searchCaller{kind: "anon", subject: ratelimit.IPSubject(instanceSearchClientIP(r)), limiter: s.anon, limit: instanceSearchAnonLimit}, nil
}

func (s *instanceSearch) callerOrError(w http.ResponseWriter, r *http.Request) (searchCaller, bool) {
	c, err := s.caller(r)
	if err != nil {
		s.logger.Error("instance search supporter tier", slog.String("error", err.Error()))
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search is unavailable right now."})
		return searchCaller{}, false
	}
	return c, true
}

// peekHeaders sets the RateLimit-* headers on responses that did not take
// from the bucket. It is best effort: a failed peek only drops the headers.
func (s *instanceSearch) peekHeaders(ctx context.Context, w http.ResponseWriter, c searchCaller) {
	st, err := c.limiter.PeekWithLimit(ctx, c.subject, c.limit)
	if err != nil {
		s.logger.Error("instance search rate limit peek", slog.String("error", err.Error()))
		return
	}
	ratelimit.SetHeaders(w, st)
}

// admit spends cost tokens from the caller's bucket and takes a concurrency
// slot. When it returns false it has already written the response. Call
// release when the query is done.
func (s *instanceSearch) admit(ctx context.Context, w http.ResponseWriter, c searchCaller, cost int, observe func(string)) (release func(), ok bool) {
	res, err := c.limiter.TakeWithLimit(ctx, c.subject, float64(cost), c.limit)
	if err != nil {
		observe("error")
		s.logger.Error("instance search rate limit", slog.String("error", err.Error()))
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search is unavailable right now."})
		return nil, false
	}
	ratelimit.SetHeaders(w, res.Status)
	if !res.Allowed {
		observe("rate_limited")
		ratelimit.SetRetryAfter(w, res)
		msg := "You are searching too quickly. Try again shortly."
		if float64(cost) > c.limit.Burst {
			msg = "This search is too complex. Remove some filters and try again."
		}
		httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{Message: msg})
		return nil, false
	}

	select {
	case s.slots <- struct{}{}:
		return func() { <-s.slots }, true
	default:
		observe("busy")
		// The query never ran, so give the tokens back.
		if st, err := c.limiter.RefundWithLimit(ctx, c.subject, float64(cost), c.limit); err == nil {
			ratelimit.SetHeaders(w, st)
		} else {
			s.logger.Error("instance search rate limit refund", slog.String("error", err.Error()))
		}
		w.Header().Set("Retry-After", "1")
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Search is busy. Try again in a moment."})
		return nil, false
	}
}

// InstanceSearch runs an advanced instance search.
//
//	POST /api/v1/raidlogs/search
//
// Logged-in users may use the full query language. Anonymous users get a
// small subset (instancesearch.CheckAnonymous) and are told to log in for
// more. Searches are rate limited by estimated cost, capped in concurrency,
// and bounded by a statement timeout.
//
// Every response carries RateLimit-Limit / -Remaining / -Reset for the
// caller's bucket, and every response for a query that compiled carries
// Chronicle-Search-Cost.
func (api *API) InstanceSearch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	s := api.instanceSearch
	start := time.Now()
	c, ok := s.callerOrError(w, r)
	if !ok {
		return
	}
	observe := func(outcome string) {
		s.metrics.duration.WithLabelValues(outcome, c.kind).Observe(time.Since(start).Seconds())
	}

	var q chroniclesdk.InstanceSearchQuery
	if err := json.NewDecoder(io.LimitReader(r.Body, instanceSearchMaxBody)).Decode(&q); err != nil {
		observe("invalid")
		s.peekHeaders(ctx, w, c)
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Request body must be valid JSON.",
			Detail:  err.Error(),
		})
		return
	}

	compiled, err := instancesearch.CompileForContext(ctx, q, instancesearch.Options{})
	if err != nil {
		observe("invalid")
		s.peekHeaders(ctx, w, c)
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid search.",
			Detail:  err.Error(),
		})
		return
	}
	w.Header().Set(InstanceSearchCostHeader, strconv.Itoa(compiled.Cost))
	s.metrics.cost.WithLabelValues(c.kind).Observe(float64(compiled.Cost))

	if !c.loggedIn {
		if err := instancesearch.CheckAnonymous(q); err != nil {
			observe("login_required")
			s.peekHeaders(ctx, w, c)
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message:      "Log in to use advanced search.",
				Detail:       err.Error(),
				CallToAction: "Logged-in users can search by players, specs, parses, kill times and more.",
			})
			return
		}
	}

	release, ok := s.admit(ctx, w, c, compiled.Cost, observe)
	if !ok {
		return
	}
	defer release()

	for _, f := range compiled.Fields {
		s.metrics.fieldUses.WithLabelValues(f).Inc()
	}

	page, err := instancesearch.Search(ctx, s.store, compiled, instancesearch.SearchOptions{})
	elapsed := time.Since(start)
	if errors.Is(err, instancesearch.ErrTimeout) || elapsed > instanceSearchSlowLog {
		s.logger.Warn("slow instance search",
			slog.String("caller", c.subject),
			slog.Duration("elapsed", elapsed),
			slog.Bool("timed_out", errors.Is(err, instancesearch.ErrTimeout)),
			slog.Int("cost", compiled.Cost),
			slog.String("query", instancesearch.FormatCEL(q.Where)),
		)
	}
	switch {
	case errors.Is(err, instancesearch.ErrTimeout):
		observe("timeout")
		httpapi.Write(ctx, w, http.StatusUnprocessableEntity, chroniclesdk.Response{
			Message:      "This search took too long.",
			CallToAction: "Narrow it with a zone, realm or date range.",
		})
		return
	case err != nil:
		observe("error")
		s.logger.Error("instance search", slog.String("error", err.Error()))
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search failed."})
		return
	}
	observe("ok")
	httpapi.Write(ctx, w, http.StatusOK, page)
}

// InstanceSearchExplain explains why one run does or does not match a
// search: each condition's outcome with the run's actual values, and the
// players or pulls that satisfied each player / pull condition.
//
//	POST /api/v1/raidlogs/search/explain
//
// It follows the same rules as InstanceSearch (anonymous subset, rate limit,
// concurrency cap, timeout, tenant frame) and costs
// instancesearch.ExplainCost of the search's cost. Runs the caller cannot
// see are 404.
func (api *API) InstanceSearchExplain(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	s := api.instanceSearch
	start := time.Now()
	c, ok := s.callerOrError(w, r)
	if !ok {
		return
	}
	observe := func(outcome string) {
		s.metrics.duration.WithLabelValues("explain_"+outcome, c.kind).Observe(time.Since(start).Seconds())
	}

	var req chroniclesdk.InstanceSearchExplainRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, instanceSearchMaxBody)).Decode(&req); err != nil {
		observe("invalid")
		s.peekHeaders(ctx, w, c)
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Request body must be valid JSON.",
			Detail:  err.Error(),
		})
		return
	}
	q := chroniclesdk.InstanceSearchQuery{Where: req.Query.Where}

	compiled, err := instancesearch.CompileExplainForContext(ctx, q, req.InstanceID, instancesearch.Options{})
	if err != nil {
		observe("invalid")
		s.peekHeaders(ctx, w, c)
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid search.",
			Detail:  err.Error(),
		})
		return
	}
	w.Header().Set(InstanceSearchCostHeader, strconv.Itoa(compiled.Cost))

	if !c.loggedIn {
		if err := instancesearch.CheckAnonymous(q); err != nil {
			observe("login_required")
			s.peekHeaders(ctx, w, c)
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
				Message: "Log in to use advanced search.",
				Detail:  err.Error(),
			})
			return
		}
	}

	release, ok := s.admit(ctx, w, c, compiled.Cost, observe)
	if !ok {
		return
	}
	defer release()

	ex, err := instancesearch.Explain(ctx, s.store, compiled, instancesearch.SearchOptions{})
	switch {
	case errors.Is(err, instancesearch.ErrNotFound):
		observe("not_found")
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Run not found."})
		return
	case errors.Is(err, instancesearch.ErrTimeout):
		observe("timeout")
		s.logger.Warn("slow instance search explain",
			slog.String("caller", c.subject),
			slog.String("instance_id", req.InstanceID.String()),
			slog.String("query", instancesearch.FormatCEL(q.Where)),
		)
		httpapi.Write(ctx, w, http.StatusUnprocessableEntity, chroniclesdk.Response{Message: "Explaining this run took too long."})
		return
	case err != nil:
		observe("error")
		s.logger.Error("instance search explain", slog.String("error", err.Error()))
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Explain failed."})
		return
	}
	observe("ok")
	httpapi.Write(ctx, w, http.StatusOK, ex)
}

// InstanceSearchLimit returns the caller's search rate-limit bucket without
// spending from it. The same values are sent as RateLimit-* headers.
//
//	GET /api/v1/raidlogs/search/limit
func (api *API) InstanceSearchLimit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	s := api.instanceSearch
	c, ok := s.callerOrError(w, r)
	if !ok {
		return
	}
	st, err := c.limiter.PeekWithLimit(ctx, c.subject, c.limit)
	if err != nil {
		s.logger.Error("instance search rate limit peek", slog.String("error", err.Error()))
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search is unavailable right now."})
		return
	}
	ratelimit.SetHeaders(w, st)
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceSearchLimitResponse{
		LoggedIn:        c.loggedIn,
		Limit:           st.Limit,
		Remaining:       st.Remaining,
		RefillPerMinute: c.limit.PerSecond * 60,
		ResetSeconds:    int64(math.Ceil(st.Reset.Seconds())),
	})
}

// InstanceSearchFields describes the searchable fields and limits so UIs can
// build queries without duplicating the registry.
//
//	GET /api/v1/raidlogs/search/fields
func (api *API) InstanceSearchFields(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, instancesearch.Describe())
}

// instanceSearchClientIP returns the client IP, preferring the first
// X-Forwarded-For hop set by the Railway proxy.
func instanceSearchClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first, _, _ := strings.Cut(xff, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
