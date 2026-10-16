package chronicle

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

const staleParseGenerationReason = "stale_parse_generation"

var errStaleParseGeneration = errors.New("stale parse generation")

type staleParseGenerationError struct {
	expected int64
	current  *int64
}

func (e *staleParseGenerationError) Error() string { return errStaleParseGeneration.Error() }
func (e *staleParseGenerationError) Unwrap() error { return errStaleParseGeneration }

type parseGenerationAbortOutput struct {
	Status             string `json:"status"`
	Reason             string `json:"reason"`
	JobGeneration      int64  `json:"job_generation"`
	ExpectedGeneration int64  `json:"expected_generation"`
	CurrentGeneration  *int64 `json:"current_generation,omitempty"`
	Checkpoint         string `json:"checkpoint"`
}

func effectiveParseGeneration(jobGeneration int64) int64 {
	if jobGeneration == 0 {
		return 1
	}
	return jobGeneration
}

func isCurrentParseGeneration(jobGeneration, currentGeneration int64) bool {
	return effectiveParseGeneration(jobGeneration) == currentGeneration
}

func staleParseGeneration(expected int64, current *int64) error {
	return &staleParseGenerationError{expected: expected, current: current}
}

func lockExpectedParseGeneration(ctx context.Context, db database.Store, logID uuid.UUID, expected int64) error {
	generation, err := db.LockWoWLogGroupParseGeneration(ctx, logID)
	if errors.Is(err, pgx.ErrNoRows) {
		return staleParseGeneration(expected, nil)
	}
	if err == nil && generation != expected {
		return staleParseGeneration(expected, &generation)
	}
	return err
}

func (c *Chronicle) abortStaleParseGeneration(ctx context.Context, logID uuid.UUID, jobGeneration int64, checkpoint string, staleErr error) error {
	expected := effectiveParseGeneration(jobGeneration)
	var current *int64
	var generationErr *staleParseGenerationError
	if errors.As(staleErr, &generationErr) {
		expected = generationErr.expected
		current = generationErr.current
	}
	output := parseGenerationAbortOutput{
		Status:             "aborted",
		Reason:             staleParseGenerationReason,
		JobGeneration:      jobGeneration,
		ExpectedGeneration: expected,
		CurrentGeneration:  current,
		Checkpoint:         checkpoint,
	}
	logger := c.logger
	if logger == nil {
		logger = slog.Default()
	}
	attrs := []any{
		"log_group_id", logID,
		"status", output.Status,
		"reason", output.Reason,
		"job_generation", output.JobGeneration,
		"expected_generation", output.ExpectedGeneration,
		"checkpoint", output.Checkpoint,
	}
	if current != nil {
		attrs = append(attrs, "current_generation", *current)
	}
	logger.WarnContext(ctx, "aborted stale parse generation", attrs...)

	recorder := c.recordParseAbort
	if recorder == nil {
		recorder = func(ctx context.Context, output parseGenerationAbortOutput) error {
			return river.RecordOutput(ctx, output)
		}
	}
	if err := recorder(ctx, output); err != nil {
		logger.WarnContext(ctx, "failed to record stale parse generation output", "error", err, "log_group_id", logID)
	}
	return nil
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
			return staleParseGeneration(generation, &generation)
		}
		return err
	}, nil)
}
