package chronicle

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestNativePublicationTransactionIndependentHead(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	first, err := f.handoff.Accept(ctx, f.arg, f.enqueue)
	require.NoError(t, err)
	fence := f.reserve(t, ctx, first)
	next := f.arg
	next.AttemptID = uuid.New()
	next.PredecessorIteration = first.Iteration
	next.PredecessorAttemptID = uuid.NullUUID{UUID: first.AttemptID, Valid: true}
	_, err = f.handoff.Accept(ctx, next, f.enqueue)
	require.NoError(t, err)
	c := &Chronicle{Zed: authz.NewDatabaseOnly(slog.New(slog.NewTextHandler(io.Discard, nil)), f.db)}
	publicationCtx := context.WithValue(ctx, publicationContextKey{}, fence)
	writes := 0
	require.NoError(t, c.parsePublicationTx(publicationCtx, false, func(tx *authz.AuthzTX) error { writes++; return nil }, nil))
	require.NoError(t, c.parsePublicationTx(publicationCtx, true, func(tx *authz.AuthzTX) error { writes++; return nil }, nil))
	require.Equal(t, 2, writes)
	state, err := f.db.GetParserHandoff(ctx, first.LogGroupID)
	require.NoError(t, err)
	require.Equal(t, int64(2), state.HeadIteration)
	require.Equal(t, int64(1), state.PublishedIteration)
	// Once publication completes, the old token cannot write even though its
	// generation remains current and no subsequent finalizer has started.
	require.Error(t, c.parsePublicationTx(publicationCtx, false, func(tx *authz.AuthzTX) error { t.Fatal("stale callback executed"); return nil }, nil))
}

func TestNativeGenerationAdvanceRevokesPublication(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	attempt, err := f.handoff.Accept(ctx, f.arg, f.enqueue)
	require.NoError(t, err)
	fence := f.reserve(t, ctx, attempt)
	require.NoError(t, f.db.InTx(ctx, func(tx database.Store) error {
		generation, err := advanceParseGeneration(ctx, tx, attempt.LogGroupID, false)
		require.Equal(t, int64(2), generation)
		return err
	}, nil))
	c := &Chronicle{Zed: authz.NewDatabaseOnly(slog.New(slog.NewTextHandler(io.Discard, nil)), f.db)}
	publicationCtx := context.WithValue(ctx, publicationContextKey{}, fence)
	require.Error(t, c.parsePublicationTx(publicationCtx, false, func(tx *authz.AuthzTX) error { t.Fatal("old generation callback executed"); return nil }, nil))
	state, err := f.db.GetParserHandoff(ctx, attempt.LogGroupID)
	require.NoError(t, err)
	require.Equal(t, int64(2), state.Generation)
	require.Equal(t, attempt.Iteration, state.PublicationIteration)
	require.False(t, state.PublicationToken.Valid)
}
