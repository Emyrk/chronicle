package riverqueue

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestRemoveQueue(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitShort)
	queues, err := New(ctx, Options{})
	require.NoError(t, err)
	require.Contains(t, queues.queues, river.QueueDefault)

	queues.RemoveQueue(river.QueueDefault)
	require.NotContains(t, queues.queues, river.QueueDefault)
}
