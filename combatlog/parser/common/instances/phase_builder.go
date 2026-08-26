package instances

import (
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// buildEncounterPhases converts ordered definitions and character-emitted
// transitions into contiguous encounter-relative phase ranges.
func buildEncounterPhases(
	phaseDefs *phases.EncounterPhases,
	phaseSourceGUID guid.GUID,
	phaseTransitions []phases.Transition,
	fightStart time.Time,
	fightEnd time.Time,
	encounterKillType encounter.KillType,
) []encounter.Phase {
	if phaseDefs == nil || len(phaseDefs.Definitions) == 0 {
		return nil
	}

	defByKey := make(map[string]int, len(phaseDefs.Definitions))
	for i, def := range phaseDefs.Definitions {
		if def.Order != i || def.Key == "" {
			return nil
		}
		if _, exists := defByKey[def.Key]; exists {
			return nil
		}
		defByKey[def.Key] = i
	}

	type validTransition struct {
		defIdx    int
		timestamp time.Time
	}
	orderedTransitions := slices.Clone(phaseTransitions)
	slices.SortFunc(orderedTransitions, func(a, b phases.Transition) int {
		return a.Timestamp.Compare(b.Timestamp)
	})

	transitions := make([]validTransition, 0, len(orderedTransitions))
	currentDefIdx := 0
	for _, transition := range orderedTransitions {
		if transition.SourceGUID != phaseSourceGUID {
			continue
		}
		defIdx, known := defByKey[transition.ToPhaseKey]
		if !known || defIdx != currentDefIdx+1 {
			continue
		}
		if !transition.Timestamp.After(fightStart) || !transition.Timestamp.Before(fightEnd) {
			continue
		}
		currentDefIdx = defIdx
		transitions = append(transitions, validTransition{
			defIdx:    defIdx,
			timestamp: transition.Timestamp,
		})
	}

	firstDef := phaseDefs.Definitions[0]
	if len(transitions) == 0 {
		return []encounter.Phase{encounter.PhaseFromTimes(
			uuid.New(), firstDef.Key, firstDef.Name, firstDef.Order,
			encounterKillType,
			fightStart, fightStart, fightEnd,
		)}
	}

	result := make([]encounter.Phase, 0, len(transitions)+1)
	result = append(result, encounter.PhaseFromTimes(
		uuid.New(), firstDef.Key, firstDef.Name, firstDef.Order,
		encounter.KillTypeClean,
		fightStart, fightStart, transitions[0].timestamp,
	))

	for i := 0; i < len(transitions)-1; i++ {
		def := phaseDefs.Definitions[transitions[i].defIdx]
		result = append(result, encounter.PhaseFromTimes(
			uuid.New(), def.Key, def.Name, def.Order,
			encounter.KillTypeClean,
			fightStart, transitions[i].timestamp, transitions[i+1].timestamp,
		))
	}

	lastTransition := transitions[len(transitions)-1]
	lastDef := phaseDefs.Definitions[lastTransition.defIdx]
	result = append(result, encounter.PhaseFromTimes(
		uuid.New(), lastDef.Key, lastDef.Name, lastDef.Order,
		encounterKillType,
		fightStart, lastTransition.timestamp, fightEnd,
	))
	return result
}
