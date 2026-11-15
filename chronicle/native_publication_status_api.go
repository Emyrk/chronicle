package chronicle

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// NativePublicationPending exposes only the replacement-work signal. Callers must
// authorize their instance first and pass its associated log group using the same
// tenant context; this does not read private log-group contents or elevate access.
func (c *Chronicle) NativePublicationPending(ctx context.Context, logGroupID uuid.UUID) (bool, error) {
	state, err := c.Zed.GetParserHandoff(ctx, logGroupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("fetch publication state: %w", err)
	}
	if !state.NativeEnabled {
		return false, nil
	}
	jobs, err := c.ListLogGroupJobs(ctx, logGroupID)
	if err != nil {
		return false, fmt.Errorf("fetch publication jobs: %w", err)
	}
	return nativePublicationPending(state, jobs.Jobs), nil
}
