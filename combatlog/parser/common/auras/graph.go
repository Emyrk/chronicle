package auras

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const projectionGraphVersion uint32 = 1

type GraphOptions struct {
	DurationModifiers *chrondbc.DurationModifierSet
}

type projectionGraphState struct {
	Tracker      string          `json:"tracker"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

func RegisterGraphOwners(r *ownergraph.Registry, options GraphOptions) error {
	if options.DurationModifiers != nil {
		return fmt.Errorf("aura graph snapshots do not support non-default duration modifiers without session compatibility metadata")
	}
	if err := ownergraph.Register(r, ownergraph.Codec[Tracking]{
		Type: TrackingStateType, Version: TrackingStateVersion,
		Init: func() *Tracking { return new(Tracking) },
		Capture: func(t *Tracking, c *ownergraph.Capture) ([]byte, error) {
			if t.mods != nil {
				return nil, fmt.Errorf("aura graph snapshots do not support non-default duration modifiers without session compatibility metadata")
			}
			state, err := t.CaptureState(ownergraph.Reference[*chrondbc.Spell](c))
			if err != nil {
				return nil, err
			}
			return state.Encode()
		},
		Restore: func(t *Tracking, version uint32, payload []byte, c *ownergraph.Restore) error {
			state, err := DecodeTrackingState(version, payload)
			if err != nil {
				return err
			}
			fresh, err := state.Restore(options.DurationModifiers, ownergraph.Loader[*chrondbc.Spell](c))
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		},
		Validate: func(t *Tracking) error {
			if len(t.observers) != 0 {
				return fmt.Errorf("aura tracking callbacks require separate runtime wiring")
			}
			return nil
		},
	}); err != nil {
		return err
	}
	return ownergraph.Register(r, ownergraph.Codec[Projection]{
		Type: ProjectionStateType, Version: projectionGraphVersion,
		Init: func() *Projection { return new(Projection) },
		Capture: func(p *Projection, c *ownergraph.Capture) ([]byte, error) {
			tracker, err := c.Ref(p.tracker)
			if err != nil {
				return nil, err
			}
			state, err := p.CaptureState(ownergraph.Reference[*chrondbc.Spell](c))
			if err != nil {
				return nil, err
			}
			payload, err := state.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(projectionGraphState{Tracker: tracker, StateVersion: ProjectionStateVersion, State: payload})
		},
		Restore: func(p *Projection, version uint32, payload []byte, c *ownergraph.Restore) error {
			if version != projectionGraphVersion {
				return fmt.Errorf("unsupported aura projection graph version %d", version)
			}
			var value projectionGraphState
			if err := decodeProjectionGraphState(payload, &value); err != nil {
				return err
			}
			tracker, err := ownergraph.LoadAs[*Tracking](c, value.Tracker)
			if err != nil {
				return err
			}
			state, err := DecodeProjectionState(value.StateVersion, value.State)
			if err != nil {
				return err
			}
			fresh, err := state.Restore(tracker, ownergraph.Loader[*chrondbc.Spell](c))
			if err != nil {
				return err
			}
			*p = *fresh
			return nil
		},
		Validate: func(p *Projection) error {
			if p.tracker == nil {
				return fmt.Errorf("aura projection requires canonical tracking")
			}
			if p.emit != nil {
				return fmt.Errorf("aura projection callback requires separate runtime wiring")
			}
			return nil
		},
	})
}

func decodeProjectionGraphState(payload []byte, value *projectionGraphState) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	if len(fields) != 3 || len(fields["tracker"]) == 0 || len(fields["state_version"]) == 0 || len(fields["state"]) == 0 {
		return fmt.Errorf("invalid aura projection graph envelope")
	}
	if err := decodeJSON(payload, value); err != nil {
		return err
	}
	if value.Tracker == "" || !json.Valid(value.State) {
		return fmt.Errorf("invalid aura projection graph dependencies")
	}
	return nil
}

func (p *Projection) GraphTracking() *Tracking { return p.tracker }

// WireGraphRuntime attaches callbacks only after the full graph has restored and
// validated. Restore itself never mutates the tracker's observer order.
func (p *Projection) WireGraphRuntime(emit func(*messages.Aura)) {
	p.SetEmit(emit)
	p.AttachObserver()
}
