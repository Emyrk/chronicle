package api

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type fakeDiscoveryStats struct {
	calls   atomic.Int32
	release chan struct{}
	rows    []database.TenantDiscoveryStatsRow
}

func (f *fakeDiscoveryStats) TenantDiscoveryStats(context.Context, pgtype.Timestamptz) ([]database.TenantDiscoveryStatsRow, error) {
	f.calls.Add(1)
	<-f.release
	return f.rows, nil
}

func TestDiscoveryStatsCacheCached(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	q := &fakeDiscoveryStats{
		release: make(chan struct{}),
		rows:    []database.TenantDiscoveryStatsRow{{TenantID: id, UniquePlayerCount: 42}},
	}
	var c discoveryStatsCache

	// Cold cache: returns immediately while the query is still running.
	require.Nil(t, c.cached(context.Background(), q))
	require.Eventually(t, func() bool { return q.calls.Load() == 1 }, time.Second, 5*time.Millisecond)
	require.Nil(t, c.cached(context.Background(), q), "a running refresh is not started twice")

	close(q.release)
	require.Eventually(t, func() bool {
		return c.cached(context.Background(), q)[id].UniquePlayerCount == 42
	}, time.Second, 5*time.Millisecond)
	require.Equal(t, int32(1), q.calls.Load(), "fresh stats are not re-queried")
}
