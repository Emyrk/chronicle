package instances

import (
	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// phaseTracker maintains live encounter phase state. Phases are materialized
// immediately as transitions are received rather than compiled at finalization.
type phaseTracker struct {
	defs       *phases.EncounterPhases
	sourceGUID guid.GUID

	// defByKey maps Definition.Key → index in defs.Definitions.
	defByKey map[string]int

	// currentDefIdx is the index of the currently-open phase definition.
	currentDefIdx int

	// phases holds all materialized phases. The last entry is the currently
	// open phase (its EndOffsetMs is not yet final).
	phases []encounter.Phase

	// fightStart is the encounter start time, used to compute offsets.
	fightStart period.Moment
}

// newPhaseTracker initializes a tracker and opens Phase 1 at fightStart.
// Returns nil if defs is nil, has no definitions, or definitions are invalid.
func newPhaseTracker(
	defs *phases.EncounterPhases,
	sourceGUID guid.GUID,
	fightStart period.Moment,
) *phaseTracker {
	if defs == nil || len(defs.Definitions) == 0 {
		return nil
	}

	defByKey := make(map[string]int, len(defs.Definitions))
	for i, def := range defs.Definitions {
		if def.Order != i || def.Key == "" {
			return nil
		}
		if _, exists := defByKey[def.Key]; exists {
			return nil
		}
		defByKey[def.Key] = i
	}

	first := defs.Definitions[0]

	pt := &phaseTracker{
		defs:          defs,
		sourceGUID:    sourceGUID,
		defByKey:      defByKey,
		currentDefIdx: 0,
		fightStart:    fightStart,
		phases: []encounter.Phase{
			{
				ID:            uuid.New(),
				Key:           first.Key,
				Name:          first.Name,
				Order:         first.Order,
				StartOffsetMs: 0,
				// EndOffsetMs left at 0 until closed.
			},
		},
	}
	return pt
}

// transition attempts to apply a phase transition. It validates:
//   - SourceGUID matches
//   - ToPhaseKey is known and is the next sequential phase
//   - Timestamp is strictly after fight start and after or equal to current phase start
//
// On success it closes the current phase and opens the next, returning true.
// The triggering event belongs to the new phase.
func (pt *phaseTracker) transition(t phases.Transition) bool {
	if pt == nil {
		return false
	}

	if t.SourceGUID != pt.sourceGUID {
		return false
	}

	defIdx, known := pt.defByKey[t.ToPhaseKey]
	if !known || defIdx != pt.currentDefIdx+1 {
		return false
	}

	ts := t.Timestamp
	fightStartTime := pt.fightStart.Timestamp.Date()

	// Must be strictly after fight start.
	if !ts.After(fightStartTime) {
		return false
	}

	offsetMs := ts.Sub(fightStartTime).Milliseconds()

	// A transition must leave the current phase with a non-empty range.
	current := &pt.phases[len(pt.phases)-1]
	if offsetMs <= current.StartOffsetMs {
		return false
	}

	// Close current phase at the transition timestamp.
	current.EndOffsetMs = offsetMs
	current.KillType = encounter.KillTypeClean

	// Open next phase.
	nextDef := pt.defs.Definitions[defIdx]
	pt.phases = append(pt.phases, encounter.Phase{
		ID:            uuid.New(),
		Key:           nextDef.Key,
		Name:          nextDef.Name,
		Order:         nextDef.Order,
		StartOffsetMs: offsetMs,
	})
	pt.currentDefIdx = defIdx
	return true
}

// close finalizes the tracker by closing the current (final) phase at fightEnd.
// The final phase receives the given killType; all prior phases retain KillTypeClean.
func (pt *phaseTracker) close(fightEnd period.Moment, killType encounter.KillType) {
	if pt == nil || len(pt.phases) == 0 {
		return
	}
	endOffset := fightEnd.Timestamp.Date().Sub(pt.fightStart.Timestamp.Date()).Milliseconds()
	last := &pt.phases[len(pt.phases)-1]
	if len(pt.phases) > 1 && last.StartOffsetMs >= endOffset {
		// A transition on or after the fight-ending timestamp would create an
		// empty final phase. Roll it back and close the previous phase instead.
		pt.phases = pt.phases[:len(pt.phases)-1]
		pt.currentDefIdx--
		last = &pt.phases[len(pt.phases)-1]
	}
	last.EndOffsetMs = endOffset
	last.KillType = killType
}

func (pt *phaseTracker) encounterName() string {
	if pt == nil || pt.defs == nil {
		return ""
	}
	return pt.defs.EncounterName
}

// materialized returns a copy of the phases built so far.
func (pt *phaseTracker) materialized() []encounter.Phase {
	if pt == nil || len(pt.phases) == 0 {
		return nil
	}
	result := make([]encounter.Phase, len(pt.phases))
	copy(result, pt.phases)
	return result
}

// currentPhase returns the currently-open phase, if any.
func (pt *phaseTracker) currentPhase() *encounter.Phase {
	if pt == nil || len(pt.phases) == 0 {
		return nil
	}
	return &pt.phases[len(pt.phases)-1]
}
