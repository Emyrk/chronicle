package rankings

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type engagementTrackerGraphState struct {
	Units        string          `json:"units"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

// RegisterEngagementGraphOwner binds the leaf codec to the canonical units owner without replaying hooks.
func RegisterEngagementGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[EngagementTracker]{
		Type: "rankings.EngagementTracker-graph", Version: 1, Init: func() *EngagementTracker { return new(EngagementTracker) },
		Capture: func(t *EngagementTracker, c *ownergraph.Capture) ([]byte, error) {
			state, err := t.CaptureState()
			if err != nil {
				return nil, err
			}
			units, err := c.Ref(t.units)
			if err != nil {
				return nil, err
			}
			payload, err := state.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(engagementTrackerGraphState{units, EngagementTrackerStateVersion, payload})
		},
		Restore: func(t *EngagementTracker, v uint32, b []byte, c *ownergraph.Restore) error {
			if v != 1 {
				return fmt.Errorf("unsupported EngagementTracker graph version %d", v)
			}
			if err := decodeGraphEnvelope(b, "units", "state_version", "state"); err != nil {
				return err
			}
			var value engagementTrackerGraphState
			if err := json.Unmarshal(b, &value); err != nil {
				return err
			}
			state, err := DecodeEngagementTrackerState(value.StateVersion, value.State)
			if err != nil {
				return err
			}
			units, err := ownergraph.Loader[*unitdb.Units](c)(value.Units)
			if err != nil {
				return err
			}
			fresh, err := state.Restore(units)
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		},
	})
}

// GraphUnits returns the canonical dependency for aggregate validation.
func (t *EngagementTracker) GraphUnits() *unitdb.Units { return t.units }
