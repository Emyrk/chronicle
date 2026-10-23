package servicecache

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/pubsub"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func testService(t *testing.T, ctx context.Context, db database.Store, ps pubsub.Pubsub, periodic <-chan time.Time) *Service {
	t.Helper()
	svc := New(nil)
	svc.db = db
	svc.pubsub = ps
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	svc.periodic = periodic
	require.NoError(t, svc.startReconciler(ctx))
	t.Cleanup(func() { require.NoError(t, svc.Close(context.Background())) })
	return svc
}

func receiveInvalidation(t *testing.T, ctx context.Context, ch <-chan Invalidation) Invalidation {
	t.Helper()
	select {
	case req := <-ch:
		return req
	case <-ctx.Done():
		require.FailNow(t, "timed out waiting for cache invalidation", ctx.Err().Error())
		return Invalidation{}
	}
}

func registerRecorder(t *testing.T, svc *Service, namespace Namespace, scope Scope) <-chan Invalidation {
	t.Helper()
	ch := make(chan Invalidation, 8)
	require.NoError(t, svc.RegisterInvalidator(namespace, scope, t.Name(), func(_ context.Context, req Invalidation) error {
		ch <- req
		return nil
	}))
	return ch
}

func TestDistributedInvalidationAcrossServices(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, ps := dbtestutil.NewDB(t)
	publisher := testService(t, ctx, db, ps, make(chan time.Time))
	receiver := testService(t, ctx, db, ps, make(chan time.Time))
	publisherCalls := registerRecorder(t, publisher, NamespaceItems, ScopeDataset)
	receiverCalls := registerRecorder(t, receiver, NamespaceItems, ScopeDataset)
	datasetID := uuid.New()

	require.NoError(t, publisher.Publish(ctx, DatasetInvalidation(NamespaceItems, datasetID)))
	require.Equal(t, datasetID, receiveInvalidation(t, ctx, publisherCalls).DatasetID)
	require.Equal(t, datasetID, receiveInvalidation(t, ctx, receiverCalls).DatasetID)
}

func TestPublishRollbackDoesNotAdvanceOrInvalidate(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	svc := New(nil)
	svc.db = db
	calls := registerRecorder(t, svc, NamespaceItems, ScopeDataset)
	sentinel := errors.New("rollback")

	err := db.InTx(ctx, func(tx database.Store) error {
		_, err := svc.PublishTx(ctx, tx, DatasetInvalidation(NamespaceItems, uuid.New()))
		require.NoError(t, err)
		return sentinel
	}, nil)
	require.ErrorIs(t, err, sentinel)
	rows, err := db.ListCacheGenerations(ctx)
	require.NoError(t, err)
	require.Empty(t, rows)
	select {
	case <-calls:
		require.Fail(t, "rollback invalidated local cache")
	default:
	}
}

func TestMissedNotificationRepairedByReconcile(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	svc := New(nil)
	svc.db = db
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := registerRecorder(t, svc, NamespaceCreatures, ScopeDataset)
	datasetID := uuid.New()

	_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceCreatures), Scope: ScopeDataset.String(), ScopeID: datasetID,
	})
	require.NoError(t, err)
	require.NoError(t, svc.reconcileAll(ctx))
	require.Equal(t, datasetID, receiveInvalidation(t, ctx, calls).DatasetID)
}

func TestListenerErrorTriggersFullReconciliation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	svc := New(nil)
	svc.db = db
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := registerRecorder(t, svc, NamespaceDurationMods, ScopeDataset)
	datasetID := uuid.New()
	_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceDurationMods), Scope: ScopeDataset.String(), ScopeID: datasetID,
	})
	require.NoError(t, err)

	svc.handleNotification(ctx, nil, pubsub.ErrDroppedMessages)
	require.Equal(t, datasetID, receiveInvalidation(t, ctx, calls).DatasetID)
}

func TestStartupCatchup(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, ps := dbtestutil.NewDB(t)
	datasetID := uuid.New()
	_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceTalents), Scope: ScopeDataset.String(), ScopeID: datasetID,
	})
	require.NoError(t, err)

	svc := New(nil)
	svc.db = db
	svc.pubsub = ps
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	svc.periodic = make(chan time.Time)
	calls := registerRecorder(t, svc, NamespaceTalents, ScopeDataset)
	require.NoError(t, svc.startReconciler(ctx))
	t.Cleanup(func() { require.NoError(t, svc.Close(context.Background())) })
	require.Equal(t, datasetID, receiveInvalidation(t, ctx, calls).DatasetID)
}

func TestFailedInvalidationRetriesWithoutAdvancingObserved(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	svc := New(nil)
	svc.db = db
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	datasetID := uuid.New()
	var attempts atomic.Int32
	require.NoError(t, svc.RegisterInvalidator(NamespaceSpells, ScopeDataset, "retry", func(context.Context, Invalidation) error {
		if attempts.Add(1) == 1 {
			return errors.New("temporary failure")
		}
		return nil
	}))
	row, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceSpells), Scope: ScopeDataset.String(), ScopeID: datasetID,
	})
	require.NoError(t, err)

	err = svc.reconcileAll(ctx)
	require.Error(t, err)
	key := handlerGenerationKey{
		generationKey: generationKey{namespace: NamespaceSpells, scope: ScopeDataset, scopeID: datasetID},
		handler:       "retry",
	}
	require.Zero(t, svc.observed[key])
	require.NoError(t, svc.reconcileAll(ctx))
	require.Equal(t, row.Generation, svc.observed[key])
	require.EqualValues(t, 2, attempts.Load())
}

func TestUnrelatedScopeUntouched(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	svc := New(nil)
	svc.db = db
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	target := uuid.New()
	other := uuid.New()
	calls := registerRecorder(t, svc, NamespaceItems, ScopeDataset)
	for _, id := range []uuid.UUID{target, other} {
		_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
			Namespace: string(NamespaceItems), Scope: ScopeDataset.String(), ScopeID: id,
		})
		require.NoError(t, err)
	}
	require.NoError(t, svc.reconcileAll(ctx))
	receiveInvalidation(t, ctx, calls)
	receiveInvalidation(t, ctx, calls)

	row, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceItems), Scope: ScopeDataset.String(), ScopeID: target,
	})
	require.NoError(t, err)
	key := generationKey{namespace: NamespaceItems, scope: ScopeDataset, scopeID: target}
	require.NoError(t, svc.reconcileKey(ctx, key))
	require.Equal(t, target, receiveInvalidation(t, ctx, calls).DatasetID)
	handlerName := t.Name()
	require.Equal(t, row.Generation, svc.observed[handlerGenerationKey{generationKey: key, handler: handlerName}])
	otherKey := generationKey{namespace: NamespaceItems, scope: ScopeDataset, scopeID: other}
	require.EqualValues(t, 1, svc.observed[handlerGenerationKey{generationKey: otherKey, handler: handlerName}])
	select {
	case req := <-calls:
		require.Fail(t, "targeted reconciliation touched unrelated scope", "dataset_id=%s", req.DatasetID)
	default:
	}
}

func TestDatasetGenerationCleanup(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	target := uuid.New()
	other := uuid.New()
	for _, id := range []uuid.UUID{target, other} {
		_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
			Namespace: string(NamespaceItems), Scope: ScopeDataset.String(), ScopeID: id,
		})
		require.NoError(t, err)
	}
	require.NoError(t, db.InTx(ctx, func(tx database.Store) error {
		return tx.DeleteDatasetCacheGenerations(ctx, target)
	}, nil))
	rows, err := db.ListCacheGenerations(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, other, rows[0].ScopeID)
}

func TestDatasetGenerationCleanupRetainsDurableGlobalPurge(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, ps := dbtestutil.NewDB(t)
	receiver := testService(t, ctx, db, ps, make(chan time.Time))
	globalCalls := registerRecorder(t, receiver, NamespaceItems, ScopeGlobal)
	datasetID := uuid.New()
	_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceItems), Scope: ScopeDataset.String(), ScopeID: datasetID,
	})
	require.NoError(t, err)

	publisher := New(nil)
	publisher.db = db
	var published PublishedGeneration
	require.NoError(t, db.InTx(ctx, func(tx database.Store) error {
		var err error
		published, err = publisher.PublishTx(ctx, tx, GlobalInvalidation(NamespaceItems))
		if err != nil {
			return err
		}
		return tx.DeleteDatasetCacheGenerations(ctx, datasetID)
	}, nil))
	require.Equal(t, ScopeGlobal, receiveInvalidation(t, ctx, globalCalls).Scope)
	require.NoError(t, publisher.ApplyPublished(ctx, published))

	rows, err := db.ListCacheGenerations(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "global", rows[0].Scope)
	require.Equal(t, uuid.Nil, rows[0].ScopeID)
}

func TestNotificationAndPeriodicReconcileDoNotDoubleApply(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, ps := dbtestutil.NewDB(t)
	periodic := make(chan time.Time, 1)
	done := make(chan struct{}, 1)
	svc := New(nil)
	svc.db = db
	svc.pubsub = ps
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	svc.periodic = periodic
	svc.reconcileDone = done
	require.NoError(t, svc.startReconciler(ctx))
	t.Cleanup(func() { require.NoError(t, svc.Close(context.Background())) })
	calls := registerRecorder(t, svc, NamespacePeriodicSpells, ScopeDataset)
	datasetID := uuid.New()
	require.NoError(t, svc.Publish(ctx, DatasetInvalidation(NamespacePeriodicSpells, datasetID)))
	receiveInvalidation(t, ctx, calls)
	periodic <- time.Now()
	select {
	case <-done:
	case <-ctx.Done():
		require.FailNow(t, "timed out waiting for periodic reconciliation", ctx.Err().Error())
	}
	select {
	case <-calls:
		require.Fail(t, "generation applied twice")
	default:
	}
}

func TestLateInvalidatorRegistrationCatchesUp(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, ps := dbtestutil.NewDB(t)
	svc := testService(t, ctx, db, ps, make(chan time.Time))
	datasetID := uuid.New()
	firstCalls := make(chan Invalidation, 1)
	require.NoError(t, svc.RegisterInvalidator(NamespaceExtraAttacks, ScopeDataset, "first", func(_ context.Context, req Invalidation) error {
		firstCalls <- req
		return nil
	}))
	_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceExtraAttacks), Scope: ScopeDataset.String(), ScopeID: datasetID,
	})
	require.NoError(t, err)
	require.NoError(t, svc.reconcileAll(ctx))
	require.Equal(t, datasetID, receiveInvalidation(t, ctx, firstCalls).DatasetID)

	secondCalls := make(chan Invalidation, 1)
	require.NoError(t, svc.RegisterInvalidator(NamespaceExtraAttacks, ScopeDataset, "second", func(_ context.Context, req Invalidation) error {
		secondCalls <- req
		return nil
	}))
	require.Equal(t, datasetID, receiveInvalidation(t, ctx, secondCalls).DatasetID)
	select {
	case <-firstCalls:
		require.Fail(t, "existing invalidator reapplied during late registration")
	default:
	}
}

func TestApplyPublishedBestEffortDoesNotReportCommittedMutationFailure(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	svc := New(nil)
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	datasetID := uuid.New()
	var attempts atomic.Int32
	done := make(chan struct{})
	require.NoError(t, svc.RegisterInvalidator(NamespaceItems, ScopeDataset, "failing", func(context.Context, Invalidation) error {
		defer close(done)
		attempts.Add(1)
		return errors.New("temporary eviction failure")
	}))

	svc.ApplyPublishedBestEffort(PublishedGeneration{
		Invalidation: DatasetInvalidation(NamespaceItems, datasetID),
		Generation:   1,
	})
	select {
	case <-done:
	case <-ctx.Done():
		require.FailNow(t, "timed out waiting for best-effort invalidation", ctx.Err().Error())
	}

	require.EqualValues(t, 1, attempts.Load())
	key := handlerGenerationKey{
		generationKey: generationKey{namespace: NamespaceItems, scope: ScopeDataset, scopeID: datasetID},
		handler:       "failing",
	}
	require.Zero(t, svc.observed[key], "failed eviction must remain eligible for reconciliation retry")
}

func TestApplyPublishedBestEffortDoesNotBlockMutationResponse(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	svc := New(nil)
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	started := make(chan struct{})
	release := make(chan struct{})
	require.NoError(t, svc.RegisterInvalidator(NamespaceItems, ScopeDataset, "blocking", func(context.Context, Invalidation) error {
		close(started)
		<-release
		return nil
	}))

	returned := make(chan struct{})
	go func() {
		svc.ApplyPublishedBestEffort(PublishedGeneration{
			Invalidation: DatasetInvalidation(NamespaceItems, uuid.New()),
			Generation:   1,
		})
		close(returned)
	}()
	select {
	case <-returned:
	case <-ctx.Done():
		close(release)
		require.FailNow(t, "best-effort invalidation blocked the mutation response", ctx.Err().Error())
	}
	select {
	case <-started:
	case <-ctx.Done():
		close(release)
		require.FailNow(t, "timed out waiting for asynchronous invalidation", ctx.Err().Error())
	}
	close(release)
	require.NoError(t, svc.Close(context.Background()))
}

func TestCancelSubscriptionAsyncDoesNotBlockStartupError(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	started := make(chan struct{})
	release := make(chan struct{})
	cancelSubscriptionAsync(func() {
		close(started)
		<-release
	})

	select {
	case <-started:
	case <-ctx.Done():
		close(release)
		require.FailNow(t, "subscription cleanup did not start", ctx.Err().Error())
	}
	close(release)
}

func TestCloseHonorsCanceledContextWhenSubscriptionTeardownBlocks(t *testing.T) {
	t.Parallel()
	svc := New(nil)
	release := make(chan struct{})
	svc.cancelSubscribe = func() { <-release }
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := svc.Close(ctx)
	close(release)
	require.ErrorIs(t, err, context.Canceled)
}

func TestCloseWaitsForInFlightNotification(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, ps := dbtestutil.NewDB(t)
	svc := New(nil)
	svc.db = db
	svc.pubsub = ps
	svc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	svc.periodic = make(chan time.Time)
	started := make(chan struct{})
	finished := make(chan struct{})
	require.NoError(t, svc.RegisterInvalidator(NamespaceItems, ScopeDataset, "blocking", func(ctx context.Context, _ Invalidation) error {
		close(started)
		<-ctx.Done()
		close(finished)
		return ctx.Err()
	}))
	require.NoError(t, svc.startReconciler(ctx))

	_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceItems), Scope: ScopeDataset.String(), ScopeID: uuid.New(),
	})
	require.NoError(t, err)
	select {
	case <-started:
	case <-ctx.Done():
		require.FailNow(t, "timed out waiting for invalidation handler", ctx.Err().Error())
	}
	require.NoError(t, svc.Close(context.Background()))
	select {
	case <-finished:
	default:
		require.Fail(t, "close returned before notification handler finished")
	}
}

func TestGlobalPurgeAllowsRecreatedDatasetGenerationToRestart(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	svc := New(nil)
	datasetID := uuid.New()
	var datasetCalls atomic.Int32
	var globalCalls atomic.Int32
	require.NoError(t, svc.RegisterInvalidator(NamespaceItems, ScopeDataset, "dataset", func(context.Context, Invalidation) error {
		datasetCalls.Add(1)
		return nil
	}))
	require.NoError(t, svc.RegisterInvalidator(NamespaceItems, ScopeGlobal, "global", func(context.Context, Invalidation) error {
		globalCalls.Add(1)
		return nil
	}))

	require.NoError(t, svc.ApplyPublished(ctx, PublishedGeneration{
		Invalidation: DatasetInvalidation(NamespaceItems, datasetID),
		Generation:   5,
	}))
	require.NoError(t, svc.ApplyPublished(ctx, PublishedGeneration{
		Invalidation: GlobalInvalidation(NamespaceItems),
		Generation:   1,
	}))
	require.NoError(t, svc.ApplyPublished(ctx, PublishedGeneration{
		Invalidation: DatasetInvalidation(NamespaceItems, datasetID),
		Generation:   1,
	}))

	require.EqualValues(t, 2, datasetCalls.Load())
	require.EqualValues(t, 1, globalCalls.Load())
}

func TestGlobalGenerationConstraints(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	_, err := db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceTenantSlugs), Scope: ScopeGlobal.String(), ScopeID: uuid.Nil,
	})
	require.NoError(t, err)
	_, err = db.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(NamespaceItems), Scope: ScopeDataset.String(), ScopeID: uuid.Nil,
	})
	require.Error(t, err)
}
