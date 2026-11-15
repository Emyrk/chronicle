package chronicle

import (
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestNativeEnqueueRejectsHandoffGenerationMismatch(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	// Simulate drift left by an old writer. Ensure's ON CONFLICT must not hide it.
	_, err := f.db.AdvanceParserHandoffGeneration(ctx, database.AdvanceParserHandoffGenerationParams{LogGroupID: f.arg.LogGroupID, ExpectedGeneration: 1})
	require.NoError(t, err)
	require.NoError(t, f.db.SetParserHandoffNativeEnabled(ctx, database.SetParserHandoffNativeEnabledParams{LogGroupID: f.arg.LogGroupID, NativeEnabled: false}))
	c := &Chronicle{queue: &riverqueue.Queues{Client: f.client}}
	err = f.db.InTx(ctx, func(tx database.Store) error {
		raw, ok := database.PGXTx(tx)
		require.True(t, ok)
		_, err := c.enqueueNativeParse(ctx, tx, raw, ArgsLogParse{LogID: f.arg.LogGroupID, ParseGeneration: 1, ParserEngine: chroniclesdk.ParserEngineNext}, nil)
		return err
	}, nil)
	require.ErrorContains(t, err, "handoff generation 2 differs from locked log generation 1")
	state, err := f.db.GetParserHandoff(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.False(t, state.NativeEnabled, "rejection must precede changing engine mode")
	jobs, err := f.client.JobList(ctx, river.NewJobListParams().Kinds(KindNativeLogParse))
	require.NoError(t, err)
	require.Empty(t, jobs.Jobs, "mismatch must never enqueue work that can only snooze")
}
