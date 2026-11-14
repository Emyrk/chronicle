package rankings

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type speedrunGraphState struct {
	Units        string          `json:"units"`
	Engagement   string          `json:"engagement"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

// RegisterSpeedrunGraphOwner accepts only trusted configuration recipes. Rules
// are copied at registration; persisted data selects a recipe by its leaf hash.
func RegisterSpeedrunGraphOwner(r *ownergraph.Registry, rules []SpeedrunRules) error {
	recipes := map[string]SpeedrunRules{}
	for _, rule := range rules {
		b, err := json.Marshal(rule)
		if err != nil {
			return err
		}
		var copy SpeedrunRules
		if err := json.Unmarshal(b, &copy); err != nil {
			return err
		}
		copy.ReentryGap = rule.ReentryGap
		hash, err := speedrunConfigSHA256(copy)
		if err != nil {
			return err
		}
		recipes[hash] = copy
	}
	return ownergraph.Register(r, ownergraph.Codec[SpeedrunTracker]{Type: "rankings.speedrun-graph", Version: 1, Init: func() *SpeedrunTracker { return new(SpeedrunTracker) },
		Capture: func(t *SpeedrunTracker, c *ownergraph.Capture) ([]byte, error) {
			s, err := t.CaptureState()
			if err != nil {
				return nil, err
			}
			if _, ok := recipes[s.value.ConfigSHA256]; !ok {
				return nil, fmt.Errorf("unregistered speedrun rules")
			}
			var units, engagement string
			if t.units != nil {
				units, err = c.Ref(t.units)
				if err != nil {
					return nil, err
				}
			}
			if t.engagement != nil {
				engagement, err = c.Ref(t.engagement)
				if err != nil {
					return nil, err
				}
			}
			b, err := s.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(speedrunGraphState{units, engagement, SpeedrunTrackerStateVersion, b})
		},
		Restore: func(t *SpeedrunTracker, v uint32, b []byte, c *ownergraph.Restore) error {
			if v != 1 {
				return fmt.Errorf("unsupported speedrun graph version %d", v)
			}
			if err := decodeGraphEnvelope(b, "units", "engagement", "state_version", "state"); err != nil {
				return err
			}
			var value speedrunGraphState
			if err := json.Unmarshal(b, &value); err != nil {
				return err
			}
			s, err := DecodeSpeedrunTrackerState(value.StateVersion, value.State)
			if err != nil {
				return err
			}
			rules, ok := recipes[s.value.ConfigSHA256]
			if !ok {
				return fmt.Errorf("unregistered speedrun rules")
			}
			var units *unitdb.Units
			var engagement *EngagementTracker
			if value.Units != "" {
				units, err = ownergraph.Loader[*unitdb.Units](c)(value.Units)
				if err != nil {
					return err
				}
			}
			if value.Engagement != "" {
				engagement, err = ownergraph.Loader[*EngagementTracker](c)(value.Engagement)
				if err != nil {
					return err
				}
			}
			fresh, err := s.Restore(rules, units, engagement)
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		}, Validate: func(t *SpeedrunTracker) error {
			if t.engagement != nil && t.engagement.units != t.units {
				return fmt.Errorf("speedrun and engagement units differ")
			}
			return nil
		}})
}

// GraphUnits returns the canonical dependency for aggregate validation.
func (t *SpeedrunTracker) GraphUnits() *unitdb.Units { return t.units }

// GraphEngagement returns the canonical dependency for aggregate validation.
func (t *SpeedrunTracker) GraphEngagement() *EngagementTracker { return t.engagement }
