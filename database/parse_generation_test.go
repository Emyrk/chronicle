package database_test

import (
	"context"
	"slices"
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
	store := newParseGenerationStore(t)
	logID := insertParseGenerationLogGroup(t, ctx, store)

	parseReady := make(chan error, 1)
	releaseParse := make(chan struct{})
	parseDone := make(chan error, 1)
	go func() {
		parseDone <- store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockWoWLogGroupParseGeneration(ctx, database.LockWoWLogGroupParseGenerationParams{ID: logID, ParseGeneration: 1}); err != nil {
				parseReady <- err
				return err
			}
			if err := tx.StartParsedLogGroupGeneration(ctx, database.StartParsedLogGroupGenerationParams{ID: logID, ParseGeneration: 1}); err != nil {
				parseReady <- err
				return err
			}
			parseReady <- nil
			select {
			case <-releaseParse:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		}, nil)
	}()
	require.NoError(t, <-parseReady)

	reparseDone := make(chan generationResult, 1)
	go func() {
		generation, err := fenceParseGeneration(ctx, store, logID, false)
		reparseDone <- generationResult{generation: generation, err: err}
	}()
	close(releaseParse)

	require.NoError(t, <-parseDone)
	reparse := <-reparseDone
	require.NoError(t, reparse.err)
	require.Equal(t, int64(2), reparse.generation)
	_, err := store.GetParsedLogGroupByID(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.LockWoWLogGroupParseGeneration(ctx, database.LockWoWLogGroupParseGenerationParams{ID: logID, ParseGeneration: 1})
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseGenerationParseVsDelete(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store := newParseGenerationStore(t)
	logID := insertParseGenerationLogGroup(t, ctx, store)

	parseReady := make(chan error, 1)
	releaseParse := make(chan struct{})
	parseDone := make(chan error, 1)
	go func() {
		parseDone <- store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockWoWLogGroupParseGeneration(ctx, database.LockWoWLogGroupParseGenerationParams{ID: logID, ParseGeneration: 1}); err != nil {
				parseReady <- err
				return err
			}
			if err := tx.StartParsedLogGroupGeneration(ctx, database.StartParsedLogGroupGenerationParams{ID: logID, ParseGeneration: 1}); err != nil {
				parseReady <- err
				return err
			}
			parseReady <- nil
			select {
			case <-releaseParse:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		}, nil)
	}()
	require.NoError(t, <-parseReady)

	deleteDone := make(chan error, 1)
	go func() {
		_, err := fenceParseGeneration(ctx, store, logID, true)
		deleteDone <- err
	}()
	close(releaseParse)

	require.NoError(t, <-parseDone)
	require.NoError(t, <-deleteDone)
	_, err := store.GetWoWLogGroupByID(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.LockWoWLogGroupParseGeneration(ctx, database.LockWoWLogGroupParseGenerationParams{ID: logID, ParseGeneration: 1})
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseGenerationConcurrentReparses(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store := newParseGenerationStore(t)
	logID := insertParseGenerationLogGroup(t, ctx, store)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logID))

	start := make(chan struct{})
	results := make(chan generationResult, 2)
	for range 2 {
		go func() {
			<-start
			generation, err := fenceParseGeneration(ctx, store, logID, false)
			results <- generationResult{generation: generation, err: err}
		}()
	}
	close(start)

	generations := make([]int64, 0, 2)
	for range 2 {
		result := <-results
		require.NoError(t, result.err)
		generations = append(generations, result.generation)
	}
	slices.Sort(generations)
	require.Equal(t, []int64{2, 3}, generations)
	group, err := store.GetWoWLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(3), group.WoWLogGroup.ParseGeneration)
	_, err = store.GetParsedLogGroupByID(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseGenerationRejectsStaleWorkerCompletion(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store := newParseGenerationStore(t)
	logID := insertParseGenerationLogGroup(t, ctx, store)
	require.NoError(t, store.StartParsedLogGroupGeneration(ctx, database.StartParsedLogGroupGenerationParams{ID: logID, ParseGeneration: 1}))

	generation, err := fenceParseGeneration(ctx, store, logID, false)
	require.NoError(t, err)
	require.Equal(t, int64(2), generation)

	err = store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.LockWoWLogGroupParseGeneration(ctx, database.LockWoWLogGroupParseGenerationParams{ID: logID, ParseGeneration: 1}); err != nil {
			return err
		}
		_, err := tx.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{ID: logID, ParseGeneration: 1})
		return err
	}, nil)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.GetParsedLogGroupByID(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseGenerationRetryResetsWithinGeneration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store := newParseGenerationStore(t)
	logID := insertParseGenerationLogGroup(t, ctx, store)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logID))

	err := store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.LockWoWLogGroupParseGeneration(ctx, database.LockWoWLogGroupParseGenerationParams{ID: logID, ParseGeneration: 1}); err != nil {
			return err
		}
		if err := tx.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
			return err
		}
		return tx.StartParsedLogGroupGeneration(ctx, database.StartParsedLogGroupGenerationParams{ID: logID, ParseGeneration: 1})
	}, nil)
	require.NoError(t, err)
	parsed, err := store.GetParsedLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(1), parsed.ParseGeneration)
	require.False(t, parsed.FinalizedAt.Valid)
}

type generationResult struct {
	generation int64
	err        error
}

func fenceParseGeneration(ctx context.Context, store database.Store, logID uuid.UUID, deleteGroup bool) (int64, error) {
	var generation int64
	err := store.InTx(ctx, func(tx database.Store) error {
		var err error
		generation, err = tx.AdvanceWoWLogGroupParseGeneration(ctx, logID)
		if err != nil {
			return err
		}
		if err := tx.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
			return err
		}
		if deleteGroup {
			return tx.DeleteWoWLogGroup(ctx, logID)
		}
		return nil
	}, nil)
	return generation, err
}

func newParseGenerationStore(t *testing.T) database.Store {
	t.Helper()
	pool, _ := dbtestutil.NewPGXPool(t)
	return database.New(pool)
}

func insertParseGenerationLogGroup(t *testing.T, ctx context.Context, store database.Store) uuid.UUID {
	t.Helper()
	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "parse-generation-" + ownerID.String(), Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	logID := uuid.New()
	group, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeAzerothcore, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), group.ParseGeneration)
	return logID
}
