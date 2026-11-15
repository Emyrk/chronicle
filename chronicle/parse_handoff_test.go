package chronicle

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/require"
)

type handoffTestJob struct {
	AttemptID uuid.UUID `json:"attempt_id"`
}

func (handoffTestJob) Kind() string { return "handoff-test-finalize" }

type handoffFixture struct {
	db      database.Store
	handoff *ParseHandoffStore
	client  *river.Client[pgx.Tx]
	arg     database.InsertParserCheckpointAttemptParams
}

func newHandoffFixture(t *testing.T, ctx context.Context) handoffFixture {
	t.Helper()
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{SkipUnknownJobCheck: true})
	require.NoError(t, err)
	owner := uuid.New()
	_, err = db.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: owner.String(), Email: owner.String() + "@example.com"})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	logID := uuid.New()
	_, err = db.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: logID, Owner: owner, LogType: database.LogTypeAzerothcore, CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	h := NewParseHandoffStore(db)
	_, err = h.Ensure(ctx, logID)
	require.NoError(t, err)
	token := uuid.New()
	_, err = h.ClaimLease(ctx, database.ClaimParserHandoffLeaseParams{LogGroupID: logID, Generation: 1, LeaseToken: token, LeaseDuration: handoffTestDuration()})
	require.NoError(t, err)
	return handoffFixture{db: db, handoff: h, client: client, arg: database.InsertParserCheckpointAttemptParams{
		LogGroupID: logID, Generation: 1, LeaseToken: token, AttemptID: uuid.New(),
		ProducingBinary: "sha256:binary", ParserEngine: "next", DatasetIdentity: []byte(`{"revision":1}`), InputIdentity: []byte(`{"parts":[1]}`), ObjectKey: "immutable/checkpoint", ObjectDigest: "sha256:checkpoint",
	}}
}
func handoffTestDuration() pgtype.Interval {
	return pgtype.Interval{Microseconds: time.Hour.Microseconds(), Valid: true}
}
func (f handoffFixture) enqueue(ctx context.Context, tx database.Store, a database.ParserCheckpointAttempt) error {
	raw, ok := database.PGXTx(tx)
	if !ok {
		return fmt.Errorf("missing same-transaction pgx handle")
	}
	_, err := f.client.InsertTx(ctx, raw, handoffTestJob{AttemptID: a.AttemptID}, nil)
	return err
}
func (f handoffFixture) reserve(t *testing.T, ctx context.Context, a database.ParserCheckpointAttempt) ParsePublicationFence {
	t.Helper()
	token := uuid.New()
	_, err := f.handoff.ClaimPublication(ctx, a.Generation, database.ClaimParserPublicationParams{LogGroupID: a.LogGroupID, AttemptID: a.AttemptID, PublicationToken: token, LeaseDuration: handoffTestDuration()})
	require.NoError(t, err)
	return ParsePublicationFence{LogGroupID: a.LogGroupID, Generation: a.Generation, Iteration: a.Iteration, Token: token}
}

func TestParseHandoffAcceptanceAtomicRiver(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	rejected := errors.New("enqueue failed after River insert")
	var jobID int64
	_, err := f.handoff.Accept(ctx, f.arg, func(ctx context.Context, tx database.Store, a database.ParserCheckpointAttempt) error {
		raw, ok := database.PGXTx(tx)
		if !ok {
			return errors.New("not a transaction")
		}
		job, err := f.client.InsertTx(ctx, raw, handoffTestJob{AttemptID: a.AttemptID}, nil)
		if err != nil {
			return err
		}
		jobID = job.Job.ID
		return rejected
	})
	require.ErrorIs(t, err, rejected)
	_, err = f.client.JobGet(ctx, jobID)
	require.ErrorIs(t, err, river.ErrNotFound)
	_, err = f.db.GetParserCheckpointAttempt(ctx, database.GetParserCheckpointAttemptParams{LogGroupID: f.arg.LogGroupID, AttemptID: f.arg.AttemptID})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	state, err := f.db.GetParserHandoff(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.Zero(t, state.HeadIteration)
	a, err := f.handoff.Accept(ctx, f.arg, f.enqueue)
	require.NoError(t, err)
	require.Equal(t, int64(1), a.Iteration)
	_, err = f.handoff.Accept(ctx, f.arg, f.enqueue)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseHandoffConcurrentAcceptance(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	start := make(chan struct{})
	results := make(chan error, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	for range 2 {
		go func() {
			arg := f.arg
			arg.AttemptID = uuid.New()
			ready.Done()
			select {
			case <-start:
			case <-ctx.Done():
				results <- ctx.Err()
				return
			}
			_, err := f.handoff.Accept(ctx, arg, f.enqueue)
			results <- err
		}()
	}
	ready.Wait()
	close(start)
	successes := 0
	for range 2 {
		select {
		case err := <-results:
			if err == nil {
				successes++
			} else {
				require.ErrorIs(t, err, pgx.ErrNoRows)
			}
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	require.Equal(t, 1, successes)
	state, err := f.db.GetParserHandoff(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.Equal(t, int64(1), state.HeadIteration)
}

func TestParseHandoffPublicationFences(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	a, err := f.handoff.Accept(ctx, f.arg, f.enqueue)
	require.NoError(t, err)
	fence := f.reserve(t, ctx, a)
	newer := f.arg
	newer.AttemptID = uuid.New()
	newer.PredecessorIteration = a.Iteration
	newer.PredecessorAttemptID = uuid.NullUUID{UUID: a.AttemptID, Valid: true}
	_, err = f.handoff.Accept(ctx, newer, f.enqueue)
	require.NoError(t, err)
	// The older same-generation finalizer remains eligible despite a newer head.
	require.NoError(t, f.handoff.Publish(ctx, fence, false, func(context.Context, database.Store) error { return nil }))
	var rolledBackID uuid.UUID
	err = f.handoff.Publish(ctx, fence, true, func(ctx context.Context, tx database.Store) error {
		rolledBackID = uuid.New()
		if _, err := tx.InsertUser(ctx, database.InsertUserParams{ID: rolledBackID, Username: rolledBackID.String()}); err != nil {
			return err
		}
		// Deterministically expire inside the transaction instead of sleeping.
		_, err := tx.Exec(ctx, "UPDATE parser_handoffs SET publication_expires_at = '-infinity' WHERE log_group_id=$1", f.arg.LogGroupID)
		return err
	})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	var count int
	require.NoError(t, f.db.QueryRow(ctx, "SELECT count(*) FROM users WHERE id=$1", rolledBackID).Scan(&count))
	require.Zero(t, count)
	// Rollback also restores the live reservation; completion can now succeed.
	require.NoError(t, f.handoff.Publish(ctx, fence, true, func(context.Context, database.Store) error { return nil }))
	state, err := f.db.GetParserHandoff(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.Equal(t, int64(1), state.PublishedIteration)
	require.Equal(t, int64(2), state.HeadIteration)
}

func TestParseHandoffPublicationSerializesGeneration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	a, err := f.handoff.Accept(ctx, f.arg, f.enqueue)
	require.NoError(t, err)
	fence := f.reserve(t, ctx, a)
	entered := make(chan struct{})
	release := make(chan struct{})
	published := make(chan error, 1)
	go func() {
		published <- f.handoff.Publish(ctx, fence, false, func(ctx context.Context, tx database.Store) error {
			close(entered)
			select {
			case <-release:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
	}()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	// NOWAIT proves the publisher holds BOTH locks without timing assertions.
	for _, table := range []string{"wow_log_groups", "parser_handoffs"} {
		column := "id"
		if table == "parser_handoffs" {
			column = "log_group_id"
		}
		err := f.db.InTx(ctx, func(tx database.Store) error {
			_, err := tx.Exec(ctx, "SELECT 1 FROM "+table+" WHERE "+column+"=$1 FOR UPDATE NOWAIT", f.arg.LogGroupID)
			return err
		}, nil)
		require.Error(t, err)
		require.Equal(t, "55P03", databaseErrorCode(err))
	}
	advanced := make(chan error, 1)
	go func() { _, err := f.handoff.AdvanceGeneration(ctx, f.arg.LogGroupID, 1); advanced <- err }()
	close(release)
	select {
	case err := <-published:
		require.NoError(t, err)
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	select {
	case err := <-advanced:
		require.NoError(t, err)
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	state, err := f.db.GetParserHandoff(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.Equal(t, int64(2), state.Generation)
	require.False(t, state.PublicationToken.Valid)
	require.Equal(t, int64(1), state.PublicationIteration)
	err = f.handoff.Publish(ctx, fence, true, func(context.Context, database.Store) error { t.Error("stale callback ran"); return nil })
	require.ErrorIs(t, err, errStaleParseGeneration)
}

func databaseErrorCode(err error) string {
	var coded interface{ SQLState() string }
	if errors.As(err, &coded) {
		return coded.SQLState()
	}
	return ""
}

func TestParseHandoffNativeSelectionBeforeCheckpoint(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	state, err := f.db.GetParserHandoff(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.True(t, state.NativeEnabled)
	require.Zero(t, state.HeadIteration)
	require.NoError(t, f.db.SetParserHandoffNativeEnabled(ctx, database.SetParserHandoffNativeEnabledParams{LogGroupID: f.arg.LogGroupID, NativeEnabled: false}))
	state, err = f.handoff.Ensure(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.False(t, state.NativeEnabled)
	require.NoError(t, f.db.SetParserHandoffNativeEnabled(ctx, database.SetParserHandoffNativeEnabledParams{LogGroupID: f.arg.LogGroupID, NativeEnabled: true}))
	state, err = f.db.GetParserHandoff(ctx, f.arg.LogGroupID)
	require.NoError(t, err)
	require.True(t, state.NativeEnabled)
}
