package serviceoauth

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type transactionProbeStore struct {
	oauthStore
	afterCallback <-chan struct{}
	finished      chan error
}

func (s *transactionProbeStore) InTx(ctx context.Context, f func(database.Store) error, _ *pgx.TxOptions) error {
	err := f(nil)
	if s.afterCallback != nil {
		select {
		case <-s.afterCallback:
		case <-ctx.Done():
		}
	}
	if s.finished != nil {
		s.finished <- err
	}
	return err
}

func TestTransactionAbandonmentIsBounded(t *testing.T) {
	t.Parallel()
	finished := make(chan error, 1)
	store := &storage{
		db:                         &transactionProbeStore{finished: finished},
		transactionLifetime:        25 * time.Millisecond,
		transactionFinalizeTimeout: 25 * time.Millisecond,
	}

	_, err := store.BeginTX(context.Background())
	require.NoError(t, err)

	select {
	case err := <-finished:
		require.ErrorIs(t, err, context.DeadlineExceeded)
	case <-time.After(time.Second):
		t.Fatal("abandoned transaction was not released")
	}
}

func TestTransactionCancellationIsBounded(t *testing.T) {
	t.Parallel()
	finished := make(chan error, 1)
	store := &storage{
		db:                         &transactionProbeStore{finished: finished},
		transactionLifetime:        time.Second,
		transactionFinalizeTimeout: 25 * time.Millisecond,
	}
	ctx, cancel := context.WithCancel(context.Background())
	txCtx, err := store.BeginTX(ctx)
	require.NoError(t, err)
	cancel()

	select {
	case err := <-finished:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("canceled transaction was not released")
	}
	require.ErrorIs(t, txCtx.Err(), context.Canceled)
}

func TestTransactionCompletionWaitIsBounded(t *testing.T) {
	t.Parallel()
	release := make(chan struct{})
	finished := make(chan error, 1)
	store := &storage{
		db: &transactionProbeStore{
			afterCallback: release,
			finished:      finished,
		},
		transactionLifetime:        time.Second,
		transactionFinalizeTimeout: 25 * time.Millisecond,
	}
	txCtx, err := store.BeginTX(context.Background())
	require.NoError(t, err)

	err = store.Commit(txCtx)
	require.ErrorIs(t, err, errTransactionFinishTimeout)
	close(release)
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("transaction worker did not finish after release")
	}
}

func TestConcurrentTransactionCompletionDoesNotDeadlock(t *testing.T) {
	t.Parallel()
	store := &storage{
		db:                         &transactionProbeStore{},
		transactionLifetime:        time.Second,
		transactionFinalizeTimeout: time.Second,
	}
	txCtx, err := store.BeginTX(context.Background())
	require.NoError(t, err)

	errs := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		errs <- store.Commit(txCtx)
	}()
	go func() {
		defer wg.Done()
		errs <- store.Rollback(txCtx)
	}()
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
}
