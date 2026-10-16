package chronicle

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

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
