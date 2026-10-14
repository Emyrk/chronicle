package engine

import (
	"context"
	"time"
)

// Step exposes a single poll to tests.
func (e *Engine) Step(ctx context.Context, now time.Time, manual bool) { e.step(ctx, now, manual) }
