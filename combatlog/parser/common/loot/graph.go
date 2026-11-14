package loot

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

// RegisterGraphOwners registers the tracker and shared loot observations. Restore
// never calls Finalize or Insert: unresolved names remain unresolved.
func RegisterGraphOwners(r *ownergraph.Registry) error {
	if err := ownergraph.Register(r, ownergraph.Codec[FinalLoot]{Type: "loot.FinalLoot", Version: 1, Init: func() *FinalLoot { return new(FinalLoot) },
		Capture: func(v *FinalLoot, _ *ownergraph.Capture) ([]byte, error) { return json.Marshal(v) },
		Restore: func(v *FinalLoot, version uint32, b []byte, _ *ownergraph.Restore) error {
			if version != 1 {
				return fmt.Errorf("unsupported loot observation version %d", version)
			}
			if err := validateFields(b, "Source", "SourceName", "SourceTS", "Received", "ReceivedName", "ReceivedTS", "ItemName", "ItemID", "LootSuffix", "Quantity"); err != nil {
				return err
			}
			return json.Unmarshal(b, v)
		}}); err != nil {
		return err
	}
	return ownergraph.Register(r, ownergraph.Codec[LootTracker]{Type: "loot.tracker-graph", Version: 1, Init: func() *LootTracker { return new(LootTracker) },
		Capture: func(t *LootTracker, c *ownergraph.Capture) ([]byte, error) {
			s, err := t.CaptureState(func(v *FinalLoot) (string, error) { return c.Ref(v) })
			if err != nil {
				return nil, err
			}
			units, err := c.Ref(t.units)
			if err != nil {
				return nil, err
			}
			b, err := s.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(trackerGraphState{units, TrackerStateVersion, b})
		},
		Restore: func(t *LootTracker, v uint32, b []byte, c *ownergraph.Restore) error {
			if v != 1 {
				return fmt.Errorf("unsupported loot graph version %d", v)
			}
			if err := validateFields(b, "units", "state_version", "state"); err != nil {
				return err
			}
			var value trackerGraphState
			if err := json.Unmarshal(b, &value); err != nil {
				return err
			}
			s, err := DecodeTrackerState(value.StateVersion, value.State)
			if err != nil {
				return err
			}
			units, err := ownergraph.Loader[*unitdb.Units](c)(value.Units)
			if err != nil {
				return err
			}
			fresh, err := s.Restore(units, ownergraph.Loader[*FinalLoot](c))
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		}})
}

// GraphUnits returns the canonical dependency for aggregate validation.
func (t *LootTracker) GraphUnits() *unitdb.Units { return t.units }
