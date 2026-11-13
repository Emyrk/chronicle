package armory

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const graphVersion uint32 = 1

type graphState struct {
	Units        string          `json:"units"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

func RegisterGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[Tracker]{
		Type: StateType, Version: graphVersion,
		Init: func() *Tracker { return new(Tracker) },
		Capture: func(t *Tracker, c *ownergraph.Capture) ([]byte, error) {
			units, err := c.Ref(t.units)
			if err != nil {
				return nil, err
			}
			state, err := t.CaptureState()
			if err != nil {
				return nil, err
			}
			payload, err := state.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(graphState{Units: units, StateVersion: StateVersion, State: payload})
		},
		Restore: func(t *Tracker, version uint32, payload []byte, c *ownergraph.Restore) error {
			if version != graphVersion {
				return fmt.Errorf("unsupported armory graph version %d", version)
			}
			var value graphState
			if err := decodeArmoryGraphState(payload, &value); err != nil {
				return err
			}
			units, err := ownergraph.LoadAs[*unitdb.Units](c, value.Units)
			if err != nil {
				return err
			}
			state, err := DecodeState(value.StateVersion, value.State)
			if err != nil {
				return err
			}
			return t.RestoreState(state, units)
		},
		Validate: func(t *Tracker) error {
			if t.units == nil {
				return fmt.Errorf("armory requires canonical Units")
			}
			return nil
		},
	})
}

func decodeArmoryGraphState(payload []byte, value *graphState) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	if len(fields) != 3 || len(fields["units"]) == 0 || len(fields["state_version"]) == 0 || len(fields["state"]) == 0 {
		return fmt.Errorf("invalid armory graph envelope")
	}
	if err := decodeArmoryValue(payload, value); err != nil {
		return err
	}
	if value.Units == "" || !json.Valid(value.State) {
		return fmt.Errorf("invalid armory graph dependencies")
	}
	return nil
}

// GraphUnits exposes the canonical dependency for graph validation and tests;
// callers must not replace it after runtime composition.
func (t *Tracker) GraphUnits() *unitdb.Units { return t.units }
