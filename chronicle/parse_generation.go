package chronicle

import (
	"context"
	"errors"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var errStaleParseGeneration = errors.New("stale parse generation")

func lockExpectedParseGeneration(ctx context.Context, db database.Store, logID uuid.UUID, expected int64) error {
	generation, err := db.LockWoWLogGroupParseGeneration(ctx, logID)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && generation != expected {
		return errStaleParseGeneration
	}
	return err
}

func advanceParseGeneration(ctx context.Context, db database.Store, logID uuid.UUID, clearParsed bool) (int64, error) {
	if _, err := db.LockWoWLogGroupParseGeneration(ctx, logID); err != nil {
		return 0, err
	}
	generation, err := db.AdvanceWoWLogGroupParseGeneration(ctx, logID)
	if err != nil {
		return 0, err
	}
	if clearParsed {
		if err := db.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
			return 0, err
		}
	}
	return generation, nil
}

func fenceParseGenerationPreservingFinalized(ctx context.Context, db database.Store, logID uuid.UUID) (int64, error) {
	generation, err := advanceParseGeneration(ctx, db, logID, false)
	if err != nil {
		return 0, err
	}
	if err := db.CarryForwardFinalizedParsedLogGroup(ctx, database.CarryForwardFinalizedParsedLogGroupParams{
		ID:              logID,
		ParseGeneration: generation,
	}); err != nil {
		return 0, err
	}
	return generation, nil
}

func (c *Chronicle) stageParseGeneration(ctx context.Context, logID uuid.UUID, generation int64) error {
	return c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, generation); err != nil {
			return err
		}
		if err := tx.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
			return err
		}
		return tx.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{
			ID:              logID,
			ParseGeneration: generation,
		})
	}, nil)
}

func (c *Chronicle) finalizeParseGeneration(ctx context.Context, logID uuid.UUID, generation int64) error {
	return c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, generation); err != nil {
			return err
		}
		_, err := tx.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{
			ID:              logID,
			ParseGeneration: generation,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return errStaleParseGeneration
		}
		return err
	}, nil)
}
