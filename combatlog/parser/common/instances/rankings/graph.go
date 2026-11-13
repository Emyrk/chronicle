package rankings

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const dpsGraphType = "rankings.dps-graph"
const dpsGraphVersion uint32 = 1

type dpsGraphState struct {
	Units        string          `json:"units"`
	Identifier   string          `json:"identifier"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

// RegisterDPSGraphOwner connects the existing DPS codec to its actual units,
// identifier and retained Damage owners. It does not wire hooks or finalize.
func RegisterDPSGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[DPSTracker]{
		Type: dpsGraphType, Version: dpsGraphVersion,
		Init: func() *DPSTracker { return new(DPSTracker) },
		Capture: func(t *DPSTracker, c *ownergraph.Capture) ([]byte, error) {
			units, err := c.Ref(t.units)
			if err != nil {
				return nil, err
			}
			var idf string
			if t.identifier != nil {
				idf, err = c.Ref(t.identifier)
				if err != nil {
					return nil, err
				}
			}
			state, err := t.CaptureState(func(d *messages.Damage) (string, error) { return c.Ref(d) })
			if err != nil {
				return nil, err
			}
			payload, err := state.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(dpsGraphState{Units: units, Identifier: idf, StateVersion: DPSTrackerStateVersion, State: payload})
		},
		Restore: func(t *DPSTracker, version uint32, payload []byte, c *ownergraph.Restore) error {
			if version != dpsGraphVersion {
				return fmt.Errorf("unsupported DPS graph version %d", version)
			}
			if err := validateUniqueJSON(payload); err != nil {
				return err
			}
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(payload, &fields); err != nil {
				return err
			}
			if len(fields) != 4 || len(fields["units"]) == 0 || len(fields["identifier"]) == 0 || len(fields["state"]) == 0 || len(fields["state_version"]) == 0 {
				return fmt.Errorf("invalid DPS graph envelope")
			}
			var value dpsGraphState
			if err := json.Unmarshal(payload, &value); err != nil {
				return err
			}
			if value.Units == "" || string(fields["identifier"]) == "null" {
				return fmt.Errorf("invalid DPS graph dependencies")
			}
			state, err := DecodeDPSTrackerState(value.StateVersion, value.State)
			if err != nil {
				return err
			}
			units, err := ownergraph.Loader[*unitdb.Units](c)(value.Units)
			if err != nil {
				return err
			}
			var idf *identifier.Identifier
			if value.Identifier != "" {
				idf, err = ownergraph.Loader[*identifier.Identifier](c)(value.Identifier)
				if err != nil {
					return err
				}
			}
			fresh, err := state.Restore(units, idf, ownergraph.Loader[*messages.Damage](c))
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		},
	})
}
