package engine

import (
	"context"
	"time"
)

// Step exposes a single poll to tests.
func (e *Engine) Step(ctx context.Context, now time.Time, manual bool) { e.step(ctx, now, manual) }

// Busy reports whether the upload worker has work queued or in flight.
func (e *Engine) Busy() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.busy()
}
