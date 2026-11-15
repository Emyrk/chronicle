package chronicle

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// ParseHandoffStore owns the transactional durable parser protocol, not parsing,
// object storage, authorization, or queue configuration. Supply a base Store;
// when supplied a transaction Store, the outer caller owns the eventual commit.
type ParseHandoffStore struct{ db database.Store }

func NewParseHandoffStore(db database.Store) *ParseHandoffStore {
	return &ParseHandoffStore{db: db}
}

// ParseFinalizeEnqueue must enqueue through the supplied transaction (River
// callers use database.PGXTx(tx)). It must not perform external side effects.
type ParseFinalizeEnqueue func(context.Context, database.Store, database.ParserCheckpointAttempt) error

// ParsePublicationFence deliberately contains no current-head equality check.
type ParsePublicationFence struct {
	LogGroupID uuid.UUID
	Generation int64
	Iteration  int64
	Token      uuid.UUID
}

// Ensure adopts the locked legacy generation without resetting existing state.
func (s *ParseHandoffStore) Ensure(ctx context.Context, logID uuid.UUID) (database.ParserHandoff, error) {
	var state database.ParserHandoff
	err := s.db.InTx(ctx, func(tx database.Store) error {
		generation, err := tx.LockWoWLogGroupParseGeneration(ctx, logID)
		if err != nil {
			return err
		}
		if err = tx.EnsureParserHandoff(ctx, database.EnsureParserHandoffParams{LogGroupID: logID, InitialGeneration: generation}); err != nil {
			return err
		}
		state, err = tx.GetParserHandoff(ctx, logID)
		if err != nil {
			return err
		}
		if state.Generation != generation {
			return fmt.Errorf("handoff generation %d differs from log generation %d", state.Generation, generation)
		}
		return nil
	}, nil)
	if err != nil {
		return database.ParserHandoff{}, err
	}
	return state, nil
}

// AdvanceGeneration atomically advances both generation authorities. This does
// not clear serving data or enqueue reparse work; callers may compose those in
// an outer InTx, retaining log-row-before-handoff lock order.
func (s *ParseHandoffStore) AdvanceGeneration(ctx context.Context, logID uuid.UUID, expected int64) (database.ParserHandoff, error) {
	var state database.ParserHandoff
	err := s.db.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, expected); err != nil {
			return err
		}
		if err := tx.EnsureParserHandoff(ctx, database.EnsureParserHandoffParams{LogGroupID: logID, InitialGeneration: expected}); err != nil {
			return err
		}
		var err error
		state, err = tx.AdvanceParserHandoffGeneration(ctx, database.AdvanceParserHandoffGenerationParams{LogGroupID: logID, ExpectedGeneration: expected})
		if err != nil {
			return err
		}
		_, err = tx.AdvanceWoWLogGroupParseGeneration(ctx, logID)
		return err
	}, nil)
	if err != nil {
		return database.ParserHandoff{}, err
	}
	return state, nil
}

// Accept atomically inserts immutable metadata, advances the head, and enqueues
// finalization. An error can represent an uncertain commit: never delete the
// uploaded object in response. Reconcile by attempt ID before retrying.
func (s *ParseHandoffStore) Accept(ctx context.Context, arg database.InsertParserCheckpointAttemptParams, enqueue ParseFinalizeEnqueue) (database.ParserCheckpointAttempt, error) {
	if enqueue == nil {
		return database.ParserCheckpointAttempt{}, errors.New("finalize enqueue callback is required")
	}
	var attempt database.ParserCheckpointAttempt
	err := s.db.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, arg.LogGroupID, arg.Generation); err != nil {
			return err
		}
		_, err := tx.LockParserHandoffForAcceptance(ctx, database.LockParserHandoffForAcceptanceParams{
			LogGroupID: arg.LogGroupID, Generation: arg.Generation, LeaseToken: arg.LeaseToken,
			PredecessorIteration: arg.PredecessorIteration, PredecessorAttemptID: arg.PredecessorAttemptID,
		})
		if err != nil {
			return err
		}
		attempt, err = tx.InsertParserCheckpointAttempt(ctx, arg)
		if err != nil {
			return err
		}
		_, err = tx.AdvanceParserHandoffHead(ctx, database.AdvanceParserHandoffHeadParams{
			LogGroupID: arg.LogGroupID, Generation: arg.Generation, LeaseToken: arg.LeaseToken,
			PredecessorIteration: arg.PredecessorIteration, PredecessorAttemptID: arg.PredecessorAttemptID, AttemptID: arg.AttemptID,
		})
		if err != nil {
			return err
		}
		return enqueue(ctx, tx, attempt)
	}, nil)
	if err != nil {
		return database.ParserCheckpointAttempt{}, err
	}
	return attempt, nil
}

// Publish fences every serving-write transaction at both entry and exit. The
// callback must write only through tx, never via the base Store or object storage.
// complete advances published_iteration; false checks an intermediate batch.
func (s *ParseHandoffStore) Publish(ctx context.Context, fence ParsePublicationFence, complete bool, write func(context.Context, database.Store) error) error {
	if write == nil {
		return errors.New("publication write callback is required")
	}
	return s.db.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, fence.LogGroupID, fence.Generation); err != nil {
			return err
		}
		params := database.LockParserPublicationParams{LogGroupID: fence.LogGroupID, Generation: fence.Generation, Iteration: fence.Iteration, PublicationToken: fence.Token}
		if _, err := tx.LockParserPublication(ctx, params); err != nil {
			return err
		}
		if err := write(ctx, tx); err != nil {
			return err
		}
		if complete {
			_, err := tx.CompleteParserPublication(ctx, database.CompleteParserPublicationParams(params))
			return err
		}
		_, err := tx.CheckParserPublication(ctx, database.CheckParserPublicationParams(params))
		return err
	}, nil)
}

// withGeneration applies the shared lock ordering and guards legacy-generation
// drift as well as the handoff SQL's own generation/token/expiry predicates.
func (s *ParseHandoffStore) withGeneration(ctx context.Context, logID uuid.UUID, generation int64, f func(database.Store) (database.ParserHandoff, error)) (database.ParserHandoff, error) {
	var state database.ParserHandoff
	err := s.db.InTx(ctx, func(tx database.Store) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, generation); err != nil {
			return err
		}
		var err error
		state, err = f(tx)
		return err
	}, nil)
	if err != nil {
		return database.ParserHandoff{}, err
	}
	return state, nil
}

func (s *ParseHandoffStore) ClaimLease(ctx context.Context, arg database.ClaimParserHandoffLeaseParams) (database.ParserHandoff, error) {
	return s.withGeneration(ctx, arg.LogGroupID, arg.Generation, func(tx database.Store) (database.ParserHandoff, error) { return tx.ClaimParserHandoffLease(ctx, arg) })
}
func (s *ParseHandoffStore) RenewLease(ctx context.Context, arg database.RenewParserHandoffLeaseParams) (database.ParserHandoff, error) {
	return s.withGeneration(ctx, arg.LogGroupID, arg.Generation, func(tx database.Store) (database.ParserHandoff, error) { return tx.RenewParserHandoffLease(ctx, arg) })
}
func (s *ParseHandoffStore) ReleaseLease(ctx context.Context, arg database.ReleaseParserHandoffLeaseParams) (database.ParserHandoff, error) {
	return s.withGeneration(ctx, arg.LogGroupID, arg.Generation, func(tx database.Store) (database.ParserHandoff, error) { return tx.ReleaseParserHandoffLease(ctx, arg) })
}
func (s *ParseHandoffStore) ClaimPublication(ctx context.Context, generation int64, arg database.ClaimParserPublicationParams) (database.ParserHandoff, error) {
	return s.withGeneration(ctx, arg.LogGroupID, generation, func(tx database.Store) (database.ParserHandoff, error) {
		state, err := tx.ClaimParserPublication(ctx, arg)
		if err == nil && state.Generation != generation {
			return database.ParserHandoff{}, fmt.Errorf("handoff generation %d differs from log generation %d", state.Generation, generation)
		}
		return state, err
	})
}
func (s *ParseHandoffStore) RenewPublication(ctx context.Context, arg database.RenewParserPublicationParams) (database.ParserHandoff, error) {
	return s.withGeneration(ctx, arg.LogGroupID, arg.Generation, func(tx database.Store) (database.ParserHandoff, error) { return tx.RenewParserPublication(ctx, arg) })
}
func (s *ParseHandoffStore) ReleasePublication(ctx context.Context, arg database.ReleaseParserPublicationParams) (database.ParserHandoff, error) {
	return s.withGeneration(ctx, arg.LogGroupID, arg.Generation, func(tx database.Store) (database.ParserHandoff, error) { return tx.ReleaseParserPublication(ctx, arg) })
}
