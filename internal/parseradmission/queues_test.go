package parseradmission

import (
	"context"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
	"io"
	"log/slog"
	"testing"
)

type localQueuesFake struct {
	added, removed int
	removeErr      error
}

func (q *localQueuesFake) Add(string, river.QueueConfig) error  { q.added++; return nil }
func (q *localQueuesFake) Remove(context.Context, string) error { q.removed++; return q.removeErr }

func TestLocalQueueReconciliation(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	state := queueState{present: true}
	queues := &localQueuesFake{}
	config := river.QueueConfig{MaxWorkers: 1}
	require.NoError(t, state.reconcile(t.Context(), queues, "native-log-parsing", config, false, logger))
	require.Equal(t, 1, queues.removed)
	require.Zero(t, queues.added)
	require.NoError(t, state.reconcile(t.Context(), queues, "native-log-parsing", config, false, logger))
	require.Equal(t, 1, queues.removed)
	require.NoError(t, state.reconcile(t.Context(), queues, "native-log-parsing", config, true, logger))
	require.Equal(t, 1, queues.added)
}

func TestInterruptedRemovalCompletesBeforeResume(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	state := queueState{present: true}
	queues := &localQueuesFake{removeErr: context.DeadlineExceeded}
	config := river.QueueConfig{MaxWorkers: 1}
	require.NoError(t, state.reconcile(t.Context(), queues, "native-log-parsing", config, false, logger))
	require.True(t, state.removing)
	queues.removeErr = nil
	require.NoError(t, state.reconcile(t.Context(), queues, "native-log-parsing", config, true, logger))
	require.Equal(t, 2, queues.removed)
	require.Equal(t, 1, queues.added)
	require.False(t, state.removing)
	require.True(t, state.present)
}
