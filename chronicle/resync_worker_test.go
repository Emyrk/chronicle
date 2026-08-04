package chronicle_test

import (
	"testing"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestArgsResync_QueueIsolation(t *testing.T) {
	t.Parallel()

	args := chronicle.ArgsResync{LogGroupID: uuid.New()}
	opts := args.InsertOpts()

	// Must use the dedicated resync queue, never log-parsing.
	require.Equal(t, riverconst.QueueResync, opts.Queue)
	require.NotEqual(t, riverconst.QueueLogParsing, opts.Queue)
}

func TestArgsResync_Kind(t *testing.T) {
	t.Parallel()

	args := chronicle.ArgsResync{}
	require.Equal(t, "resync", args.Kind())
}

func TestResyncResult_ZeroValue(t *testing.T) {
	t.Parallel()

	var r chronicle.ResyncResult
	require.Equal(t, uuid.Nil, r.LogGroupID)
	require.Zero(t, r.ParseDuration)
	require.NoError(t, r.Err)
}
