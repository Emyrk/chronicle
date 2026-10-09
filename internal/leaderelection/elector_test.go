package leaderelection

import (
	"context"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

var nextTestLockKey atomic.Int64

type testCallbacks struct {
	starts atomic.Int32
	stops  atomic.Int32
}

func newTestLockKey() int64 {
	return -nextTestLockKey.Add(1)
}

func (c *testCallbacks) start(context.Context) error {
	c.starts.Add(1)
	return nil
}

func (c *testCallbacks) stop(context.Context) error {
	c.stops.Add(1)
	return nil
}

func newTestElector(t *testing.T, pool Pool, lockKey int64, callbacks *testCallbacks) *Elector {
	t.Helper()
	elector, err := New(Options{
		Name:           "test",
		LockKey:        lockKey,
		Pool:           pool,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		Registerer:     prometheus.NewRegistry(),
		RetryInterval:  10 * time.Millisecond,
		HealthInterval: 20 * time.Millisecond,
		Jitter:         func(d time.Duration) time.Duration { return d },
	}, Callbacks{Start: callbacks.start, Stop: callbacks.stop})
	require.NoError(t, err)
	return elector
}

func TestElectorsHaveOneLeaderAndFailOver(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	lockKey := newTestLockKey()
	firstCallbacks := &testCallbacks{}
	secondCallbacks := &testCallbacks{}
	first := newTestElector(t, pool, lockKey, firstCallbacks)
	second := newTestElector(t, pool, lockKey, secondCallbacks)

	require.NoError(t, first.Start(t.Context()))
	require.NoError(t, second.Start(t.Context()))
	t.Cleanup(func() {
		_ = first.Close(context.Background())
		_ = second.Close(context.Background())
	})

	require.Eventually(t, func() bool {
		return first.IsLeader() != second.IsLeader()
	}, 5*time.Second, 10*time.Millisecond)
	require.Equal(t, int32(1), firstCallbacks.starts.Load()+secondCallbacks.starts.Load())

	var leader, follower *Elector
	var leaderCallbacks, followerCallbacks *testCallbacks
	if first.IsLeader() {
		leader, follower = first, second
		leaderCallbacks, followerCallbacks = firstCallbacks, secondCallbacks
	} else {
		leader, follower = second, first
		leaderCallbacks, followerCallbacks = secondCallbacks, firstCallbacks
	}

	require.NoError(t, leader.Close(t.Context()))
	require.Eventually(t, follower.IsLeader, 5*time.Second, 10*time.Millisecond)
	require.Equal(t, int32(1), leaderCallbacks.stops.Load())
	require.Equal(t, int32(1), followerCallbacks.starts.Load())
}

func TestFollowerDoesNotRetainConnection(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	lockKey := newTestLockKey()
	leader := newTestElector(t, pool, lockKey, &testCallbacks{})
	follower := newTestElector(t, pool, lockKey, &testCallbacks{})

	require.NoError(t, leader.Start(t.Context()))
	require.True(t, leader.IsLeader())
	before := pool.Stat().AcquiredConns()
	require.NoError(t, follower.Start(t.Context()))
	require.False(t, follower.IsLeader())
	require.Eventually(t, func() bool {
		return pool.Stat().AcquiredConns() == before
	}, time.Second, 10*time.Millisecond)

	require.NoError(t, follower.Close(t.Context()))
	require.NoError(t, leader.Close(t.Context()))
}

func TestCloseStopsLeadershipOnce(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	callbacks := &testCallbacks{}
	elector := newTestElector(t, pool, newTestLockKey(), callbacks)

	require.NoError(t, elector.Start(t.Context()))
	require.True(t, elector.IsLeader())
	require.NoError(t, elector.Close(t.Context()))
	require.NoError(t, elector.Close(t.Context()))
	require.False(t, elector.IsLeader())
	require.Equal(t, int32(1), callbacks.starts.Load())
	require.Equal(t, int32(1), callbacks.stops.Load())
}
