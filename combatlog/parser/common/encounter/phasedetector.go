package encounter

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// PhaseDetector processes combat messages during an active fight and emits
// phases when the encounter is finalized. Implementations are stateful and
// must be reset between fights via Reset().
type PhaseDetector interface {
	// EncounterName returns the encounter name this detector applies to.
	EncounterName() string
	// ProcessMessage is called for every message during an active fight.
	ProcessMessage(m messages.Message)
	// Finalize returns the detected phases for the completed encounter.
	// It is called once when the encounter is complete.
	Finalize(encounterStart, encounterEnd time.Time) []Phase
	// Reset clears all state for a new fight.
	Reset()
}

// PhaseDetectorFactory creates a PhaseDetector. All detectors process every
// message during a fight; at finalization only the detector whose
// EncounterName() matches is used.
type PhaseDetectorFactory func() PhaseDetector
