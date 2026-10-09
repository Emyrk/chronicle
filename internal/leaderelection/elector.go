package leaderelection

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

const (
	defaultRetryInterval  = 5 * time.Second
	defaultHealthInterval = 10 * time.Second
)

// Pool is the subset of pgxpool.Pool needed by an Elector.
type Pool interface {
	Acquire(context.Context) (*pgxpool.Conn, error)
}

// Options configures an advisory-lock leader election.
type Options struct {
	Name           string
	LockKey        int64
	Pool           Pool
	Logger         *slog.Logger
	Registerer     prometheus.Registerer
	RetryInterval  time.Duration
	HealthInterval time.Duration
	Jitter         func(time.Duration) time.Duration
}

// Callbacks run when this process gains or loses leadership. Calls are
// serialized: Stop is never called before a successful Start returns.
type Callbacks struct {
	Start func(context.Context) error
	Stop  func(context.Context) error
}

// Elector holds a PostgreSQL session-level advisory lock while it is leader.
// Followers do not retain a database connection.
type Elector struct {
	opts      Options
	callbacks Callbacks

	mu      sync.Mutex
	started bool
	leader  bool
	conn    *pgxpool.Conn
	cancel  context.CancelFunc
	done    chan struct{}

	leaderGauge prometheus.Gauge
	transitions *prometheus.CounterVec
	failures    *prometheus.CounterVec
}

// New constructs an Elector. Call Start to make the initial election attempt
// and begin retrying in the background.
func New(opts Options, callbacks Callbacks) (*Elector, error) {
	if opts.Name == "" {
		return nil, errors.New("leader election name is required")
	}
	if opts.Pool == nil {
		return nil, errors.New("leader election pool is required")
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Registerer == nil {
		opts.Registerer = prometheus.DefaultRegisterer
	}
	if opts.RetryInterval <= 0 {
		opts.RetryInterval = defaultRetryInterval
	}
	if opts.HealthInterval <= 0 {
		opts.HealthInterval = defaultHealthInterval
	}
	if opts.Jitter == nil {
		opts.Jitter = func(d time.Duration) time.Duration {
			// Spread follower retries between 80% and 120% of the interval.
			return time.Duration(float64(d) * (0.8 + rand.Float64()*0.4))
		}
	}
	if callbacks.Start == nil {
		callbacks.Start = func(context.Context) error { return nil }
	}
	if callbacks.Stop == nil {
		callbacks.Stop = func(context.Context) error { return nil }
	}

	labels := prometheus.Labels{"election": opts.Name}
	e := &Elector{
		opts:      opts,
		callbacks: callbacks,
		leaderGauge: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace:   "chronicle",
			Subsystem:   "leader_election",
			Name:        "leader",
			Help:        "Whether this process currently holds the named leader-election lock.",
			ConstLabels: labels,
		}),
		transitions: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace:   "chronicle",
			Subsystem:   "leader_election",
			Name:        "transitions_total",
			Help:        "Leadership transitions by type.",
			ConstLabels: labels,
		}, []string{"transition"}),
		failures: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace:   "chronicle",
			Subsystem:   "leader_election",
			Name:        "failures_total",
			Help:        "Leader-election failures by bounded reason.",
			ConstLabels: labels,
		}, []string{"reason"}),
	}
	if err := opts.Registerer.Register(e.leaderGauge); err != nil {
		return nil, fmt.Errorf("register leader gauge: %w", err)
	}
	if err := opts.Registerer.Register(e.transitions); err != nil {
		return nil, fmt.Errorf("register transition counter: %w", err)
	}
	if err := opts.Registerer.Register(e.failures); err != nil {
		return nil, fmt.Errorf("register failure counter: %w", err)
	}
	return e, nil
}

// Start makes one synchronous election attempt, then continues health checks
// or follower retries in the background. An activation failure during the
// initial attempt is returned so a broken single-node configuration still
// fails startup as it did before leader election was introduced.
func (e *Elector) Start(ctx context.Context) error {
	e.mu.Lock()
	if e.started {
		e.mu.Unlock()
		return nil
	}
	runCtx, cancel := context.WithCancel(ctx)
	e.started = true
	e.cancel = cancel
	e.done = make(chan struct{})
	done := e.done
	e.mu.Unlock()

	if err := e.tryAcquire(runCtx); err != nil {
		cancel()
		e.mu.Lock()
		e.started = false
		e.cancel = nil
		e.done = nil
		e.mu.Unlock()
		close(done)
		return err
	}

	go e.run(runCtx, done)
	return nil
}

func (e *Elector) run(ctx context.Context, done chan struct{}) {
	defer func() {
		e.mu.Lock()
		e.started = false
		e.cancel = nil
		e.done = nil
		e.mu.Unlock()
		close(done)
	}()

	for {
		interval := e.opts.RetryInterval
		if e.IsLeader() {
			interval = e.opts.HealthInterval
		}
		timer := time.NewTimer(e.opts.Jitter(interval))
		select {
		case <-ctx.Done():
			if err := e.relinquish(context.Background(), "shutdown"); err != nil {
				e.opts.Logger.Error("failed to relinquish leadership", slog.String("election", e.opts.Name), slog.String("error", err.Error()))
			}
			timer.Stop()
			return
		case <-timer.C:
		}

		if e.IsLeader() {
			e.checkHealth(ctx)
			continue
		}
		if err := e.tryAcquire(ctx); err != nil && ctx.Err() == nil {
			e.opts.Logger.Warn("leader election attempt failed", slog.String("election", e.opts.Name), slog.String("error", err.Error()))
		}
	}
}

func (e *Elector) tryAcquire(ctx context.Context) error {
	conn, err := e.opts.Pool.Acquire(ctx)
	if err != nil {
		e.failures.WithLabelValues("acquire_connection").Inc()
		return fmt.Errorf("acquire leader election connection: %w", err)
	}

	queries := database.NewQueries(conn)
	acquired, err := queries.TryAcquireAdvisoryLock(ctx, e.opts.LockKey)
	if err != nil {
		conn.Release()
		e.failures.WithLabelValues("acquire_lock").Inc()
		return fmt.Errorf("try advisory lock: %w", err)
	}
	if !acquired {
		conn.Release()
		return nil
	}

	if err := e.callbacks.Start(ctx); err != nil {
		e.failures.WithLabelValues("activate").Inc()
		_, unlockErr := queries.ReleaseAdvisoryLock(context.Background(), e.opts.LockKey)
		conn.Release()
		return errors.Join(fmt.Errorf("activate leader: %w", err), unlockError(unlockErr))
	}
	if err := ctx.Err(); err != nil {
		stopErr := e.callbacks.Stop(context.Background())
		_, unlockErr := queries.ReleaseAdvisoryLock(context.Background(), e.opts.LockKey)
		conn.Release()
		return errors.Join(err, stopErr, unlockError(unlockErr))
	}

	e.mu.Lock()
	e.conn = conn
	e.leader = true
	e.mu.Unlock()
	e.leaderGauge.Set(1)
	e.transitions.WithLabelValues("acquired").Inc()
	e.opts.Logger.Info("acquired leadership", slog.String("election", e.opts.Name))
	return nil
}

func (e *Elector) checkHealth(ctx context.Context) {
	e.mu.Lock()
	conn := e.conn
	e.mu.Unlock()
	if conn == nil {
		return
	}

	healthCtx, cancel := context.WithTimeout(ctx, e.opts.HealthInterval)
	err := conn.Ping(healthCtx)
	cancel()
	if err == nil {
		return
	}

	e.failures.WithLabelValues("connection_lost").Inc()
	e.opts.Logger.Error("leadership connection lost", slog.String("election", e.opts.Name), slog.String("error", err.Error()))
	if relinquishErr := e.relinquish(context.Background(), "connection_lost"); relinquishErr != nil {
		e.opts.Logger.Error("failed to clean up lost leadership", slog.String("election", e.opts.Name), slog.String("error", relinquishErr.Error()))
	}
}

func (e *Elector) relinquish(ctx context.Context, reason string) error {
	e.mu.Lock()
	if !e.leader {
		e.mu.Unlock()
		return nil
	}
	conn := e.conn
	e.conn = nil
	e.leader = false
	e.mu.Unlock()

	e.leaderGauge.Set(0)
	e.transitions.WithLabelValues("lost").Inc()
	e.opts.Logger.Info("relinquishing leadership", slog.String("election", e.opts.Name), slog.String("reason", reason))

	stopErr := e.callbacks.Stop(ctx)
	unlocked, unlockErr := database.NewQueries(conn).ReleaseAdvisoryLock(ctx, e.opts.LockKey)
	conn.Release()
	if unlockErr == nil && !unlocked {
		unlockErr = errors.New("advisory lock was not held by the leadership connection")
	}
	if stopErr != nil {
		e.failures.WithLabelValues("deactivate").Inc()
	}
	if unlockErr != nil {
		e.failures.WithLabelValues("release_lock").Inc()
	}
	return errors.Join(stopErr, unlockError(unlockErr))
}

func unlockError(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("release advisory lock: %w", err)
}

// IsLeader reports whether this process currently owns the advisory lock and
// has successfully run its activation callback.
func (e *Elector) IsLeader() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.leader
}

// Close stops the election loop and waits for any held leadership to be
// relinquished. It is safe to call more than once.
func (e *Elector) Close(ctx context.Context) error {
	e.mu.Lock()
	if !e.started {
		e.mu.Unlock()
		return nil
	}
	cancel := e.cancel
	done := e.done
	e.mu.Unlock()

	cancel()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
