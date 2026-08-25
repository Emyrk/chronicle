package encounter

import (
	"time"

	"github.com/google/uuid"
)

// Phase represents a named sub-range within an encounter.
// Offsets are relative to the encounter's start time.
type Phase struct {
	// ID is a stable UUID for this phase.
	ID uuid.UUID
	// Key is a machine-readable identifier (e.g. "razorgore_p1").
	Key string
	// Name is a human-readable label (e.g. "Phase 1 – Adds").
	Name string
	// Order is the display order (0-based).
	Order int
	// StartOffsetMs is the phase start in milliseconds from encounter start.
	StartOffsetMs int64
	// EndOffsetMs is the phase end in milliseconds from encounter start.
	EndOffsetMs int64
}

// PhaseFromTimes builds a Phase with offsets computed from absolute timestamps
// relative to the encounter start.
func PhaseFromTimes(id uuid.UUID, key, name string, order int, encounterStart, phaseStart, phaseEnd time.Time) Phase {
	return Phase{
		ID:            id,
		Key:           key,
		Name:          name,
		Order:         order,
		StartOffsetMs: phaseStart.Sub(encounterStart).Milliseconds(),
		EndOffsetMs:   phaseEnd.Sub(encounterStart).Milliseconds(),
	}
}
