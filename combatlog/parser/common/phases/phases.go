// Package phases defines encounter phase definitions and transition signals.
// It lives under common/ to avoid import cycles between characters and encounter
// packages. Specialized characters declare phase definitions and emit transitions;
// hookable builds the final Phase ranges at encounter finalization.
package phases

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// Definition describes a single phase within an encounter.
// Definitions are ordered: Order 0 is always the first phase.
type Definition struct {
	// Key is a machine-readable identifier (e.g. "razorgore_p1").
	Key string
	// Name is a short human-readable label (e.g. "Adds").
	Name string
	// Order is the 0-based display/sequence order.
	Order int
}

// EncounterPhases binds an encounter name to its ordered phase list.
type EncounterPhases struct {
	// EncounterName is the encounter these phases apply to (e.g. "Razorgore the Untamed").
	EncounterName string
	// Definitions are the ordered phases. Must have len >= 2 for transitions to matter.
	Definitions []Definition
}

// Transition records a phase boundary event emitted by a specialized character.
type Transition struct {
	// SourceGUID is the creature that triggered the transition.
	SourceGUID guid.GUID
	// ToPhaseKey is the Definition.Key of the phase being entered.
	ToPhaseKey string
	// Timestamp is when the transition occurred.
	Timestamp time.Time
}

// PhaseProvider is implemented by characters (or their wrappers) that declare
// encounter phase definitions. The hookable checks participating hostiles for
// this interface at finalization time.
type PhaseProvider interface {
	// PhaseDefinitions returns the encounter phase definitions this character
	// provides, or nil if it has none.
	PhaseDefinitions() *EncounterPhases
}

// TransitionCallback is the signature for the function that characters call
// to emit a phase transition. Hookable installs this on Characters.
type TransitionCallback func(t Transition)
