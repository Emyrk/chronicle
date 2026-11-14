package instances

import (
	"fmt"
	"reflect"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// RegisterPhaseTrackerGraphOwner binds phase state to caller-supplied trusted
// definitions. The immutable recipes must remain stable for this registry's life.
// Restoration loads retained messages without opening phases or emitting transitions.
func RegisterPhaseTrackerGraphOwner(r *ownergraph.Registry, definitions map[string]*phases.EncounterPhases) error {
	return ownergraph.Register(r, ownergraph.Codec[phaseTracker]{
		Type: PhaseTrackerStateType, Version: PhaseTrackerStateVersion,
		Init: InitPhaseTracker,
		Capture: func(p *phaseTracker, c *ownergraph.Capture) ([]byte, error) {
			if p.defs == nil || !reflect.DeepEqual(definitions[p.defs.EncounterName], p.defs) {
				return nil, fmt.Errorf("phase definition recipe mismatch")
			}
			state, err := p.CaptureState(ownergraph.Reference[messages.Message](c))
			if err != nil {
				return nil, err
			}
			return state.Encode()
		},
		Restore: func(p *phaseTracker, version uint32, data []byte, c *ownergraph.Restore) error {
			state, err := DecodePhaseTrackerState(version, data)
			if err != nil {
				return err
			}
			return p.RestoreState(state, definitions[state.value.Definitions.EncounterName], ownergraph.Loader[messages.Message](c))
		},
	})
}
