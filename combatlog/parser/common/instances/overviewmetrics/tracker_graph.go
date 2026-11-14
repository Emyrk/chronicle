package overviewmetrics

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type trackerGraphState struct {
	Units        string          `json:"units"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

// RegisterGraphOwner binds the leaf codec to the canonical units owner without replaying hooks.
func RegisterGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[Tracker]{
		Type: "overviewmetrics.Tracker-graph", Version: 1, Init: func() *Tracker { return new(Tracker) },
		Capture: func(t *Tracker, c *ownergraph.Capture) ([]byte, error) {
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
			return json.Marshal(trackerGraphState{units, TrackerStateVersion, payload})
		},
		Restore: func(t *Tracker, v uint32, b []byte, c *ownergraph.Restore) error {
			if v != 1 {
				return fmt.Errorf("unsupported Tracker graph version %d", v)
			}
			if err := decodeGraphEnvelope(b, "units", "state_version", "state"); err != nil {
				return err
			}
			var value trackerGraphState
			if err := json.Unmarshal(b, &value); err != nil {
				return err
			}
			state, err := DecodeTrackerState(value.StateVersion, value.State)
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
func (t *Tracker) GraphUnits() *unitdb.Units { return t.units }
