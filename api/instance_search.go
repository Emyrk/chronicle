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
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
)

const (
	// instanceSearchMaxConcurrent caps searches running at once per process
	// so heavy searches can never hold more than a few pool connections.
	instanceSearchMaxConcurrent = 6
	// instanceSearchSlowLog is the duration above which a search is logged.
	instanceSearchSlowLog = 2 * time.Second
)

var (
	// Logged-in users: about 4 heavy or 60 simple searches a minute, with
	// room for a burst. Buckets refill fully in under 3 minutes, well inside
	// ratelimit.IdleBucketTTL.
	instanceSearchUserLimit = ratelimit.PerMinute(120, 300)
	// Anonymous users only get cheap queries; bucketed per IP.
	instanceSearchAnonLimit = ratelimit.PerMinute(20, 40)
)

type instanceSearch struct {
	logger  *slog.Logger
	store   database.Store
	users   *ratelimit.Limiter
	anon    *ratelimit.Limiter
	slots   chan struct{}
	metrics *instanceSearchMetrics
}

type instanceSearchMetrics struct {
	duration  *prometheus.HistogramVec
	cost      *prometheus.HistogramVec
	fieldUses *prometheus.CounterVec
}

func newInstanceSearch(logger *slog.Logger, store database.Store, registry prometheus.Registerer) *instanceSearch {
	factory := promauto.With(registry)
	return &instanceSearch{
		logger: logger.With(slog.String("component", "instance_search")),
		store:  store,
		users:  ratelimit.New(store, "instance_search", instanceSearchUserLimit),
		anon:   ratelimit.New(store, "instance_search_anon", instanceSearchAnonLimit),
		slots:  make(chan struct{}, instanceSearchMaxConcurrent),
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
				Buckets:   []float64{1, 2, 5, 10, 20, 40, 80, 160},
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
}

func (s *instanceSearch) caller(r *http.Request) searchCaller {
	if claims, ok := chronauth.AuthenticatedClaims(r.Context()); ok {
		return searchCaller{kind: "user", loggedIn: true, subject: ratelimit.UserSubject(claims.Subject.String()), limiter: s.users}
	}
	return searchCaller{kind: "anon", subject: ratelimit.IPSubject(instanceSearchClientIP(r)), limiter: s.anon}
}

// peekHeaders sets the RateLimit-* headers on responses that did not take
// from the bucket. It is best effort: a failed peek only drops the headers.
func (s *instanceSearch) peekHeaders(ctx context.Context, w http.ResponseWriter, c searchCaller) {
	st, err := c.limiter.Peek(ctx, c.subject)
	if err != nil {
		s.logger.Error("instance search rate limit peek", slog.String("error", err.Error()))
		return
	}
	ratelimit.SetHeaders(w, st)
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
	c := s.caller(r)
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

	res, err := c.limiter.Take(ctx, c.subject, float64(compiled.Cost))
	if err != nil {
		observe("error")
		s.logger.Error("instance search rate limit", slog.String("error", err.Error()))
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Search is unavailable right now."})
		return
	}
	ratelimit.SetHeaders(w, res.Status)
	if !res.Allowed {
		observe("rate_limited")
		ratelimit.SetRetryAfter(w, res)
		msg := "You are searching too quickly. Try again shortly."
		if float64(compiled.Cost) > c.limiter.Limit().Burst {
			msg = "This search is too complex. Remove some filters and try again."
		}
		httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{Message: msg})
		return
	}

	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		observe("busy")
		// The search never ran, so give the tokens back.
		if st, err := c.limiter.Refund(ctx, c.subject, float64(compiled.Cost)); err == nil {
			ratelimit.SetHeaders(w, st)
		} else {
			s.logger.Error("instance search rate limit refund", slog.String("error", err.Error()))
		}
		w.Header().Set("Retry-After", "1")
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Search is busy. Try again in a moment."})
		return
	}

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

// InstanceSearchLimit returns the caller's search rate-limit bucket without
// spending from it. The same values are sent as RateLimit-* headers.
//
//	GET /api/v1/raidlogs/search/limit
func (api *API) InstanceSearchLimit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	s := api.instanceSearch
	c := s.caller(r)
	st, err := c.limiter.Peek(ctx, c.subject)
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
		RefillPerMinute: c.limiter.Limit().PerSecond * 60,
		ResetSeconds:    int64(math.Ceil(st.Reset.Seconds())),
	})
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
