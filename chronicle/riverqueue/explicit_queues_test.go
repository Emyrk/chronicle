package riverqueue

import (
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestExplicitQueuesHasNoDefaultWorkers(t *testing.T) {
	t.Parallel()
	q, err := New(t.Context(), Options{ExplicitQueues: true, DisableUI: true})
	require.NoError(t, err)
	require.Empty(t, q.queues)
	q.AddQueue("native-log-parsing", river.QueueConfig{MaxWorkers: 1})
	require.Len(t, q.queues, 1)
	require.NotContains(t, q.queues, river.QueueDefault)
}
func TestOrdinaryQueuesKeepDefaultWorkers(t *testing.T) {
	t.Parallel()
	q, err := New(t.Context(), Options{})
	require.NoError(t, err)
	require.Equal(t, 5, q.queues[river.QueueDefault].MaxWorkers)
}
