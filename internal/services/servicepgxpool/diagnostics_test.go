package servicepgxpool

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestQuerySummary(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		sql  string
		want string
	}{
		{
			name: "sqlc name",
			sql:  "-- name: InstanceEvent :one\nSELECT * FROM log_instance_events",
			want: "-- name: InstanceEvent :one",
		},
		{
			name: "compact whitespace",
			sql:  " SELECT  *\n  FROM users ",
			want: "SELECT * FROM users",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := querySummary(tt.sql); got != tt.want {
				t.Fatalf("querySummary() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPoolDiagnosticsLogsSlowActivity(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	diagnostics := newPoolDiagnostics(logger)
	now := time.Date(2026, time.August, 26, 22, 47, 0, 0, time.UTC)
	diagnostics.now = func() time.Time { return now }

	conn := &pgx.Conn{}
	acquireCtx := context.WithValue(context.Background(), traceStartKey{}, traceStart{
		at:       now,
		callsite: "api/instances.go:70",
	})
	diagnostics.TraceAcquireEnd(acquireCtx, nil, pgxpool.TraceAcquireEndData{Conn: conn})

	now = now.Add(time.Second)
	queryCtx := diagnostics.TraceQueryStart(context.Background(), conn, pgx.TraceQueryStartData{
		SQL: "-- name: InstanceEvent :one\nSELECT events FROM log_instance_events",
	})
	now = now.Add(6 * time.Second)
	diagnostics.LogActiveConnections(context.Background())
	diagnostics.TraceQueryEnd(queryCtx, conn, pgx.TraceQueryEndData{})
	now = now.Add(4 * time.Second)
	diagnostics.TraceRelease(nil, pgxpool.TraceReleaseData{Conn: conn})

	got := logs.String()
	for _, want := range []string{
		"postgres pool holder during failed health check",
		"-- name: InstanceEvent :one",
		"query_running_for",
		"slow postgres query",
		"postgres connection held for a long time",
		"api/instances.go:70",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("logs do not contain %q:\n%s", want, got)
		}
	}
}
