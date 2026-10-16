package chronicle

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestParseGenerationEarlyStaleJobsRecordAbortOutput(t *testing.T) {
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)
	_, err := advanceGenerationTx(ctx, store, logID, true)
	require.NoError(t, err)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	var outputs []parseGenerationAbortOutput
	chron := &Chronicle{
		Zed:     authz.NewDatabaseOnly(logger, store),
		logger:  logger,
		metrics: newLogParseMetrics(nil),
		recordParseAbort: func(_ context.Context, output parseGenerationAbortOutput) error {
			outputs = append(outputs, output)
			return nil
		},
	}

	parseJob := &river.Job[ArgsLogParse]{
		Args:   ArgsLogParse{LogID: logID, ParseGeneration: 1},
		JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
	}
	require.NoError(t, (&WorkerLogParse{parent: chron}).Work(ctx, parseJob))
	require.Len(t, outputs, 1)
	require.Equal(t, parseGenerationAbortOutput{
		Status: "aborted", Reason: staleParseGenerationReason,
		JobGeneration: 1, ExpectedGeneration: 1, CurrentGeneration: ptrInt64(2),
		Checkpoint: "initial_generation_check",
	}, outputs[0])
	encoded, err := json.Marshal(outputs[0])
	require.NoError(t, err)
	require.JSONEq(t, `{"status":"aborted","reason":"stale_parse_generation","job_generation":1,"expected_generation":1,"current_generation":2,"checkpoint":"initial_generation_check"}`, string(encoded))

	legacyReparseJob := &river.Job[ArgsLogReparse]{
		Args:   ArgsLogReparse{LogID: logID},
		JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 5},
	}
	require.NoError(t, (&WorkerLogReparse{parent: chron}).Work(ctx, legacyReparseJob))
	require.Len(t, outputs, 2)
	require.Equal(t, parseGenerationAbortOutput{
		Status: "aborted", Reason: staleParseGenerationReason,
		JobGeneration: 0, ExpectedGeneration: 1, CurrentGeneration: ptrInt64(2),
		Checkpoint: "initial_generation_check",
	}, outputs[1])
}

func TestParseGenerationLegacyJobsNormalizeToGenerationOne(t *testing.T) {
	t.Parallel()
	for _, jobGeneration := range []struct {
		name       string
		generation int64
	}{
		{name: "parse", generation: ArgsLogParse{}.ParseGeneration},
		{name: "reparse", generation: ArgsLogReparse{}.ParseGeneration},
	} {
		t.Run(jobGeneration.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, int64(1), effectiveParseGeneration(jobGeneration.generation))
			require.True(t, isCurrentParseGeneration(jobGeneration.generation, 1))
			require.False(t, isCurrentParseGeneration(jobGeneration.generation, 2))
		})
	}
}

func TestParseGenerationFinalizationStaleAbortOutput(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)
	_, err := advanceGenerationTx(ctx, store, logID, true)
	require.NoError(t, err)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	var output parseGenerationAbortOutput
	chron := &Chronicle{
		logger: logger,
		recordParseAbort: func(_ context.Context, got parseGenerationAbortOutput) error {
			output = got
			return nil
		},
	}
	staleErr := store.InTx(ctx, func(tx database.Store) error {
		return lockExpectedParseGeneration(ctx, tx, logID, 1)
	}, nil)
	require.ErrorIs(t, staleErr, errStaleParseGeneration)
	require.NoError(t, chron.abortStaleParseGeneration(ctx, logID, 1, "finalize_output", staleErr))
	require.Equal(t, parseGenerationAbortOutput{
		Status: "aborted", Reason: staleParseGenerationReason,
		JobGeneration: 1, ExpectedGeneration: 1, CurrentGeneration: ptrInt64(2),
		Checkpoint: "finalize_output",
	}, output)
}

func ptrInt64(value int64) *int64 { return &value }

func TestParseGenerationParseVsReparse(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)

	locked := make(chan struct{})
	release := make(chan struct{})
	parseErr := make(chan error, 1)
	go func() {
		parseErr <- store.InTx(ctx, func(tx database.Store) error {
			if err := lockExpectedParseGeneration(ctx, tx, logID, 1); err != nil {
				return err
			}
			close(locked)
			<-release
			if err := tx.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: logID, ParseGeneration: 1}); err != nil {
				return err
			}
			_, err := tx.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{ID: logID, ParseGeneration: 1})
			return err
		}, nil)
	}()
	<-locked

	reparseErr := make(chan error, 1)
	go func() {
		reparseErr <- store.InTx(ctx, func(tx database.Store) error {
			_, err := advanceParseGeneration(ctx, tx, logID, true)
			return err
		}, nil)
	}()
	close(release)

	require.NoError(t, <-parseErr)
	require.NoError(t, <-reparseErr)
	group, err := store.GetWoWLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(2), group.WoWLogGroup.ParseGeneration)
	visible, err := store.IsParsedLogGroupVisible(ctx, logID)
	require.NoError(t, err)
	require.False(t, visible)
	_, err = store.GetParsedLogGroupByID(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseGenerationReparseWinsAgainstParserWrite(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)

	advanced := make(chan struct{})
	release := make(chan struct{})
	reparseErr := make(chan error, 1)
	go func() {
		reparseErr <- store.InTx(ctx, func(tx database.Store) error {
			if _, err := advanceParseGeneration(ctx, tx, logID, true); err != nil {
				return err
			}
			close(advanced)
			<-release
			return nil
		}, nil)
	}()
	<-advanced

	parseErr := make(chan error, 1)
	go func() {
		parseErr <- store.InTx(ctx, func(tx database.Store) error {
			if err := lockExpectedParseGeneration(ctx, tx, logID, 1); err != nil {
				return err
			}
			return tx.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: logID, ParseGeneration: 1})
		}, nil)
	}()
	close(release)

	require.NoError(t, <-reparseErr)
	require.ErrorIs(t, <-parseErr, errStaleParseGeneration)
	visible, err := store.IsParsedLogGroupVisible(ctx, logID)
	require.NoError(t, err)
	require.False(t, visible)
}

func TestParseGenerationParseVsDelete(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)

	locked := make(chan struct{})
	release := make(chan struct{})
	parseErr := make(chan error, 1)
	go func() {
		parseErr <- store.InTx(ctx, func(tx database.Store) error {
			if err := lockExpectedParseGeneration(ctx, tx, logID, 1); err != nil {
				return err
			}
			close(locked)
			<-release
			if err := tx.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: logID, ParseGeneration: 1}); err != nil {
				return err
			}
			_, err := tx.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{ID: logID, ParseGeneration: 1})
			return err
		}, nil)
	}()
	<-locked

	deleteGeneration := make(chan int64, 1)
	deleteErr := make(chan error, 1)
	go func() {
		generation, err := advanceGenerationTx(ctx, store, logID, false)
		deleteGeneration <- generation
		deleteErr <- err
	}()
	close(release)

	require.NoError(t, <-parseErr)
	require.NoError(t, <-deleteErr)
	require.Equal(t, int64(2), <-deleteGeneration)
	parsed, err := store.GetParsedLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(1), parsed.ParseGeneration)
	require.True(t, parsed.FinalizedAt.Valid)

	visible, err := store.IsParsedLogGroupVisible(ctx, logID)
	require.NoError(t, err)
	require.False(t, visible)

	err = store.InTx(ctx, func(tx database.Store) error {
		return lockExpectedParseGeneration(ctx, tx, logID, 1)
	}, nil)
	require.ErrorIs(t, err, errStaleParseGeneration)
}

func TestParseGenerationConcurrentReparses(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)
	require.NoError(t, stageAndFinalizeGeneration(ctx, store, logID, 1))

	start := make(chan struct{})
	generations := make([]int64, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range generations {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			generations[i], errs[i] = advanceGenerationTx(ctx, store, logID, true)
		}(i)
	}
	close(start)
	wg.Wait()

	for _, err := range errs {
		require.NoError(t, err)
	}
	slices.Sort(generations)
	require.Equal(t, []int64{2, 3}, generations)
	_, err := store.GetParsedLogGroupByID(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseGenerationFileDeletionFencePreservesFinalizedOutput(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)
	require.NoError(t, stageAndFinalizeGeneration(ctx, store, logID, 1))

	err := store.InTx(ctx, func(tx database.Store) error {
		_, err := fenceParseGenerationPreservingFinalized(ctx, tx, logID)
		return err
	}, nil)
	require.NoError(t, err)

	visible, err := store.IsParsedLogGroupVisible(ctx, logID)
	require.NoError(t, err)
	require.True(t, visible)
	parsed, err := store.GetParsedLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(2), parsed.ParseGeneration)
}

func TestParseGenerationStaleWorkerCompletion(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)
	_, err := advanceGenerationTx(ctx, store, logID, true)
	require.NoError(t, err)

	err = store.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, 1); err != nil {
			return err
		}
		_, err := tx.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{ID: logID, ParseGeneration: 1})
		return err
	}, nil)
	require.ErrorIs(t, err, errStaleParseGeneration)
	_, err = store.GetParsedLogGroupByID(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseGenerationSameGenerationRetryResetsOutput(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, logID := parseGenerationFixture(t, ctx)
	require.NoError(t, stageAndFinalizeGeneration(ctx, store, logID, 1))

	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, 1); err != nil {
			return err
		}
		if err := tx.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
			return err
		}
		return tx.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: logID, ParseGeneration: 1})
	}, nil))

	parsed, err := store.GetParsedLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(1), parsed.ParseGeneration)
	require.False(t, parsed.FinalizedAt.Valid)
	visible, err := store.IsParsedLogGroupVisible(ctx, logID)
	require.NoError(t, err)
	require.False(t, visible)

	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, 1); err != nil {
			return err
		}
		_, err := tx.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{ID: logID, ParseGeneration: 1})
		return err
	}, nil))
	visible, err = store.IsParsedLogGroupVisible(ctx, logID)
	require.NoError(t, err)
	require.True(t, visible)
}

func parseGenerationFixture(t *testing.T, ctx context.Context) (database.Store, uuid.UUID) {
	t.Helper()
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "parse-generation-" + ownerID.String(), Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	logID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeAzerothcore, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	return store, logID
}

func stageAndFinalizeGeneration(ctx context.Context, store database.Store, logID uuid.UUID, generation int64) error {
	return store.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, generation); err != nil {
			return err
		}
		if err := tx.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
			return err
		}
		if err := tx.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: logID, ParseGeneration: generation}); err != nil {
			return err
		}
		_, err := tx.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{ID: logID, ParseGeneration: generation})
		return err
	}, nil)
}

func advanceGenerationTx(ctx context.Context, store database.Store, logID uuid.UUID, clearParsed bool) (int64, error) {
	var generation int64
	err := store.InTx(ctx, func(tx database.Store) error {
		var err error
		generation, err = advanceParseGeneration(ctx, tx, logID, clearParsed)
		return err
	}, nil)
	return generation, err
}
