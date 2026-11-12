package instances

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"maps"
	"slices"
)

const PhaseTrackerStateType = "instances.PhaseTracker"
const PhaseTrackerStateVersion uint32 = 1

type PhaseTrackerState struct{ value phaseTrackerValue }
type phaseTrackerValue struct {
	Definitions phases.EncounterPhases `json:"definitions"`
	Source      guid.GUID              `json:"source"`
	ByKey       map[string]int         `json:"by_key"`
	Current     int                    `json:"current"`
	Phases      []encounter.Phase      `json:"phases"`
	FightStart  json.RawMessage        `json:"fight_start"`
}

func InitPhaseTracker() *phaseTracker { return new(phaseTracker) }
func (v phaseTrackerValue) validate() error {
	if len(v.Definitions.Definitions) == 0 || v.ByKey == nil || len(v.ByKey) != len(v.Definitions.Definitions) || v.Current < 0 || v.Current >= len(v.Definitions.Definitions) || len(v.Phases) != v.Current+1 {
		return fmt.Errorf("invalid phase tracker shape")
	}
	for i, d := range v.Definitions.Definitions {
		index, ok := v.ByKey[d.Key]
		if d.Key == "" || d.Order != i || !ok || index != i {
			return fmt.Errorf("phase definition index mismatch")
		}
	}
	for i, p := range v.Phases {
		d := v.Definitions.Definitions[i]
		if p.Key != d.Key || p.Name != d.Name || p.Order != d.Order {
			return fmt.Errorf("materialized phase definition mismatch")
		}
	}
	_, e := period.DecodeMomentState(period.MomentStateVersion, v.FightStart)
	return e
}
func (p *phaseTracker) CaptureState(message func(messages.Message) (string, error)) (PhaseTrackerState, error) {
	if p == nil || p.defs == nil {
		return PhaseTrackerState{}, fmt.Errorf("nil phase tracker/definitions")
	}
	m, e := period.CaptureMoment(&p.fightStart, message)
	if e != nil {
		return PhaseTrackerState{}, e
	}
	data, e := m.Encode()
	if e != nil {
		return PhaseTrackerState{}, e
	}
	defs := *p.defs
	defs.Definitions = slices.Clone(defs.Definitions)
	v := phaseTrackerValue{defs, p.sourceGUID, maps.Clone(p.defByKey), p.currentDefIdx, slices.Clone(p.phases), data}
	if e := v.validate(); e != nil {
		return PhaseTrackerState{}, e
	}
	return PhaseTrackerState{v}, nil
}
func (s PhaseTrackerState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodePhaseTrackerState(version uint32, payload []byte) (PhaseTrackerState, error) {
	if version != PhaseTrackerStateVersion {
		return PhaseTrackerState{}, fmt.Errorf("unsupported phase tracker version")
	}
	var v phaseTrackerValue
	if e := decodeLeafValue(payload, &v); e != nil {
		return PhaseTrackerState{}, e
	}
	if e := v.validate(); e != nil {
		return PhaseTrackerState{}, e
	}
	return PhaseTrackerState{v}, nil
}

// RestoreState injects matching trusted definitions and resolves the retained
// fight-start message. No phase is opened, UUID generated or transition emitted.
func (p *phaseTracker) RestoreState(s PhaseTrackerState, defs *phases.EncounterPhases, message func(string) (messages.Message, error)) error {
	if p == nil || defs == nil {
		return fmt.Errorf("missing phase tracker destination/definitions")
	}
	if e := s.value.validate(); e != nil {
		return e
	}
	v := s.value
	if defs.EncounterName != v.Definitions.EncounterName || !slices.Equal(defs.Definitions, v.Definitions.Definitions) {
		return fmt.Errorf("phase definition recipe mismatch")
	}
	state, e := period.DecodeMomentState(period.MomentStateVersion, v.FightStart)
	if e != nil {
		return e
	}
	start, e := state.Restore(message)
	if e != nil {
		return e
	}
	if start.Timestamp == nil {
		return fmt.Errorf("missing fight-start timestamp")
	}
	*p = phaseTracker{defs: defs, sourceGUID: v.Source, defByKey: maps.Clone(v.ByKey), currentDefIdx: v.Current, phases: slices.Clone(v.Phases), fightStart: *start}
	return nil
}
