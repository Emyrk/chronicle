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
	require.True(t, queues.ConsumesQueue(river.QueueDefault))

	queues.RemoveQueue(river.QueueDefault)
	require.False(t, queues.ConsumesQueue(river.QueueDefault))
}
