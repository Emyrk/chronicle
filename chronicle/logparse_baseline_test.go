package chronicle

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestRunLogParseBaselineRejectsQueue(t *testing.T) {
	t.Parallel()
	// No other dependencies: rejection must happen before any parse side effects.
	c := &Chronicle{queue: &riverqueue.Queues{}}
	require.EqualError(t, c.RunLogParseBaseline(context.Background(), ArgsLogParse{}), "baseline parsing requires a Chronicle without a queue")
}

func TestRunLogParseBaselineWithoutWorker(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	c := &Chronicle{Zed: authz.NewDatabaseOnly(logger, store), logger: logger, metrics: newLogParseMetrics(nil)}

	// The fixture has no input files. The shared work path must return its usual
	// permanent error, not panic because there is no River job row or worker context.
	err := c.RunLogParseBaseline(ctx, ArgsLogParse{LogID: logID, ParseGeneration: 1})
	var cancelErr *river.JobCancelError
	require.ErrorAs(t, err, &cancelErr)
	require.ErrorContains(t, err, "expects 1 files, has 0")

	// Stale generations retain production's successful no-op semantics, including
	// the nonfatal attempt to record abort output outside a River worker.
	_, err = advanceGenerationTx(ctx, store, logID, true)
	require.NoError(t, err)
	require.NoError(t, c.RunLogParseBaseline(ctx, ArgsLogParse{LogID: logID, ParseGeneration: 1}))

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	require.ErrorIs(t, c.RunLogParseBaseline(cancelled, ArgsLogParse{LogID: logID, ParseGeneration: 2}), context.Canceled)
}

func TestBaselineWorkerlessSideEffects(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	c := &Chronicle{}
	require.NoError(t, c.EnqueueRankingRunRefresh(ctx, uuid.New()))
	// Pin the River API behavior relied on by the unchanged publication path.
	require.EqualError(t, river.RecordOutput(ctx, struct{}{}), "RecordOutput must be called within a Worker")
}

func TestBaselineEngineSelection(t *testing.T) {
	t.Parallel()
	for _, engine := range []BaselineEngine{BaselineLegacy, BaselineParserNextVanilla} {
		require.NoError(t, engine.ValidateFormat(database.LogFormat112aCcAddon))
	}
	require.NoError(t, BaselineLegacy.ValidateFormat(database.LogFormatV22Cleu))
	require.ErrorContains(t, BaselineParserNextVanilla.ValidateFormat(database.LogFormatV22Cleu), "does not support")
	require.ErrorContains(t, BaselineEngine("invalid").Validate(), "unsupported baseline engine")
	c := &Chronicle{}
	require.ErrorContains(t, c.RunLogParseBaselineWithEngine(t.Context(), ArgsLogParse{}, "invalid"), "unsupported baseline engine")
	// Unsupported formats fail before any read dependencies or consumers are used.
	w := &WorkerLogParse{baselineEngine: BaselineParserNextVanilla}
	_, err := w.parseCombatLog(t.Context(), database.LogFormat335aCcAddon, nil, nil, nil, nil, false, nil, "")
	require.ErrorContains(t, err, "does not support")
	// Ordinary worker construction cannot inherit a baseline selection.
	require.Empty(t, c.NewWorkerLogParse().(*WorkerLogParse).baselineEngine)
}
