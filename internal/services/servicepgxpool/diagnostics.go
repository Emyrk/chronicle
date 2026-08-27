package servicepgxpool

import (
	"context"
	"fmt"
	"log/slog"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	slowPoolAcquireThreshold = time.Second
	slowQueryThreshold       = 5 * time.Second
	slowConnectionHold       = 10 * time.Second
	maxDiagnosticHolders     = 10
)

type traceStartKey struct{}

type traceStart struct {
	at       time.Time
	query    string
	callsite string
}

type connectionActivity struct {
	acquiredAt time.Time
	callsite   string
	query      string
	queryAt    time.Time
}

type poolDiagnostics struct {
	logger *slog.Logger
	now    func() time.Time

	mu     sync.Mutex
	active map[*pgx.Conn]connectionActivity
}

func newPoolDiagnostics(logger *slog.Logger) *poolDiagnostics {
	return &poolDiagnostics{
		logger: logger,
		now:    time.Now,
		active: make(map[*pgx.Conn]connectionActivity),
	}
}

func (d *poolDiagnostics) TraceAcquireStart(ctx context.Context, _ *pgxpool.Pool, _ pgxpool.TraceAcquireStartData) context.Context {
	return context.WithValue(ctx, traceStartKey{}, traceStart{
		at:       d.now(),
		callsite: callerSummary(),
	})
}

func (d *poolDiagnostics) TraceAcquireEnd(ctx context.Context, pool *pgxpool.Pool, data pgxpool.TraceAcquireEndData) {
	start, _ := ctx.Value(traceStartKey{}).(traceStart)
	if start.at.IsZero() {
		start.at = d.now()
	}

	wait := d.now().Sub(start.at)
	if wait >= slowPoolAcquireThreshold {
		d.logger.WarnContext(ctx, "slow postgres pool acquisition",
			slog.Duration("wait", wait),
			slog.String("caller", start.callsite),
			slog.Any("error", data.Err),
			poolStatsAttr(pool.Stat()),
		)
	}
	if data.Err != nil || data.Conn == nil {
		return
	}

	d.mu.Lock()
	d.active[data.Conn] = connectionActivity{
		acquiredAt: d.now(),
		callsite:   start.callsite,
	}
	d.mu.Unlock()
}

func (d *poolDiagnostics) TraceRelease(_ *pgxpool.Pool, data pgxpool.TraceReleaseData) {
	d.mu.Lock()
	activity, ok := d.active[data.Conn]
	delete(d.active, data.Conn)
	d.mu.Unlock()
	if !ok {
		return
	}

	held := d.now().Sub(activity.acquiredAt)
	if held >= slowConnectionHold {
		d.logger.Warn("postgres connection held for a long time",
			slog.Duration("held_for", held),
			slog.String("caller", activity.callsite),
			slog.String("last_query", activity.query),
		)
	}
}

func (d *poolDiagnostics) TraceQueryStart(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	start := traceStart{
		at:       d.now(),
		query:    querySummary(data.SQL),
		callsite: callerSummary(),
	}

	d.mu.Lock()
	if activity, ok := d.active[conn]; ok {
		activity.query = start.query
		activity.queryAt = start.at
		d.active[conn] = activity
	}
	d.mu.Unlock()

	return context.WithValue(ctx, traceStartKey{}, start)
}

func (d *poolDiagnostics) TraceQueryEnd(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryEndData) {
	start, _ := ctx.Value(traceStartKey{}).(traceStart)
	duration := d.now().Sub(start.at)

	d.mu.Lock()
	if activity, ok := d.active[conn]; ok {
		activity.queryAt = time.Time{}
		d.active[conn] = activity
	}
	d.mu.Unlock()

	if duration >= slowQueryThreshold {
		d.logger.WarnContext(ctx, "slow postgres query",
			slog.Duration("duration", duration),
			slog.String("query", start.query),
			slog.String("caller", start.callsite),
			slog.Any("error", data.Err),
		)
	}
}

func (d *poolDiagnostics) LogActiveConnections(ctx context.Context) {
	type holder struct {
		activity connectionActivity
		held     time.Duration
	}

	now := d.now()
	d.mu.Lock()
	holders := make([]holder, 0, len(d.active))
	for _, activity := range d.active {
		holders = append(holders, holder{
			activity: activity,
			held:     now.Sub(activity.acquiredAt),
		})
	}
	d.mu.Unlock()

	sort.Slice(holders, func(i, j int) bool { return holders[i].held > holders[j].held })
	if len(holders) > maxDiagnosticHolders {
		holders = holders[:maxDiagnosticHolders]
	}
	for i, holder := range holders {
		attrs := []any{
			"rank", i + 1,
			"held_for", holder.held,
			"caller", holder.activity.callsite,
			"query", holder.activity.query,
		}
		if !holder.activity.queryAt.IsZero() {
			attrs = append(attrs, "query_running_for", now.Sub(holder.activity.queryAt))
		}
		d.logger.WarnContext(ctx, "postgres pool holder during failed health check", attrs...)
	}
}

func querySummary(sql string) string {
	trimmed := strings.TrimSpace(sql)
	if strings.HasPrefix(trimmed, "-- name:") {
		if end := strings.IndexByte(trimmed, '\n'); end >= 0 {
			return strings.TrimSpace(trimmed[:end])
		}
	}
	trimmed = strings.Join(strings.Fields(trimmed), " ")
	const maxLength = 160
	if len(trimmed) > maxLength {
		return trimmed[:maxLength] + "..."
	}
	return trimmed
}

func callerSummary() string {
	pcs := make([]uintptr, 24)
	n := runtime.Callers(3, pcs)
	frames := runtime.CallersFrames(pcs[:n])
	callers := make([]string, 0, 3)
	for {
		frame, more := frames.Next()
		if !strings.Contains(frame.File, "/pgx/") &&
			!strings.Contains(frame.File, "/pgxpool/") &&
			!strings.HasSuffix(frame.File, "/diagnostics.go") &&
			!strings.HasPrefix(frame.Function, "runtime.") {
			callers = append(callers, fmt.Sprintf("%s:%d", frame.File, frame.Line))
			if len(callers) == cap(callers) {
				break
			}
		}
		if !more {
			break
		}
	}
	return strings.Join(callers, " <- ")
}
